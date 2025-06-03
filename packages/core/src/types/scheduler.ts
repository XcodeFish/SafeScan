/**
 * 任务优先级枚举
 * 数值越小，优先级越高
 */
export enum TaskPriority {
  CRITICAL = 0, // 关键任务，立即执行
  HIGH = 1, // 高优先级
  MEDIUM = 2, // 中优先级
  LOW = 3, // 低优先级
  BACKGROUND = 4, // 后台任务
}

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  PENDING = 'pending', // 等待执行
  RUNNING = 'running', // 正在执行
  COMPLETED = 'completed', // 执行完成
  FAILED = 'failed', // 执行失败
  CANCELED = 'canceled', // 已取消
}

/**
 * 可调度任务接口
 */
export interface ISchedulableTask {
  /**
   * 任务唯一标识
   */
  id: string;

  /**
   * 任务名称
   */
  name: string;

  /**
   * 任务优先级
   */
  priority: TaskPriority;

  /**
   * 任务当前状态
   */
  status: TaskStatus;

  /**
   * 任务资源消耗预估（0-100）
   */
  resourceEstimation: number;

  /**
   * 任务超时时间（毫秒）
   */
  timeout?: number;

  /**
   * 任务执行时间预估（毫秒）
   */
  estimatedExecutionTime?: number;

  /**
   * 执行任务的函数
   * @returns 任务执行结果
   */
  execute(): Promise<any>;

  /**
   * 取消任务
   */
  cancel?(): void;

  /**
   * 任务元数据，可用于存储额外信息
   */
  metadata?: Record<string, any>;
}

/**
 * 工作线程配置接口
 */
export interface IWorkerConfig {
  /**
   * 最大工作线程数量
   */
  maxWorkers: number;

  /**
   * 工作线程空闲超时时间(毫秒)
   */
  idleTimeout: number;

  /**
   * 任务超时时间(毫秒)
   */
  taskTimeout: number;

  /**
   * 是否启用自适应伸缩
   */
  enableScaling: boolean;

  /**
   * 资源使用阈值(0-1)，超过此值则限制线程数
   */
  resourceThreshold: number;
}

/**
 * 调度器配置接口
 */
export interface ISchedulerConfig {
  /**
   * 工作线程配置
   */
  worker: IWorkerConfig;

  /**
   * 队列容量限制
   */
  queueCapacity: number;

  /**
   * 资源监控间隔(毫秒)
   */
  monitorInterval: number;

  /**
   * 是否启用优先级动态调整
   */
  enableDynamicPriority: boolean;
}

/**
 * 资源使用情况接口
 */
export interface IResourceUsage {
  /**
   * CPU使用率(0-1)
   */
  cpu: number;

  /**
   * 内存使用率(0-1)
   */
  memory: number;

  /**
   * 当前活跃工作线程数
   */
  activeWorkers: number;

  /**
   * 队列积压任务数
   */
  pendingTasks: number;
}

/**
 * 调度器统计信息接口
 */
export interface ISchedulerStats {
  /**
   * 资源使用情况
   */
  resources: IResourceUsage;

  /**
   * 完成任务数
   */
  completedTasks: number;

  /**
   * 失败任务数
   */
  failedTasks: number;

  /**
   * 平均任务执行时间(毫秒)
   */
  avgExecutionTime: number;

  /**
   * 各优先级任务统计
   */
  tasksByPriority: Record<TaskPriority, number>;
}
