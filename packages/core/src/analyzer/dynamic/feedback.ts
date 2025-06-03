/**
 * 动态分析反馈机制
 * 收集运行时分析结果并提供反馈给静态分析引擎和开发者
 */
import { RuleCategory, RuleSeverity } from '../../types';
import {
  IDynamicAnalysis,
  ICodeLocation,
  IComponentPerformance,
  IFixSuggestion,
  IIssueInfo,
} from '../../types/dynamic-analysis';
import { ModuleStatus, ModulePriority } from '../../types/module-interface';
import { IComponentLifecycleEvent } from './hooks';
import { IRuntimeViolation } from './runtime';

/**
 * 反馈机制配置
 */
export interface IFeedbackConfig {
  /** 是否启用反馈机制 */
  enabled: boolean;
  /** 模块优先级 */
  priority: ModulePriority;
  /** 是否自动将结果应用到静态分析 */
  applyToStaticAnalysis: boolean;
  /** 是否记录组件性能问题 */
  trackComponentPerformance: boolean;
  /** 是否生成自动修复建议 */
  generateFixSuggestions: boolean;
  /** 渲染时间阈值(ms)，超过此值视为性能问题 */
  renderTimeThreshold: number;
  /** 重新渲染次数阈值，超过此值视为性能问题 */
  reRenderCountThreshold: number;
  /** 最大记录数量 */
  maxRecordCount: number;
  /** 反馈数据保存周期(ms) */
  feedbackDataRetentionPeriod: number;
  /** 自定义反馈处理器 */
  customHandlers?: Record<string, (data: unknown) => void>;
  /** 反馈回调 */
  onFeedback?: (analysis: IDynamicAnalysis) => void;
}

// 默认反馈机制配置
const DEFAULT_FEEDBACK_CONFIG: IFeedbackConfig = {
  enabled: true,
  priority: ModulePriority.NORMAL,
  applyToStaticAnalysis: true,
  trackComponentPerformance: true,
  generateFixSuggestions: true,
  renderTimeThreshold: 16, // 60fps的单帧时间
  reRenderCountThreshold: 3,
  maxRecordCount: 1000,
  feedbackDataRetentionPeriod: 24 * 60 * 60 * 1000, // 24小时
};

/**
 * 动态分析反馈机制
 * 收集运行时分析结果并提供反馈
 */
export class DynamicFeedback {
  /** 模块ID */
  readonly id: string = 'dynamic-feedback';

  /** 模块状态 */
  private status: ModuleStatus = ModuleStatus.IDLE;

  /** 模块配置 */
  private config: IFeedbackConfig;

  /** 记录的问题 */
  private issues: Map<string, IIssueInfo> = new Map();

  /** 组件性能记录 */
  private componentPerformance: Map<string, IComponentPerformance> = new Map();

  /** 堆栈解析缓存 */
  private stackCache: Map<string, ICodeLocation> = new Map();

  /** 上次分析时间 */
  private lastAnalysisTime: number = 0;

  /** 分析计时器ID */
  private analysisTimerId?: NodeJS.Timeout;

  /**
   * 构造函数
   * @param config 反馈机制配置
   */
  constructor(config: Partial<IFeedbackConfig> = {}) {
    this.config = { ...DEFAULT_FEEDBACK_CONFIG, ...config };
  }

  /**
   * 初始化反馈机制
   */
  async init(): Promise<void> {
    if (this.status !== ModuleStatus.IDLE) {
      return;
    }

    this.status = ModuleStatus.INITIALIZING;

    try {
      // 初始化数据结构
      this.issues.clear();
      this.componentPerformance.clear();
      this.stackCache.clear();

      // 设置定期分析
      if (this.config.enabled) {
        this.setupPeriodicAnalysis();
      }

      this.status = ModuleStatus.READY;
    } catch (error) {
      this.status = ModuleStatus.ERROR;
      throw error;
    }
  }

  /**
   * 启动反馈机制
   */
  async start(): Promise<void> {
    if (this.status !== ModuleStatus.READY) {
      throw new Error('Dynamic feedback is not ready');
    }

    this.status = ModuleStatus.RUNNING;
  }

  /**
   * 停止反馈机制
   */
  async stop(): Promise<void> {
    if (this.status !== ModuleStatus.RUNNING) {
      return;
    }

    // 清除定时分析
    if (this.analysisTimerId) {
      clearInterval(this.analysisTimerId);
      this.analysisTimerId = undefined;
    }

    this.status = ModuleStatus.STOPPED;
  }

  /**
   * 获取模块状态
   */
  getStatus(): ModuleStatus {
    return this.status;
  }

  /**
   * 获取模块配置
   */
  getConfig(): IFeedbackConfig {
    return { ...this.config };
  }

  /**
   * 更新模块配置
   * @param config 新配置
   */
  updateConfig(config: Partial<IFeedbackConfig>): void {
    this.config = { ...this.config, ...config };

    // 如果配置变更需要重启定时分析
    if (this.status === ModuleStatus.RUNNING) {
      if (this.analysisTimerId) {
        clearInterval(this.analysisTimerId);
        this.analysisTimerId = undefined;
      }

      if (this.config.enabled) {
        this.setupPeriodicAnalysis();
      }
    }
  }

  /**
   * 处理运行时违规
   * @param violations 违规记录
   */
  processViolations(violations: IRuntimeViolation[]): void {
    if (this.status !== ModuleStatus.RUNNING || !this.config.enabled) {
      return;
    }

    violations.forEach((violation) => {
      const issueId = this.generateIssueId(violation.type, violation.api || '');
      const existingIssue = this.issues.get(issueId);

      if (existingIssue) {
        // 更新现有问题
        existingIssue.lastDetected = violation.timestamp;
        existingIssue.occurrenceCount += 1;
        if (violation.stack && !existingIssue.location) {
          existingIssue.location = this.parseStackTrace(violation.stack);
        }
      } else {
        // 创建新问题
        const newIssue: IIssueInfo = {
          id: issueId,
          type: violation.type,
          description: violation.description,
          severity: violation.severity,
          category: RuleCategory.SECURITY,
          stack: violation.stack,
          location: violation.stack ? this.parseStackTrace(violation.stack) : undefined,
          fixSuggestions: [],
          firstDetected: violation.timestamp,
          lastDetected: violation.timestamp,
          occurrenceCount: 1,
        };

        // 生成修复建议
        if (this.config.generateFixSuggestions) {
          const suggestion = this.generateFixSuggestion(newIssue);
          if (suggestion) {
            newIssue.fixSuggestions.push(suggestion);
          }
        }

        // 添加到问题列表
        this.issues.set(issueId, newIssue);

        // 清理超出数量限制的旧记录
        this.cleanupRecords();
      }
    });
  }

  /**
   * 处理组件生命周期事件
   * @param events 生命周期事件
   */
  processLifecycleEvents(events: IComponentLifecycleEvent[]): void {
    if (
      this.status !== ModuleStatus.RUNNING ||
      !this.config.enabled ||
      !this.config.trackComponentPerformance
    ) {
      return;
    }

    events.forEach((event) => {
      // 只处理挂载和更新事件的性能数据
      if (!event.executionTime) {
        return;
      }

      const { componentId, componentName, componentType, executionTime, phase, timestamp } = event;

      let performance = this.componentPerformance.get(componentId);

      if (!performance) {
        // 创建新的性能记录
        performance = {
          componentId,
          componentName,
          componentType,
          averageRenderTime: executionTime,
          maxRenderTime: executionTime,
          renderCount: 1,
          unnecessaryReRenderCount: 0,
          lastRenderTime: timestamp,
          location: event.stack ? this.parseStackTrace(event.stack) : undefined,
        };
      } else {
        // 更新现有性能记录
        const totalTime = performance.averageRenderTime * performance.renderCount + executionTime;
        performance.renderCount += 1;
        performance.averageRenderTime = totalTime / performance.renderCount;
        performance.maxRenderTime = Math.max(performance.maxRenderTime, executionTime);
        performance.lastRenderTime = timestamp;

        // 检测是否为不必要的重新渲染
        if (phase === 'update' && executionTime < this.config.renderTimeThreshold) {
          performance.unnecessaryReRenderCount += 1;
        }

        // 如果之前没有位置信息，尝试从堆栈获取
        if (!performance.location && event.stack) {
          performance.location = this.parseStackTrace(event.stack);
        }
      }

      this.componentPerformance.set(componentId, performance);
    });

    // 清理超出数量限制的旧记录
    this.cleanupRecords();
  }

  /**
   * 获取当前分析结果
   */
  getCurrentAnalysis(): IDynamicAnalysis {
    return {
      timestamp: Date.now(),
      issues: Array.from(this.issues.values()),
      componentPerformance: Array.from(this.componentPerformance.values()),
      statistics: {
        totalIssues: this.issues.size,
        criticalIssues: Array.from(this.issues.values()).filter(
          (i) => i.severity === RuleSeverity.CRITICAL
        ).length,
        highIssues: Array.from(this.issues.values()).filter((i) => i.severity === RuleSeverity.HIGH)
          .length,
        mediumIssues: Array.from(this.issues.values()).filter(
          (i) => i.severity === RuleSeverity.MEDIUM
        ).length,
        lowIssues: Array.from(this.issues.values()).filter((i) => i.severity === RuleSeverity.LOW)
          .length,
        componentsTracked: this.componentPerformance.size,
        performanceIssues: Array.from(this.componentPerformance.values()).filter(
          (p) =>
            p.averageRenderTime > this.config.renderTimeThreshold ||
            p.unnecessaryReRenderCount > this.config.reRenderCountThreshold
        ).length,
      },
    };
  }

  /**
   * 清除所有记录的问题
   */
  clearIssues(): void {
    this.issues.clear();
  }

  /**
   * 清除所有组件性能记录
   */
  clearPerformanceRecords(): void {
    this.componentPerformance.clear();
  }

  /**
   * 将分析结果应用到静态分析
   * @param staticAnalyzer 静态分析器实例
   */
  applyToStaticAnalysis(staticAnalyzer: {
    processDynamicFeedback?: (analysis: IDynamicAnalysis) => void;
  }): void {
    if (!this.config.applyToStaticAnalysis || !staticAnalyzer) {
      return;
    }

    const analysis = this.getCurrentAnalysis();

    // 通过外部接口传递数据到静态分析引擎
    if (
      staticAnalyzer.processDynamicFeedback &&
      typeof staticAnalyzer.processDynamicFeedback === 'function'
    ) {
      staticAnalyzer.processDynamicFeedback(analysis);
    }
  }

  /**
   * 配置定期分析任务
   */
  private setupPeriodicAnalysis(): void {
    // 每10秒进行一次分析
    this.analysisTimerId = setInterval(() => {
      this.runAnalysis();
    }, 10000);
  }

  /**
   * 运行分析
   */
  private runAnalysis(): void {
    if (this.status !== ModuleStatus.RUNNING || !this.config.enabled) {
      return;
    }

    const now = Date.now();

    // 如果距离上次分析不足5秒，则跳过
    if (now - this.lastAnalysisTime < 5000) {
      return;
    }

    this.lastAnalysisTime = now;

    // 生成分析结果
    const analysis = this.getCurrentAnalysis();

    // 调用反馈回调
    if (this.config.onFeedback && typeof this.config.onFeedback === 'function') {
      this.config.onFeedback(analysis);
    }

    // 清理过期记录
    this.cleanupExpiredRecords();
  }

  /**
   * 清理超出数量限制的记录
   */
  private cleanupRecords(): void {
    // 清理问题记录
    if (this.issues.size > this.config.maxRecordCount) {
      // 按照最后检测时间排序，保留最近的记录
      const sortedIssues = Array.from(this.issues.entries())
        .sort((a, b) => b[1].lastDetected - a[1].lastDetected)
        .slice(0, this.config.maxRecordCount);

      this.issues = new Map(sortedIssues);
    }

    // 清理性能记录
    if (this.componentPerformance.size > this.config.maxRecordCount) {
      // 按照最后渲染时间排序，保留最近的记录
      const sortedPerformance = Array.from(this.componentPerformance.entries())
        .sort((a, b) => b[1].lastRenderTime - a[1].lastRenderTime)
        .slice(0, this.config.maxRecordCount);

      this.componentPerformance = new Map(sortedPerformance);
    }
  }

  /**
   * 清理过期记录
   */
  private cleanupExpiredRecords(): void {
    const now = Date.now();
    const expirationTime = now - this.config.feedbackDataRetentionPeriod;

    // 清理过期问题
    this.issues.forEach((issue, id) => {
      if (issue.lastDetected < expirationTime) {
        this.issues.delete(id);
      }
    });

    // 清理过期性能记录
    this.componentPerformance.forEach((record, id) => {
      if (record.lastRenderTime < expirationTime) {
        this.componentPerformance.delete(id);
      }
    });
  }

  /**
   * 生成问题ID
   * @param type 问题类型
   * @param api API名称
   */
  private generateIssueId(type: string, api: string): string {
    return `${type}:${api}:${Date.now().toString(36)}`;
  }

  /**
   * 从堆栈信息解析代码位置
   * @param stack 堆栈信息
   */
  private parseStackTrace(stack: string): ICodeLocation | undefined {
    // 检查缓存
    if (this.stackCache.has(stack)) {
      return this.stackCache.get(stack);
    }

    // 简单的堆栈解析逻辑，实际项目中可能需要更复杂的解析器
    const stackLines = stack.split('\n');

    for (const line of stackLines) {
      // 匹配常见堆栈格式
      const match = line.match(/at\s+(?:(.+?)\s+\()?(?:(.+?):(\d+):(\d+))\)?/);

      if (match) {
        const [, , filePath, lineStr, columnStr] = match;

        if (filePath && !filePath.includes('node_modules') && !filePath.includes('webpack')) {
          const location: ICodeLocation = {
            filePath,
            line: parseInt(lineStr, 10),
            column: parseInt(columnStr, 10),
          };

          // 添加到缓存
          this.stackCache.set(stack, location);

          return location;
        }
      }
    }

    return undefined;
  }

  /**
   * 为问题生成修复建议
   * @param issue 问题信息
   */
  private generateFixSuggestion(issue: IIssueInfo): IFixSuggestion | null {
    // 这里可以根据问题类型生成对应的修复建议
    // 实际项目中可能需要更复杂的修复生成逻辑

    if (!issue.type || !issue.location) {
      return null;
    }

    // 示例：针对常见问题类型生成修复建议
    let fixDescription = '';
    let fixCode = '';

    switch (issue.type) {
      case 'xss-vulnerability':
        fixDescription = '使用安全的DOM API替代innerHTML';
        fixCode =
          '// 替换\nelement.innerHTML = content;\n\n// 使用\nelement.textContent = content;';
        break;

      case 'eval-usage':
        fixDescription = '避免使用eval，使用更安全的替代方案';
        fixCode = '// 替换\neval(code);\n\n// 使用\nJSON.parse(jsonString);';
        break;

      case 'sensitive-data-exposure':
        fixDescription = '避免在localStorage中存储敏感数据';
        fixCode =
          '// 替换\nlocalStorage.setItem("token", token);\n\n// 使用\n// 使用内存中的状态管理或安全的会话存储';
        break;

      default:
        return null;
    }

    return {
      id: `fix-${issue.id}`,
      description: fixDescription,
      fixCode,
      location: issue.location,
      ruleId: issue.type,
      issueId: issue.id,
      createdAt: Date.now(),
    };
  }
}

/**
 * 创建动态分析反馈机制实例
 * @param config 配置
 */
export function createDynamicFeedback(config?: Partial<IFeedbackConfig>): DynamicFeedback {
  return new DynamicFeedback(config);
}
