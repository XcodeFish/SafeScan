import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import os from 'os';
import {
  ISchedulableTask,
  TaskPriority,
  TaskStatus,
  ISchedulerConfig,
  ISchedulerStats,
  IResourceUsage,
} from '../types/scheduler';
import { PriorityQueue } from './queue';
import { WorkerPool } from './worker';

/**
 * 默认调度器配置
 */
const DEFAULT_SCHEDULER_CONFIG: ISchedulerConfig = {
  worker: {
    maxWorkers: Math.max(os.cpus().length - 1, 1),
    idleTimeout: 60000,
    taskTimeout: 30000,
    enableScaling: true,
    resourceThreshold: 0.8,
  },
  queueCapacity: 1000,
  monitorInterval: 5000,
  enableDynamicPriority: true,
};

/**
 * 智能任务调度器
 * 整合优先级队列和工作线程池，实现基于资源的自适应调度
 */
export class Scheduler extends EventEmitter {
  private queue: PriorityQueue<ISchedulableTask>;
  private workerPool: WorkerPool;
  private config: ISchedulerConfig;
  private isProcessing: boolean = false;
  private monitorInterval?: NodeJS.Timeout;
  private stats: ISchedulerStats = {
    resources: {
      cpu: 0,
      memory: 0,
      activeWorkers: 0,
      pendingTasks: 0,
    },
    completedTasks: 0,
    failedTasks: 0,
    avgExecutionTime: 0,
    tasksByPriority: {} as Record<TaskPriority, number>,
  };
  private executionTimes: number[] = [];
  private taskResultsCache: Map<string, any> = new Map();

  /**
   * 创建调度器实例
   * @param config 调度器配置
   */
  constructor(config?: Partial<ISchedulerConfig>) {
    super();
    this.config = this.normalizeConfig(config);

    // 初始化优先级队列
    this.queue = new PriorityQueue<ISchedulableTask>();

    // 初始化工作线程池
    this.workerPool = new WorkerPool(this.config.worker);

    // 监听工作线程池资源使用情况
    this.workerPool.on('resource-usage', (usage: IResourceUsage) => {
      this.stats.resources = usage;
      this.emit('resource-update', usage);

      // 如果启用了动态优先级，根据资源使用情况调整任务优先级
      if (this.config.enableDynamicPriority && usage.cpu > 0.9) {
        this.adjustTaskPriorities();
      }
    });

    // 启动资源监控
    this.startMonitoring();
  }

  /**
   * 规范化调度器配置
   * @param config 用户提供的配置
   * @returns 合并后的配置
   */
  private normalizeConfig(config?: Partial<ISchedulerConfig>): ISchedulerConfig {
    if (!config) {
      return DEFAULT_SCHEDULER_CONFIG;
    }

    return {
      worker: {
        ...DEFAULT_SCHEDULER_CONFIG.worker,
        ...config.worker,
      },
      queueCapacity: config.queueCapacity ?? DEFAULT_SCHEDULER_CONFIG.queueCapacity,
      monitorInterval: config.monitorInterval ?? DEFAULT_SCHEDULER_CONFIG.monitorInterval,
      enableDynamicPriority:
        config.enableDynamicPriority ?? DEFAULT_SCHEDULER_CONFIG.enableDynamicPriority,
    };
  }

  /**
   * 提交任务到调度器
   * @param taskOrExecutor 任务对象或执行函数
   * @param options 任务选项
   * @returns 任务ID
   */
  public schedule<T = any>(
    taskOrExecutor: ISchedulableTask | (() => Promise<T>),
    options: {
      name?: string;
      priority?: TaskPriority;
      timeout?: number;
      resourceEstimation?: number;
      metadata?: Record<string, any>;
    } = {}
  ): string {
    // 检查队列容量
    if (this.queue.size() >= this.config.queueCapacity) {
      throw new Error(`调度队列已满 (${this.config.queueCapacity})`);
    }

    let task: ISchedulableTask;

    // 如果提供的是函数，创建一个任务对象
    if (typeof taskOrExecutor === 'function') {
      const execute = taskOrExecutor;
      task = {
        id: randomUUID(),
        name: options.name || '匿名任务',
        priority: options.priority || TaskPriority.MEDIUM,
        status: TaskStatus.PENDING,
        resourceEstimation: options.resourceEstimation || 50,
        timeout: options.timeout,
        metadata: options.metadata,
        execute: async () => execute(),
      };
    } else {
      task = taskOrExecutor;
      // 确保任务有ID
      if (!task.id) {
        task.id = randomUUID();
      }
    }

    // 添加到优先级队列
    this.queue.enqueue(task);
    this.stats.resources.pendingTasks = this.queue.size();

    // 更新任务优先级统计
    this.updateTaskPriorityStats();

    // 开始处理队列
    this.processQueue();

    // 返回任务ID
    return task.id;
  }

  /**
   * 处理队列中的任务
   * @private
   */
  private async processQueue(): Promise<void> {
    // 避免多次调用处理逻辑
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // 持续从队列中获取任务并执行，直到队列为空
      while (!this.queue.isEmpty()) {
        const task = this.queue.dequeue();

        if (!task) {
          break;
        }

        // 更新任务状态
        task.status = TaskStatus.RUNNING;

        // 记录开始时间
        const startTime = Date.now();

        try {
          // 调度任务到工作线程池
          const result = await this.workerPool.executeTask(task);

          // 缓存结果
          this.taskResultsCache.set(task.id, result);

          // 更新完成任务统计
          this.stats.completedTasks++;

          // 发出任务完成事件
          this.emit('task-completed', {
            taskId: task.id,
            result,
          });
        } catch (error) {
          // 更新失败任务统计
          this.stats.failedTasks++;

          // 发出任务失败事件
          this.emit('task-failed', {
            taskId: task.id,
            error,
          });

          // 更新任务状态
          task.status = TaskStatus.FAILED;
        }

        // 计算执行时间
        const executionTime = Date.now() - startTime;

        // 更新平均执行时间
        this.updateAvgExecutionTime(executionTime);

        // 更新任务优先级统计
        this.updateTaskPriorityStats();
      }
    } finally {
      this.isProcessing = false;

      // 如果在处理过程中有新任务入队，继续处理
      if (!this.queue.isEmpty()) {
        this.processQueue();
      }
    }
  }

  /**
   * 根据资源使用情况调整任务优先级
   * @private
   */
  private adjustTaskPriorities(): void {
    // 当CPU使用率高时，提高低资源消耗任务的优先级
    const workerStats = this.workerPool.getWorkerStats();

    // 如果所有工作线程都在使用中，考虑调整优先级
    if (workerStats.active === workerStats.total && workerStats.total > 1) {
      // 实现自适应优先级调整策略
      // 这里可以根据实际需求进行更复杂的调整
      // 当前简单实现：根据资源使用情况调整特定任务的优先级

      // 获取队列统计信息
      const queueStats = this.queue.getStats();

      // 如果有大量中等优先级任务，考虑将部分任务提升为高优先级
      if (queueStats[TaskPriority.MEDIUM] > 10 && queueStats[TaskPriority.HIGH] < 3) {
        // 发出优先级调整事件
        this.emit('priority-adjustment-needed', {
          fromPriority: TaskPriority.MEDIUM,
          toPriority: TaskPriority.HIGH,
          reason: 'resource-optimization',
        });
      }
    }
  }

  /**
   * 更新平均执行时间
   * @param executionTime 执行时间
   * @private
   */
  private updateAvgExecutionTime(executionTime: number): void {
    // 保持最近100个任务的执行时间
    this.executionTimes.push(executionTime);

    if (this.executionTimes.length > 100) {
      this.executionTimes.shift();
    }

    // 计算平均值
    const sum = this.executionTimes.reduce((total, time) => total + time, 0);
    this.stats.avgExecutionTime = Math.round(sum / this.executionTimes.length);
  }

  /**
   * 更新任务优先级统计
   * @private
   */
  private updateTaskPriorityStats(): void {
    // 获取队列各优先级任务数量
    const queueStats = this.queue.getStats();
    this.stats.tasksByPriority = queueStats;
  }

  /**
   * 启动资源监控
   * @private
   */
  private startMonitoring(): void {
    this.monitorInterval = setInterval(() => {
      // 获取工作线程池资源使用情况
      const resourceUsage = this.workerPool.getResourceUsage();
      this.stats.resources = resourceUsage;

      // 执行负载平衡
      this.balanceLoad();

      // 发送统计信息
      this.emit('stats', { ...this.stats });
    }, this.config.monitorInterval);
  }

  /**
   * 执行负载平衡
   * @private
   */
  private balanceLoad(): void {
    // 获取当前资源使用情况
    const resources = this.stats.resources;

    // 如果CPU使用率过高，尝试减缓任务处理速度
    if (resources.cpu > 0.9 && resources.activeWorkers > 1) {
      this.emit('load-balancing', {
        action: 'throttle',
        reason: 'high-cpu-usage',
        currentUsage: resources.cpu,
      });

      // 减少同时执行的任务数
      // 具体实现取决于工作线程池的API
    }

    // 如果内存使用率过高，尝试清理缓存
    if (resources.memory > 0.9) {
      this.emit('load-balancing', {
        action: 'clean-cache',
        reason: 'high-memory-usage',
        currentUsage: resources.memory,
      });

      // 清理任务结果缓存
      this.cleanupCache();
    }
  }

  /**
   * 清理任务结果缓存
   * @private
   */
  private cleanupCache(): void {
    // 简单清理策略：保留最近50个结果
    if (this.taskResultsCache.size > 50) {
      const keysToDelete = Array.from(this.taskResultsCache.keys()).slice(
        0,
        this.taskResultsCache.size - 50
      );
      keysToDelete.forEach((key) => this.taskResultsCache.delete(key));
    }
  }

  /**
   * 获取任务结果
   * @param taskId 任务ID
   * @returns 任务结果
   */
  public getTaskResult(taskId: string): any {
    return this.taskResultsCache.get(taskId);
  }

  /**
   * 获取当前调度器统计信息
   * @returns 调度器统计信息
   */
  public getStats(): ISchedulerStats {
    return { ...this.stats };
  }

  /**
   * 关闭调度器
   */
  public async shutdown(): Promise<void> {
    // 停止监控
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    // 关闭工作线程池
    await this.workerPool.shutdown();

    // 清空队列
    this.queue.clear();

    // 清空缓存
    this.taskResultsCache.clear();

    this.emit('shutdown');
  }
}
