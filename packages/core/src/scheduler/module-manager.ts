import { IModule, IModuleManager, ModuleEventType, ModuleStatus } from '../types/module-interface';
import { EventBus } from '../utils/event-bus';

/**
 * 模块管理器实现
 */
export class ModuleManager implements IModuleManager {
  private modules: Map<string, IModule>;
  private eventBus: EventBus;
  private static instance: ModuleManager;

  private constructor() {
    this.modules = new Map<string, IModule>();
    this.eventBus = EventBus.getInstance();
  }

  /**
   * 获取模块管理器单例
   */
  public static getInstance(): ModuleManager {
    if (!ModuleManager.instance) {
      ModuleManager.instance = new ModuleManager();
    }
    return ModuleManager.instance;
  }

  /**
   * 注册模块
   * @param module 模块实例
   */
  public register(module: IModule): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Module with id ${module.id} is already registered`);
    }

    this.modules.set(module.id, module);

    // 订阅模块事件
    this.setupModuleEventHandlers(module);

    this.eventBus.emit(ModuleEventType.PLUGIN_LOAD, { moduleId: module.id });
  }

  /**
   * 注销模块
   * @param moduleId 模块ID
   */
  public unregister(moduleId: string): void {
    if (!this.modules.has(moduleId)) {
      return;
    }

    const module = this.modules.get(moduleId)!;

    if (module.status === ModuleStatus.RUNNING) {
      // 先停止模块
      module.stop().catch((error) => {
        console.error(`Error stopping module ${moduleId}:`, error);
      });
    }

    this.modules.delete(moduleId);
    this.eventBus.emit(ModuleEventType.PLUGIN_UNLOAD, { moduleId });
  }

  /**
   * 获取模块
   * @param moduleId 模块ID
   * @returns 模块实例，如果不存在则返回undefined
   */
  public getModule<T extends IModule>(moduleId: string): T | undefined {
    return this.modules.get(moduleId) as T | undefined;
  }

  /**
   * 获取所有模块
   * @returns 所有模块实例数组
   */
  public getAllModules(): IModule[] {
    return Array.from(this.modules.values());
  }

  /**
   * 初始化所有模块
   */
  public async initAll(): Promise<void> {
    // 按优先级排序
    const sortedModules = this.getSortedModules();

    // 初始化模块
    for (const module of sortedModules) {
      if (module.status === ModuleStatus.IDLE && module.config.enabled) {
        try {
          await module.init();
          this.eventBus.emit(ModuleEventType.INIT, { moduleId: module.id });
        } catch (error) {
          console.error(`Error initializing module ${module.id}:`, error);
          this.eventBus.emit(ModuleEventType.ERROR, {
            moduleId: module.id,
            error,
          });
        }
      }
    }
  }

  /**
   * 启动所有模块
   */
  public async startAll(): Promise<void> {
    // 按优先级排序
    const sortedModules = this.getSortedModules();

    // 启动模块
    for (const module of sortedModules) {
      if (module.status === ModuleStatus.READY && module.config.enabled) {
        try {
          await module.start();
          this.eventBus.emit(ModuleEventType.START, { moduleId: module.id });
        } catch (error) {
          console.error(`Error starting module ${module.id}:`, error);
          this.eventBus.emit(ModuleEventType.ERROR, {
            moduleId: module.id,
            error,
          });
        }
      }
    }
  }

  /**
   * 停止所有模块
   */
  public async stopAll(): Promise<void> {
    // 按优先级反向排序
    const sortedModules = this.getSortedModules().reverse();

    // 停止模块
    for (const module of sortedModules) {
      if (module.status === ModuleStatus.RUNNING) {
        try {
          await module.stop();
          this.eventBus.emit(ModuleEventType.STOP, { moduleId: module.id });
        } catch (error) {
          console.error(`Error stopping module ${module.id}:`, error);
          this.eventBus.emit(ModuleEventType.ERROR, {
            moduleId: module.id,
            error,
          });
        }
      }
    }
  }

  /**
   * 检查模块是否存在
   * @param moduleId 模块ID
   * @returns 是否存在该模块
   */
  public hasModule(moduleId: string): boolean {
    return this.modules.has(moduleId);
  }

  /**
   * 按优先级排序模块
   * @returns 排序后的模块数组
   */
  private getSortedModules(): IModule[] {
    return Array.from(this.modules.values()).sort((a, b) => a.config.priority - b.config.priority);
  }

  /**
   * 设置模块事件处理
   * @param module 模块实例
   */
  private setupModuleEventHandlers(module: IModule): void {
    // 当模块状态变更为就绪时触发事件
    const originalInit = module.init.bind(module);
    module.init = async () => {
      await originalInit();
      if (module.status === ModuleStatus.READY) {
        this.eventBus.emit(ModuleEventType.READY, { moduleId: module.id });
      }
    };

    // 监听模块相关事件，转发给模块处理
    this.eventBus.on('*', async (payload: any) => {
      try {
        await module.handleEvent('*', payload);
      } catch (error) {
        console.error(`Error handling event in module ${module.id}:`, error);
      }
    });
  }
}
