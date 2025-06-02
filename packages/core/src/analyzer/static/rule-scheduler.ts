/**
 * 规则调度器 - 根据优先级和资源限制调度规则执行
 */
import type { IRule, TRuleContext, TRuleResult, TAST } from '../../types';
import { RulePriority, IRuleSchedulerConfig, DEFAULT_SCHEDULER_CONFIG } from './rules-config';

/**
 * 规则任务类型
 */
interface RuleTask {
  rule: IRule;
  priority: RulePriority;
  weight: number;
  ast: TAST;
  context: TRuleContext;
  timestamp: number;
}

/**
 * 规则执行结果
 */
interface RuleExecutionResult {
  ruleId: string;
  results: TRuleResult[];
  executionTimeMs: number;
}

/**
 * 规则调度器
 * 负责根据规则优先级和系统资源进行调度执行
 */
export class RuleScheduler {
  private config: IRuleSchedulerConfig;
  private taskQueue: RuleTask[] = [];
  private runningTasks: Set<string> = new Set();
  private maxConcurrentTasks: number;

  constructor(config?: Partial<IRuleSchedulerConfig>) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.maxConcurrentTasks = this.config.maxConcurrentRules || 5;
  }

  /**
   * 将规则添加到执行队列
   * @param rule 规则对象
   * @param ast AST对象
   * @param context 规则上下文
   */
  scheduleRule(rule: IRule, ast: TAST, context: TRuleContext): void {
    // 根据规则严重性确定优先级
    const priority = this.mapSeverityToPriority(rule.severity);

    // 获取该优先级的权重
    const weight = this.config.priorityWeights?.[priority] || 1;

    // 创建任务并添加到队列
    const task: RuleTask = {
      rule,
      priority,
      weight,
      ast,
      context,
      timestamp: Date.now(),
    };

    // 如果启用了优先级调度，则按优先级插入队列
    if (this.config.enablePriorityScheduling) {
      this.insertTaskByPriority(task);
    } else {
      // 否则简单地添加到队列末尾
      this.taskQueue.push(task);
    }
  }

  /**
   * 根据优先级将任务插入队列
   * @param task 规则任务
   */
  private insertTaskByPriority(task: RuleTask): void {
    let insertIndex = this.taskQueue.length;

    // 查找插入位置：优先级高的排在前面
    for (let i = 0; i < this.taskQueue.length; i++) {
      if (task.priority < this.taskQueue[i].priority) {
        insertIndex = i;
        break;
      }
    }

    // 在指定位置插入任务
    this.taskQueue.splice(insertIndex, 0, task);
  }

  /**
   * 将规则严重性映射到优先级
   * @param severity 规则严重性
   * @returns 对应的优先级
   */
  private mapSeverityToPriority(severity: string): RulePriority {
    switch (severity) {
      case 'critical':
        return RulePriority.CRITICAL;
      case 'high':
        return RulePriority.HIGH;
      case 'medium':
        return RulePriority.MEDIUM;
      case 'low':
        return RulePriority.LOW;
      case 'info':
        return RulePriority.INFO;
      default:
        return RulePriority.MEDIUM;
    }
  }

  /**
   * 执行队列中的规则任务
   * @param maxResults 最大结果数量，达到后停止执行
   * @returns 规则执行结果数组
   */
  async executeRules(maxResults: number = Number.MAX_SAFE_INTEGER): Promise<RuleExecutionResult[]> {
    const results: RuleExecutionResult[] = [];

    // 如果队列为空，直接返回空结果
    if (this.taskQueue.length === 0) {
      return results;
    }

    // 处理所有任务或达到最大结果数量
    while (this.taskQueue.length > 0 && results.length < maxResults) {
      // 获取可以执行的任务数量
      const availableSlots = this.maxConcurrentTasks - this.runningTasks.size;

      if (availableSlots <= 0) {
        // 达到并行执行上限，等待任务完成
        await new Promise((resolve) => setTimeout(resolve, 10));
        continue;
      }

      // 获取下一批可执行的任务
      const tasksToRun = this.taskQueue.splice(0, availableSlots);

      // 并行执行任务
      const executionPromises = tasksToRun.map((task) => this.executeRule(task));
      const executionResults = await Promise.all(executionPromises);

      // 收集结果
      results.push(...executionResults);
    }

    return results;
  }

  /**
   * 执行单个规则任务
   * @param task 规则任务
   * @returns 规则执行结果
   */
  private async executeRule(task: RuleTask): Promise<RuleExecutionResult> {
    const { rule, ast, context } = task;
    const ruleId = rule.id;

    // 记录任务开始执行
    this.runningTasks.add(ruleId);

    // 记录开始时间
    const startTime = Date.now();

    try {
      // 设置超时
      const timeoutPromise = new Promise<TRuleResult[]>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`规则执行超时: ${ruleId}`));
        }, this.config.timeoutMs || 30000);
      });

      // 执行规则
      const executionPromise = new Promise<TRuleResult[]>((resolve) => {
        try {
          // 规则检测
          Promise.resolve(rule.detect(ast, context))
            .then((ruleResults) => {
              resolve(Array.isArray(ruleResults) ? ruleResults : [ruleResults].filter(Boolean));
            })
            .catch((error) => {
              console.error(`规则执行错误 ${ruleId}:`, error);
              resolve([]);
            });
        } catch (error) {
          console.error(`规则执行错误 ${ruleId}:`, error);
          resolve([]);
        }
      });

      // 使用 Promise.race 实现超时控制
      const results = await Promise.race([executionPromise, timeoutPromise]);

      // 计算执行时间
      const executionTime = Date.now() - startTime;

      return {
        ruleId,
        results,
        executionTimeMs: executionTime,
      };
    } finally {
      // 任务执行完成，从运行集合中移除
      this.runningTasks.delete(ruleId);
    }
  }

  /**
   * 清空任务队列
   */
  clearQueue(): void {
    this.taskQueue = [];
  }

  /**
   * 获取当前队列长度
   * @returns 队列中的任务数量
   */
  getQueueLength(): number {
    return this.taskQueue.length;
  }

  /**
   * 获取当前运行中的任务数量
   * @returns 运行中的任务数量
   */
  getRunningTasksCount(): number {
    return this.runningTasks.size;
  }

  /**
   * 更新调度器配置
   * @param config 新的配置
   */
  updateConfig(config: Partial<IRuleSchedulerConfig>): void {
    this.config = { ...this.config, ...config };
    this.maxConcurrentTasks = this.config.maxConcurrentRules || 5;
  }
}
