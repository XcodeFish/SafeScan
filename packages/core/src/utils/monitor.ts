/**
 * 监控系统模块 - 用于监控系统资源和性能指标
 */
import { EventBus } from './event-bus';
import { logger } from './logger';

/**
 * 监控指标类型
 */
export enum MetricType {
  COUNTER = 'counter',
  GAUGE = 'gauge',
  HISTOGRAM = 'histogram',
  TIMER = 'timer',
}

/**
 * 监控事件类型
 */
export enum MonitorEventType {
  METRIC_UPDATED = 'monitor:metric_updated',
  PERFORMANCE_ALERT = 'monitor:performance_alert',
  MEMORY_ALERT = 'monitor:memory_alert',
  CPU_ALERT = 'monitor:cpu_alert',
  SYSTEM_INFO = 'monitor:system_info',
}

/**
 * 性能指标接口
 */
export interface IMetric<T = number> {
  name: string;
  type: MetricType;
  value: T;
  tags?: Record<string, string>;
  timestamp: number;
}

/**
 * 阈值警报配置
 */
export interface IAlertThreshold {
  warning?: number;
  critical?: number;
}

/**
 * 监控系统配置
 */
export interface IMonitorConfig {
  enabled: boolean;
  sampleInterval: number; // 采样间隔(毫秒)
  memoryThresholds?: IAlertThreshold; // 内存使用阈值(MB)
  cpuThresholds?: IAlertThreshold; // CPU使用阈值(%)
  collectSystemInfo?: boolean; // 是否收集系统信息
  maxMetricsHistory?: number; // 最大指标历史记录数
}

/**
 * 默认监控配置
 */
const DEFAULT_MONITOR_CONFIG: IMonitorConfig = {
  enabled: true,
  sampleInterval: 5000, // 5秒采样一次
  memoryThresholds: {
    warning: 500, // 500MB
    critical: 1000, // 1GB
  },
  cpuThresholds: {
    warning: 70, // 70%
    critical: 90, // 90%
  },
  collectSystemInfo: true,
  maxMetricsHistory: 100,
};

/**
 * 系统资源使用情况
 */
export interface ISystemResourceUsage {
  memoryUsage: {
    heapUsed: number; // 已用堆内存(MB)
    heapTotal: number; // 总堆内存(MB)
    rss: number; // 常驻集大小(MB)
    external: number; // 外部内存(MB)
  };
  cpuUsage?: {
    user: number; // 用户CPU时间(%)
    system: number; // 系统CPU时间(%)
    total: number; // 总CPU使用率(%)
  };
  timestamp: number;
}

/**
 * 监控系统实现
 */
export class Monitor {
  private config: IMonitorConfig;
  private eventBus: EventBus;
  private metrics: Map<string, IMetric>;
  private historyMetrics: Map<string, IMetric[]>;
  private intervalId?: NodeJS.Timeout;
  private startTime: number;
  private lastCpuUsage?: NodeJS.CpuUsage;
  private lastCpuTime?: number;
  private static instance: Monitor;

  private constructor(config: Partial<IMonitorConfig> = {}) {
    this.config = { ...DEFAULT_MONITOR_CONFIG, ...config };
    this.eventBus = EventBus.getInstance();
    this.metrics = new Map();
    this.historyMetrics = new Map();
    this.startTime = Date.now();
  }

  /**
   * 获取监控系统单例
   */
  public static getInstance(config?: Partial<IMonitorConfig>): Monitor {
    if (!Monitor.instance) {
      Monitor.instance = new Monitor(config);
    } else if (config) {
      // 更新配置
      Monitor.instance.updateConfig(config);
    }
    return Monitor.instance;
  }

  /**
   * 更新监控配置
   */
  public updateConfig(config: Partial<IMonitorConfig>): void {
    this.config = { ...this.config, ...config };

    // 如果禁用监控，停止采样
    if (!this.config.enabled && this.intervalId) {
      this.stop();
    }
    // 如果启用监控，开始采样
    else if (this.config.enabled && !this.intervalId) {
      this.start();
    }
  }

  /**
   * 启动监控系统
   */
  public start(): void {
    if (this.config.enabled && !this.intervalId) {
      logger.info('启动监控系统');
      this.intervalId = setInterval(() => this.collectMetrics(), this.config.sampleInterval);
      this.collectMetrics(); // 立即采集一次
    }
  }

  /**
   * 停止监控系统
   */
  public stop(): void {
    if (this.intervalId) {
      logger.info('停止监控系统');
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * 收集系统指标
   */
  private collectMetrics(): void {
    try {
      const resourceUsage = this.getSystemResourceUsage();

      // 发送系统资源使用情况
      if (this.config.collectSystemInfo) {
        this.eventBus.emit(MonitorEventType.SYSTEM_INFO, resourceUsage);
      }

      // 检查内存使用警报
      this.checkMemoryAlert(resourceUsage);

      // 检查CPU使用警报
      if (resourceUsage.cpuUsage) {
        this.checkCpuAlert(resourceUsage.cpuUsage);
      }
    } catch (error) {
      logger.error('收集系统指标失败', error);
    }
  }

  /**
   * 获取系统资源使用情况
   */
  private getSystemResourceUsage(): ISystemResourceUsage {
    const memoryUsage = process.memoryUsage();
    const result: ISystemResourceUsage = {
      memoryUsage: {
        heapUsed: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100, // MB
        heapTotal: Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100, // MB
        rss: Math.round((memoryUsage.rss / 1024 / 1024) * 100) / 100, // MB
        external: Math.round(((memoryUsage.external || 0) / 1024 / 1024) * 100) / 100, // MB
      },
      timestamp: Date.now(),
    };

    // 计算CPU使用率
    try {
      const currentCpuUsage = process.cpuUsage();
      const currentTime = Date.now();

      if (this.lastCpuUsage && this.lastCpuTime) {
        const userDiff = currentCpuUsage.user - this.lastCpuUsage.user;
        const systemDiff = currentCpuUsage.system - this.lastCpuUsage.system;
        const timeDiff = currentTime - this.lastCpuTime;

        // 计算百分比，转换微秒为秒，除以时间差和CPU核心数
        const cpuCount = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 1 : 1;
        const userPercent = ((userDiff / 1000 / timeDiff) * 100) / cpuCount;
        const systemPercent = ((systemDiff / 1000 / timeDiff) * 100) / cpuCount;

        result.cpuUsage = {
          user: Math.round(userPercent * 100) / 100,
          system: Math.round(systemPercent * 100) / 100,
          total: Math.round((userPercent + systemPercent) * 100) / 100,
        };
      }

      this.lastCpuUsage = currentCpuUsage;
      this.lastCpuTime = currentTime;
    } catch (error) {
      logger.debug('计算CPU使用率失败', error);
    }

    return result;
  }

  /**
   * 检查内存使用警报
   */
  private checkMemoryAlert(resourceUsage: ISystemResourceUsage): void {
    if (!this.config.memoryThresholds) return;

    const heapUsed = resourceUsage.memoryUsage.heapUsed;

    if (
      this.config.memoryThresholds.critical &&
      heapUsed >= this.config.memoryThresholds.critical
    ) {
      this.eventBus.emit(MonitorEventType.MEMORY_ALERT, {
        level: 'critical',
        message: `内存使用超过临界值: ${heapUsed}MB`,
        usage: resourceUsage.memoryUsage,
        timestamp: resourceUsage.timestamp,
      });
      logger.error(`内存使用超过临界值: ${heapUsed}MB`);
    } else if (
      this.config.memoryThresholds.warning &&
      heapUsed >= this.config.memoryThresholds.warning
    ) {
      this.eventBus.emit(MonitorEventType.MEMORY_ALERT, {
        level: 'warning',
        message: `内存使用超过警告值: ${heapUsed}MB`,
        usage: resourceUsage.memoryUsage,
        timestamp: resourceUsage.timestamp,
      });
      logger.warn(`内存使用超过警告值: ${heapUsed}MB`);
    }
  }

  /**
   * 检查CPU使用警报
   */
  private checkCpuAlert(cpuUsage: ISystemResourceUsage['cpuUsage']): void {
    if (!this.config.cpuThresholds || !cpuUsage) return;

    const totalCpu = cpuUsage.total;

    if (this.config.cpuThresholds.critical && totalCpu >= this.config.cpuThresholds.critical) {
      this.eventBus.emit(MonitorEventType.CPU_ALERT, {
        level: 'critical',
        message: `CPU使用超过临界值: ${totalCpu}%`,
        usage: cpuUsage,
        timestamp: Date.now(),
      });
      logger.error(`CPU使用超过临界值: ${totalCpu}%`);
    } else if (this.config.cpuThresholds.warning && totalCpu >= this.config.cpuThresholds.warning) {
      this.eventBus.emit(MonitorEventType.CPU_ALERT, {
        level: 'warning',
        message: `CPU使用超过警告值: ${totalCpu}%`,
        usage: cpuUsage,
        timestamp: Date.now(),
      });
      logger.warn(`CPU使用超过警告值: ${totalCpu}%`);
    }
  }

  /**
   * 记录计数器指标
   */
  public counter(name: string, value: number = 1, tags?: Record<string, string>): void {
    this.recordMetric({
      name,
      type: MetricType.COUNTER,
      value: this.getMetricValue(name, value, MetricType.COUNTER),
      tags,
      timestamp: Date.now(),
    });
  }

  /**
   * 记录仪表盘指标
   */
  public gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric({
      name,
      type: MetricType.GAUGE,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  /**
   * 记录直方图指标
   */
  public histogram(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric({
      name,
      type: MetricType.HISTOGRAM,
      value,
      tags,
      timestamp: Date.now(),
    });
  }

  /**
   * 开始计时器
   * @returns 停止计时器的函数
   */
  public startTimer(name: string, tags?: Record<string, string>): () => number {
    const startTime = Date.now();

    return () => {
      const duration = Date.now() - startTime;
      this.recordMetric({
        name,
        type: MetricType.TIMER,
        value: duration,
        tags,
        timestamp: Date.now(),
      });
      return duration;
    };
  }

  /**
   * 获取指标当前值
   */
  private getMetricValue(name: string, value: number, type: MetricType): number {
    const currentMetric = this.metrics.get(name);

    if (!currentMetric || type !== MetricType.COUNTER) {
      return value;
    }

    // 计数器类型累加当前值
    return (currentMetric.value as number) + value;
  }

  /**
   * 记录指标
   */
  private recordMetric(metric: IMetric): void {
    this.metrics.set(metric.name, metric);

    // 添加到历史记录
    if (!this.historyMetrics.has(metric.name)) {
      this.historyMetrics.set(metric.name, []);
    }

    const history = this.historyMetrics.get(metric.name)!;
    history.push(metric);

    // 限制历史记录大小
    if (history.length > this.config.maxMetricsHistory!) {
      history.shift();
    }

    // 发送指标更新事件
    this.eventBus.emit(MonitorEventType.METRIC_UPDATED, metric);
  }

  /**
   * 获取指标值
   */
  public getMetric(name: string): IMetric | undefined {
    return this.metrics.get(name);
  }

  /**
   * 获取指标历史记录
   */
  public getMetricHistory(name: string): IMetric[] {
    return this.historyMetrics.get(name) || [];
  }

  /**
   * 获取所有指标
   */
  public getAllMetrics(): Map<string, IMetric> {
    return new Map(this.metrics);
  }

  /**
   * 获取运行时间(毫秒)
   */
  public getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * 重置指标
   */
  public resetMetrics(name?: string): void {
    if (name) {
      this.metrics.delete(name);
      this.historyMetrics.delete(name);
    } else {
      this.metrics.clear();
      this.historyMetrics.clear();
    }
  }
}

// 导出监控系统单例
export const monitor = Monitor.getInstance();
