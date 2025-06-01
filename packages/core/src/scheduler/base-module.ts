import { IModule, IModuleConfig, ModuleStatus } from '../types/module-interface';
import { EventBus } from '../utils/event-bus';

/**
 * 抽象基础模块类
 */
export abstract class BaseModule<TConfig extends IModuleConfig = IModuleConfig>
  implements IModule<TConfig>
{
  // 模块ID
  public readonly id: string;

  // 模块状态
  public status: ModuleStatus;

  // 模块配置
  public config: TConfig;

  // 事件总线
  protected eventBus: EventBus;

  /**
   * 构造函数
   * @param id 模块ID
   * @param config 模块配置
   */
  constructor(id: string, config: TConfig) {
    this.id = id;
    this.config = { ...config };
    this.status = ModuleStatus.IDLE;
    this.eventBus = EventBus.getInstance();
  }

  /**
   * 初始化模块
   */
  public async init(): Promise<void> {
    if (this.status !== ModuleStatus.IDLE) {
      return;
    }

    try {
      this.status = ModuleStatus.INITIALIZING;

      // 调用子类实现的初始化
      await this.onInit();

      this.status = ModuleStatus.READY;
    } catch (error) {
      this.status = ModuleStatus.ERROR;
      throw error;
    }
  }

  /**
   * 启动模块
   */
  public async start(): Promise<void> {
    if (this.status !== ModuleStatus.READY) {
      throw new Error(`Module ${this.id} is not ready to start`);
    }

    try {
      // 调用子类实现的启动
      await this.onStart();

      this.status = ModuleStatus.RUNNING;
    } catch (error) {
      this.status = ModuleStatus.ERROR;
      throw error;
    }
  }

  /**
   * 停止模块
   */
  public async stop(): Promise<void> {
    if (this.status !== ModuleStatus.RUNNING) {
      return;
    }

    try {
      // 调用子类实现的停止
      await this.onStop();

      this.status = ModuleStatus.STOPPED;
    } catch (error) {
      this.status = ModuleStatus.ERROR;
      throw error;
    }
  }

  /**
   * 重置模块
   */
  public async reset(): Promise<void> {
    if (this.status === ModuleStatus.RUNNING) {
      await this.stop();
    }

    try {
      // 调用子类实现的重置
      await this.onReset();

      this.status = ModuleStatus.IDLE;
    } catch (error) {
      this.status = ModuleStatus.ERROR;
      throw error;
    }
  }

  /**
   * 获取模块状态
   */
  public getStatus(): ModuleStatus {
    return this.status;
  }

  /**
   * 获取模块配置
   */
  public getConfig(): TConfig {
    return { ...this.config };
  }

  /**
   * 更新模块配置
   * @param config 部分配置
   */
  public updateConfig(config: Partial<TConfig>): void {
    this.config = { ...this.config, ...config };

    // 通知子类配置已更新
    this.onConfigUpdate(config);
  }

  /**
   * 处理事件
   * @param event 事件名称
   * @param payload 事件载荷
   */
  public async handleEvent(_event: string, _payload: any): Promise<void> {
    // 默认实现不处理任何事件
    // 子类可以覆盖此方法处理特定事件
  }

  /**
   * 检查模块是否已准备
   */
  public isReady(): boolean {
    return this.status === ModuleStatus.READY;
  }

  // 以下方法需要子类实现

  /**
   * 子类初始化实现
   */
  protected abstract onInit(): Promise<void>;

  /**
   * 子类启动实现
   */
  protected abstract onStart(): Promise<void>;

  /**
   * 子类停止实现
   */
  protected abstract onStop(): Promise<void>;

  /**
   * 子类重置实现
   */
  protected abstract onReset(): Promise<void>;

  /**
   * 配置更新通知
   * @param config 更新的部分配置
   */
  protected onConfigUpdate(_config: Partial<TConfig>): void {
    // 默认实现不做任何处理
    // 子类可以覆盖此方法响应配置变更
  }
}
