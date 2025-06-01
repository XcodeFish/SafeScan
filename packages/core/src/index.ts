/**
 * SafeScan Core - 核心入口文件
 */

// 导出模块接口类型
export * from './types/module-interface';

// 导出事件总线
export { EventBus, type EventHandler, type IEventBus } from './utils/event-bus';

// 导出模块管理器
export { ModuleManager } from './scheduler/module-manager';

// 导出基础模块类
export { BaseModule } from './scheduler/base-module';

// 版本信息
export const VERSION = '0.1.0';
