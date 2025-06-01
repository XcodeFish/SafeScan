/**
 * 模块接口基础类型定义
 */

// 模块事件类型
export enum ModuleEventType {
  // 生命周期事件
  INIT = 'module:init',
  READY = 'module:ready',
  START = 'module:start',
  STOP = 'module:stop',
  ERROR = 'module:error',

  // 分析事件
  ANALYSIS_START = 'analysis:start',
  ANALYSIS_PROGRESS = 'analysis:progress',
  ANALYSIS_COMPLETE = 'analysis:complete',
  ANALYSIS_ERROR = 'analysis:error',

  // 规则事件
  RULE_MATCH = 'rule:match',
  RULE_FIX = 'rule:fix',

  // 内存事件
  MEMORY_SNAPSHOT = 'memory:snapshot',
  MEMORY_LEAK_DETECTED = 'memory:leak',

  // 动态监测事件
  RUNTIME_VIOLATION = 'runtime:violation',
  RUNTIME_HOOK = 'runtime:hook',

  // 插件事件
  PLUGIN_LOAD = 'plugin:load',
  PLUGIN_UNLOAD = 'plugin:unload',

  // 自定义事件前缀
  CUSTOM = 'custom:',
}

// 模块优先级
export enum ModulePriority {
  HIGHEST = 0,
  HIGH = 1,
  NORMAL = 2,
  LOW = 3,
  LOWEST = 4,
}

// 模块状态
export enum ModuleStatus {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  READY = 'ready',
  RUNNING = 'running',
  ERROR = 'error',
  STOPPED = 'stopped',
}

// 模块配置基础接口
export interface IModuleConfig {
  id: string;
  enabled: boolean;
  priority: ModulePriority;
  [key: string]: any;
}

// 模块接口
export interface IModule<TConfig extends IModuleConfig = IModuleConfig> {
  // 模块标识符
  id: string;

  // 模块状态
  status: ModuleStatus;

  // 模块配置
  config: TConfig;

  // 初始化模块
  init(): Promise<void>;

  // 启动模块
  start(): Promise<void>;

  // 停止模块
  stop(): Promise<void>;

  // 重置模块
  reset(): Promise<void>;

  // 获取模块状态
  getStatus(): ModuleStatus;

  // 获取模块配置
  getConfig(): TConfig;

  // 更新模块配置
  updateConfig(config: Partial<TConfig>): void;

  // 处理消息
  handleEvent(event: string, payload: any): Promise<void>;

  // 模块是否准备就绪
  isReady(): boolean;
}

// 模块管理器接口
export interface IModuleManager {
  // 注册模块
  register(module: IModule): void;

  // 注销模块
  unregister(moduleId: string): void;

  // 获取模块
  getModule<T extends IModule>(moduleId: string): T | undefined;

  // 获取所有模块
  getAllModules(): IModule[];

  // 初始化所有模块
  initAll(): Promise<void>;

  // 启动所有模块
  startAll(): Promise<void>;

  // 停止所有模块
  stopAll(): Promise<void>;

  // 检查模块存在性
  hasModule(moduleId: string): boolean;
}
