/**
 * 运行时钩子
 * 实现运行时API拦截和组件生命周期追踪
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable no-invalid-this */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-hooks/rules-of-hooks */
import { Framework } from '../../types';
import { ModulePriority, ModuleStatus } from '../../types/module-interface';

/**
 * 组件生命周期阶段
 */
export enum ComponentLifecyclePhase {
  /** 创建阶段 */
  CREATE = 'create',
  /** 挂载阶段 */
  MOUNT = 'mount',
  /** 更新阶段 */
  UPDATE = 'update',
  /** 卸载阶段 */
  UNMOUNT = 'unmount',
  /** 错误处理阶段 */
  ERROR = 'error',
}

/**
 * 组件生命周期事件
 */
export interface IComponentLifecycleEvent {
  /** 组件类型 */
  componentType: string;
  /** 组件名称 */
  componentName: string;
  /** 组件ID */
  componentId: string;
  /** 框架类型 */
  framework: Framework;
  /** 生命周期阶段 */
  phase: ComponentLifecyclePhase;
  /** 组件属性 */
  props?: Record<string, any>;
  /** 组件状态 */
  state?: Record<string, any>;
  /** 父组件ID */
  parentId?: string;
  /** 执行时间（毫秒） */
  executionTime?: number;
  /** 时间戳 */
  timestamp: number;
  /** 堆栈信息 */
  stack?: string;
}

/**
 * 钩子配置
 */
export interface IHooksConfig {
  /** 是否启用钩子 */
  enabled: boolean;
  /** 模块优先级 */
  priority: ModulePriority;
  /** 是否跟踪React组件 */
  trackReact: boolean;
  /** 是否跟踪Vue组件 */
  trackVue: boolean;
  /** 是否跟踪Svelte组件 */
  trackSvelte: boolean;
  /** 是否跟踪Angular组件 */
  trackAngular: boolean;
  /** 是否收集组件属性 */
  collectProps: boolean;
  /** 是否收集组件状态 */
  collectState: boolean;
  /** 是否监控渲染性能 */
  monitorPerformance: boolean;
  /** 是否记录组件层次结构 */
  trackHierarchy: boolean;
  /** 最大递归深度 */
  maxDepth?: number;
  /** 忽略的组件列表 */
  ignoreComponents?: string[];
  /** 生命周期回调 */
  onLifecycle?: (event: IComponentLifecycleEvent) => void;
}

// 默认钩子配置
const DEFAULT_HOOKS_CONFIG: IHooksConfig = {
  enabled: true,
  priority: ModulePriority.HIGH,
  trackReact: true,
  trackVue: true,
  trackSvelte: false,
  trackAngular: false,
  collectProps: true,
  collectState: true,
  monitorPerformance: true,
  trackHierarchy: true,
  maxDepth: 25,
};

/**
 * React组件实例接口
 */
interface ReactComponentInstance {
  constructor: {
    displayName?: string;
    name?: string;
  };
  displayName?: string;
  props: any;
  state?: any;
  __safeComponentId?: string;
  generateComponentId: (componentType: string, props: any) => string;
  trackComponentLifecycle: (event: IComponentLifecycleEvent) => void;
  config: IHooksConfig;
  safeCloneProps: (obj: any, depth?: number) => any;
}

/**
 * 代理处理器参数类型
 */
export type TConstructorFunction = new (...args: any[]) => any;

/**
 * 代理处理器参数
 */
export interface IProxyHandlerParams<T extends object = any> {
  /** 属性获取回调 */
  onGetter?: (target: T, prop: string | symbol, receiver: any) => any;
  /** 属性设置回调 */
  onSetter?: (target: T, prop: string | symbol, value: any, receiver: any) => boolean | undefined;
  /** 方法调用回调 */
  onMethod?: (target: T, prop: string | symbol, args: any[], receiver: any) => boolean | undefined;
  /** 构造函数调用回调 */
  onConstruct?: (target: T, args: any[], newTarget: TConstructorFunction) => boolean | undefined;
}

/**
 * 代理处理器结果
 */
export interface IProxyHandler<T extends object = any> {
  get(target: T, prop: string | symbol, receiver: any): any;
  set(target: T, prop: string | symbol, value: any, receiver: any): boolean;
  construct?(target: T, args: any[], newTarget: TConstructorFunction): object;
  onMethod?: IProxyHandlerParams<T>['onMethod'];
  onSetter?: IProxyHandlerParams<T>['onSetter'];
}

/**
 * 创建代理处理器
 * @param params 处理器参数
 * @returns 代理处理器
 */
export function createProxyHandler<T extends object = any>(
  params: IProxyHandlerParams<T>
): IProxyHandler<T> {
  return {
    // 属性获取拦截
    get(target: T, prop: string | symbol, receiver: any) {
      // 如果有getter回调，则调用
      if (params.onGetter) {
        const result = params.onGetter(target, prop, receiver);
        if (result !== undefined) {
          return result;
        }
      }

      // 获取原始值
      // eslint-disable-next-line @typescript-eslint/ban-types
      const value = Reflect.get(target, prop, receiver);

      // 如果是函数，则包装进行调用拦截
      if (typeof value === 'function' && params.onMethod) {
        return function (this: any, ...args: any[]) {
          // 调用方法拦截回调
          const shouldProceed = params.onMethod!(target, prop, args, this);

          // 如果允许继续执行
          if (shouldProceed !== false) {
            return Reflect.apply(value, this, args);
          }

          // 返回一个适当的默认值
          try {
            const dummyResult = value.call(this);
            if (typeof dummyResult === 'object') {
              return {};
            } else if (typeof dummyResult === 'number') {
              return 0;
            } else if (typeof dummyResult === 'string') {
              return '';
            } else if (typeof dummyResult === 'boolean') {
              return false;
            } else {
              return undefined;
            }
          } catch {
            return undefined;
          }
        };
      }

      return value;
    },

    // 属性设置拦截
    set(target: T, prop: string | symbol, value: any, receiver: any) {
      // 如果有setter回调，则调用
      if (params.onSetter) {
        const shouldProceed = params.onSetter(target, prop, value, receiver);
        if (shouldProceed === false) {
          return true; // 在严格模式下，需要返回true表示成功
        }
      }

      // 设置属性值
      // eslint-disable-next-line @typescript-eslint/ban-types
      return Reflect.set(target, prop, value, receiver);
    },

    // 构造函数调用拦截
    construct(target: T, args: any[], newTarget: TConstructorFunction) {
      // 如果有construct回调，则调用
      if (params.onConstruct) {
        const shouldProceed = params.onConstruct(target, args, newTarget);
        if (shouldProceed === false) {
          // 返回一个空对象
          return {};
        }
      }

      // 调用原始构造函数
      return Reflect.construct(target as unknown as TConstructorFunction, args, newTarget);
    },

    // 其他代理处理器方法可以根据需要添加
    onMethod: params.onMethod,
    onSetter: params.onSetter,
  };
}

/**
 * 组件树节点
 */
export interface IComponentTreeNode {
  /** 组件ID */
  id: string;
  /** 组件名称 */
  name: string;
  /** 组件类型 */
  type: string;
  /** 框架类型 */
  framework: Framework;
  /** 子组件 */
  children: IComponentTreeNode[];
  /** 挂载状态 */
  mounted: boolean;
  /** 创建时间 */
  createdAt: number;
  /** 挂载时间 */
  mountedAt?: number;
  /** 更新次数 */
  updateCount: number;
  /** 最近更新时间 */
  lastUpdatedAt?: number;
  /** 卸载时间 */
  unmountedAt?: number;
  /** 渲染次数 */
  renderCount: number;
  /** 执行时间（毫秒） */
  totalExecutionTime: number;
}

/**
 * 运行时钩子模块
 * 实现框架集成与组件生命周期追踪
 */
export class RuntimeHooks {
  /** 模块ID */
  readonly id: string = 'runtime-hooks';

  /** 模块状态 */
  private status: ModuleStatus = ModuleStatus.IDLE;

  /** 模块配置 */
  private config: IHooksConfig;

  /** 组件生命周期事件 */
  private lifecycleEvents: IComponentLifecycleEvent[] = [];

  /** 组件树 */
  private componentTree: Record<string, IComponentTreeNode> = {};

  /** 组件ID映射 */
  private componentIdMap: Map<object, string> = new Map();

  /** 已安装的钩子 */
  private installedHooks: Set<string> = new Set();

  /**
   * 构造函数
   * @param config 钩子配置
   */
  constructor(config: Partial<IHooksConfig> = {}) {
    this.config = { ...DEFAULT_HOOKS_CONFIG, ...config };
  }

  /**
   * 初始化运行时钩子
   */
  async init(): Promise<void> {
    if (this.status !== ModuleStatus.IDLE) {
      return;
    }

    this.status = ModuleStatus.INITIALIZING;

    try {
      // 安装框架钩子
      if (typeof window !== 'undefined') {
        if (this.config.trackReact) {
          await this.installReactHooks();
        }

        if (this.config.trackVue) {
          await this.installVueHooks();
        }

        if (this.config.trackSvelte) {
          await this.installSvelteHooks();
        }

        if (this.config.trackAngular) {
          await this.installAngularHooks();
        }
      }

      this.status = ModuleStatus.READY;
    } catch (error) {
      this.status = ModuleStatus.ERROR;
      throw error;
    }
  }

  /**
   * 启动运行时钩子
   */
  async start(): Promise<void> {
    if (this.status !== ModuleStatus.READY) {
      throw new Error('Runtime hooks are not ready');
    }

    this.status = ModuleStatus.RUNNING;
  }

  /**
   * 停止运行时钩子
   */
  async stop(): Promise<void> {
    if (this.status !== ModuleStatus.RUNNING) {
      return;
    }

    // 卸载钩子
    this.uninstallHooks();

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
  getConfig(): IHooksConfig {
    return { ...this.config };
  }

  /**
   * 更新模块配置
   * @param config 新配置
   */
  updateConfig(config: Partial<IHooksConfig>): void {
    const wasEnabled = this.config.enabled;
    const prevReact = this.config.trackReact;
    const prevVue = this.config.trackVue;
    const prevSvelte = this.config.trackSvelte;
    const prevAngular = this.config.trackAngular;

    this.config = { ...this.config, ...config };

    // 如果启用状态改变，相应地启动或停止
    if (!wasEnabled && this.config.enabled && this.status === ModuleStatus.STOPPED) {
      this.init().then(() => this.start());
    } else if (wasEnabled && !this.config.enabled && this.status === ModuleStatus.RUNNING) {
      this.stop();
    }

    // 如果框架跟踪设置改变，重新安装或卸载相应钩子
    if (this.status === ModuleStatus.RUNNING) {
      if (prevReact !== this.config.trackReact) {
        if (this.config.trackReact) {
          this.installReactHooks().catch(console.error);
        } else {
          this.uninstallHook('react');
        }
      }

      if (prevVue !== this.config.trackVue) {
        if (this.config.trackVue) {
          this.installVueHooks().catch(console.error);
        } else {
          this.uninstallHook('vue');
        }
      }

      if (prevSvelte !== this.config.trackSvelte) {
        if (this.config.trackSvelte) {
          this.installSvelteHooks().catch(console.error);
        } else {
          this.uninstallHook('svelte');
        }
      }

      if (prevAngular !== this.config.trackAngular) {
        if (this.config.trackAngular) {
          this.installAngularHooks().catch(console.error);
        } else {
          this.uninstallHook('angular');
        }
      }
    }
  }

  /**
   * 获取生命周期事件
   */
  getLifecycleEvents(): IComponentLifecycleEvent[] {
    return [...this.lifecycleEvents];
  }

  /**
   * 清除生命周期事件
   */
  clearLifecycleEvents(): void {
    this.lifecycleEvents = [];
  }

  /**
   * 获取组件树
   */
  getComponentTree(): IComponentTreeNode[] {
    // 构建根节点
    const roots: IComponentTreeNode[] = [];

    // 找出所有根组件（没有父组件的组件）
    for (const id in this.componentTree) {
      const node = this.componentTree[id];
      if (!Object.values(this.componentTree).some((n) => n.children.some((c) => c.id === id))) {
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * 安装React钩子
   */
  private async installReactHooks(): Promise<void> {
    if (this.installedHooks.has('react') || typeof window === 'undefined') {
      return;
    }

    // 检查React是否存在
    const React = (window as any).React;
    if (!React) {
      console.warn('React not found, skipping React hooks installation');
      return;
    }

    try {
      // 保存原始方法
      const originalCreateElement = React.createElement;

      // 拦截React.createElement
      React.createElement = (...args: any[]) => {
        const element = originalCreateElement.apply(React, args);

        // 如果是组件（函数或类）
        if (args[0] && typeof args[0] !== 'string') {
          const componentType = args[0].displayName || args[0].name || 'AnonymousComponent';
          const props = args[1] || {};

          // 生成组件ID
          const componentId = this.generateComponentId(componentType, props);

          // 追踪组件创建
          this.trackComponentLifecycle({
            componentType,
            componentName: componentType,
            componentId,
            framework: Framework.REACT,
            phase: ComponentLifecyclePhase.CREATE,
            props: this.config.collectProps ? this.safeCloneProps(props) : undefined,
            timestamp: Date.now(),
            stack: new Error().stack,
          });

          // 保存组件ID
          if (!element.__safeComponentId) {
            Object.defineProperty(element, '__safeComponentId', {
              value: componentId,
              enumerable: false,
            });
          }
        }

        return element;
      };

      // 拦截React.Component和React.PureComponent生命周期方法
      this.patchReactComponent(React.Component.prototype);

      if (React.PureComponent) {
        this.patchReactComponent(React.PureComponent.prototype);
      }

      // 如果有React Hooks，拦截useState、useEffect等
      if (React.useState) {
        const originalUseState = React.useState;
        React.useState = function (...args: any[]) {
          const result = originalUseState.apply(this, args);
          return result;
        };
      }

      this.installedHooks.add('react');
    } catch (error) {
      console.error('Failed to install React hooks:', error);
    }
  }

  /**
   * 补丁React组件原型
   * @param componentPrototype 组件原型
   */
  private patchReactComponent(componentPrototype: any): void {
    // 钩子方法列表
    const lifecycleMethods = [
      'componentDidMount',
      'componentDidUpdate',
      'componentWillUnmount',
      'shouldComponentUpdate',
      'render',
      'componentDidCatch',
    ];

    // 为每个生命周期方法打补丁
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const runtimeHooks = this;
    lifecycleMethods.forEach((method) => {
      if (componentPrototype[method]) {
        const original = componentPrototype[method];

        componentPrototype[method] = function (this: ReactComponentInstance, ...args: any[]) {
          const componentType =
            this.constructor.displayName || this.constructor.name || 'AnonymousComponent';
          const componentName = this.displayName || componentType;

          // 生成组件ID
          const componentId =
            this.__safeComponentId || runtimeHooks.generateComponentId(componentType, this.props);
          if (!this.__safeComponentId) {
            Object.defineProperty(this, '__safeComponentId', {
              value: componentId,
              enumerable: false,
            });
          }

          // 开始计时
          const startTime = performance.now();

          // 确定生命周期阶段
          let phase: ComponentLifecyclePhase;
          switch (method) {
            case 'componentDidMount':
              phase = ComponentLifecyclePhase.MOUNT;
              break;
            case 'componentDidUpdate':
              phase = ComponentLifecyclePhase.UPDATE;
              break;
            case 'componentWillUnmount':
              phase = ComponentLifecyclePhase.UNMOUNT;
              break;
            case 'componentDidCatch':
              phase = ComponentLifecyclePhase.ERROR;
              break;
            default:
              phase = ComponentLifecyclePhase.UPDATE;
          }

          try {
            // 调用原始方法
            const result = original.apply(this, args);

            // 计算执行时间
            const executionTime = performance.now() - startTime;

            // 追踪组件生命周期
            runtimeHooks.trackComponentLifecycle({
              componentType,
              componentName,
              componentId,
              framework: Framework.REACT,
              phase,
              props: runtimeHooks.config.collectProps
                ? runtimeHooks.safeCloneProps(this.props)
                : undefined,
              state: runtimeHooks.config.collectState
                ? runtimeHooks.safeCloneProps(this.state)
                : undefined,
              executionTime,
              timestamp: Date.now(),
              stack: new Error().stack,
            });

            return result;
          } catch (error) {
            // 追踪错误
            runtimeHooks.trackComponentLifecycle({
              componentType,
              componentName,
              componentId,
              framework: Framework.REACT,
              phase: ComponentLifecyclePhase.ERROR,
              props: runtimeHooks.config.collectProps
                ? runtimeHooks.safeCloneProps(this.props)
                : undefined,
              state: runtimeHooks.config.collectState
                ? runtimeHooks.safeCloneProps(this.state)
                : undefined,
              timestamp: Date.now(),
              stack: error instanceof Error ? error.stack : new Error().stack,
            });

            throw error;
          }
        };
      }
    });
  }

  /**
   * 安装Vue钩子
   */
  private async installVueHooks(): Promise<void> {
    if (this.installedHooks.has('vue') || typeof window === 'undefined') {
      return;
    }

    // 检查Vue是否存在
    const Vue = (window as any).Vue;
    if (!Vue) {
      console.warn('Vue not found, skipping Vue hooks installation');
      return;
    }

    try {
      // 创建Vue插件
      const VueHooksPlugin = {
        install: (app: any, _options: any) => {
          // Vue 3 钩子安装
          if (app.config && app.config.globalProperties) {
            app.mixin({
              beforeCreate() {
                const componentType =
                  this.$options.name || this.$options.__file || 'AnonymousComponent';
                const componentId = this.generateComponentId(componentType, this.$props || {});

                Object.defineProperty(this, '__safeComponentId', {
                  value: componentId,
                  enumerable: false,
                });

                this.trackComponentLifecycle({
                  componentType,
                  componentName: componentType,
                  componentId,
                  framework: Framework.VUE,
                  phase: ComponentLifecyclePhase.CREATE,
                  props:
                    this.config.collectProps && this.$props
                      ? this.safeCloneProps(this.$props)
                      : undefined,
                  timestamp: Date.now(),
                  stack: new Error().stack,
                });
              },

              mounted() {
                const startTime = performance.now();
                const componentType =
                  this.$options.name || this.$options.__file || 'AnonymousComponent';
                const componentId = this.__safeComponentId;

                // 计算执行时间
                const executionTime = performance.now() - startTime;

                this.trackComponentLifecycle({
                  componentType,
                  componentName: componentType,
                  componentId,
                  framework: Framework.VUE,
                  phase: ComponentLifecyclePhase.MOUNT,
                  props:
                    this.config.collectProps && this.$props
                      ? this.safeCloneProps(this.$props)
                      : undefined,
                  state:
                    this.config.collectState && this.$data
                      ? this.safeCloneProps(this.$data)
                      : undefined,
                  executionTime,
                  timestamp: Date.now(),
                  stack: new Error().stack,
                });
              },

              updated() {
                const startTime = performance.now();
                const componentType =
                  this.$options.name || this.$options.__file || 'AnonymousComponent';
                const componentId = this.__safeComponentId;

                // 计算执行时间
                const executionTime = performance.now() - startTime;

                this.trackComponentLifecycle({
                  componentType,
                  componentName: componentType,
                  componentId,
                  framework: Framework.VUE,
                  phase: ComponentLifecyclePhase.UPDATE,
                  props:
                    this.config.collectProps && this.$props
                      ? this.safeCloneProps(this.$props)
                      : undefined,
                  state:
                    this.config.collectState && this.$data
                      ? this.safeCloneProps(this.$data)
                      : undefined,
                  executionTime,
                  timestamp: Date.now(),
                  stack: new Error().stack,
                });
              },

              beforeUnmount() {
                const componentType =
                  this.$options.name || this.$options.__file || 'AnonymousComponent';
                const componentId = this.__safeComponentId;

                this.trackComponentLifecycle({
                  componentType,
                  componentName: componentType,
                  componentId,
                  framework: Framework.VUE,
                  phase: ComponentLifecyclePhase.UNMOUNT,
                  timestamp: Date.now(),
                  stack: new Error().stack,
                });
              },

              errorCaptured(err: Error, _vm: any, _info: string) {
                const componentType =
                  this.$options.name || this.$options.__file || 'AnonymousComponent';
                const componentId = this.__safeComponentId;

                this.trackComponentLifecycle({
                  componentType,
                  componentName: componentType,
                  componentId,
                  framework: Framework.VUE,
                  phase: ComponentLifecyclePhase.ERROR,
                  timestamp: Date.now(),
                  stack: err.stack || new Error().stack,
                });

                return false; // 继续向上传播错误
              },
            });
          }
          // Vue 2 钩子安装
          else if (Vue.mixin) {
            Vue.mixin({
              beforeCreate() {
                const componentType =
                  this.$options.name || this.$options._componentTag || 'AnonymousComponent';
                const componentId = this.generateComponentId(componentType, this.$props || {});

                Object.defineProperty(this, '__safeComponentId', {
                  value: componentId,
                  enumerable: false,
                });

                this.trackComponentLifecycle({
                  componentType,
                  componentName: componentType,
                  componentId,
                  framework: Framework.VUE,
                  phase: ComponentLifecyclePhase.CREATE,
                  props:
                    this.config.collectProps && this.$props
                      ? this.safeCloneProps(this.$props)
                      : undefined,
                  timestamp: Date.now(),
                  stack: new Error().stack,
                });
              },

              mounted() {
                const startTime = performance.now();
                const componentType =
                  this.$options.name || this.$options._componentTag || 'AnonymousComponent';
                const componentId = this.__safeComponentId;

                // 计算执行时间
                const executionTime = performance.now() - startTime;

                this.trackComponentLifecycle({
                  componentType,
                  componentName: componentType,
                  componentId,
                  framework: Framework.VUE,
                  phase: ComponentLifecyclePhase.MOUNT,
                  props:
                    this.config.collectProps && this.$props
                      ? this.safeCloneProps(this.$props)
                      : undefined,
                  state:
                    this.config.collectState && this._data
                      ? this.safeCloneProps(this._data)
                      : undefined,
                  executionTime,
                  timestamp: Date.now(),
                  stack: new Error().stack,
                });
              },

              updated() {
                const startTime = performance.now();
                const componentType =
                  this.$options.name || this.$options._componentTag || 'AnonymousComponent';
                const componentId = this.__safeComponentId;

                // 计算执行时间
                const executionTime = performance.now() - startTime;

                this.trackComponentLifecycle({
                  componentType,
                  componentName: componentType,
                  componentId,
                  framework: Framework.VUE,
                  phase: ComponentLifecyclePhase.UPDATE,
                  props:
                    this.config.collectProps && this.$props
                      ? this.safeCloneProps(this.$props)
                      : undefined,
                  state:
                    this.config.collectState && this._data
                      ? this.safeCloneProps(this._data)
                      : undefined,
                  executionTime,
                  timestamp: Date.now(),
                  stack: new Error().stack,
                });
              },

              beforeDestroy() {
                const componentType =
                  this.$options.name || this.$options._componentTag || 'AnonymousComponent';
                const componentId = this.__safeComponentId;

                this.trackComponentLifecycle({
                  componentType,
                  componentName: componentType,
                  componentId,
                  framework: Framework.VUE,
                  phase: ComponentLifecyclePhase.UNMOUNT,
                  timestamp: Date.now(),
                  stack: new Error().stack,
                });
              },

              errorCaptured(err: Error, _vm: any, _info: string) {
                const componentType =
                  this.$options.name || this.$options._componentTag || 'AnonymousComponent';
                const componentId = this.__safeComponentId;

                this.trackComponentLifecycle({
                  componentType,
                  componentName: componentType,
                  componentId,
                  framework: Framework.VUE,
                  phase: ComponentLifecyclePhase.ERROR,
                  timestamp: Date.now(),
                  stack: err.stack || new Error().stack,
                });

                return false; // 继续向上传播错误
              },
            });
          }
        },
      };

      // 安装Vue插件
      if (Vue.createApp) {
        // Vue 3
        const app = Vue.createApp({});
        app.use(VueHooksPlugin);
      } else if (Vue.use) {
        // Vue 2
        // eslint-disable-next-line
        Vue.use(VueHooksPlugin);
      }

      this.installedHooks.add('vue');
    } catch (error) {
      console.error('Failed to install Vue hooks:', error);
    }
  }

  /**
   * 安装Svelte钩子
   */
  private async installSvelteHooks(): Promise<void> {
    // 由于Svelte的编译时特性，钩子安装方式不同，这里简单实现
    if (this.installedHooks.has('svelte') || typeof window === 'undefined') {
      return;
    }

    this.installedHooks.add('svelte');
  }

  /**
   * 安装Angular钩子
   */
  private async installAngularHooks(): Promise<void> {
    // Angular需要通过DI系统集成，这里简单实现
    if (this.installedHooks.has('angular') || typeof window === 'undefined') {
      return;
    }

    this.installedHooks.add('angular');
  }

  /**
   * 卸载所有钩子
   */
  private uninstallHooks(): void {
    // 卸载各框架钩子
    for (const hook of this.installedHooks) {
      this.uninstallHook(hook);
    }

    // 清空已安装钩子集合
    this.installedHooks.clear();
  }

  /**
   * 卸载特定钩子
   * @param hook 钩子名称
   */
  private uninstallHook(hook: string): void {
    // 根据钩子名称卸载特定钩子
    // 实际实现中需要恢复原始方法
    this.installedHooks.delete(hook);
  }

  /**
   * 记录组件生命周期事件
   * @param event 生命周期事件
   */
  private trackComponentLifecycle(event: IComponentLifecycleEvent): void {
    // 如果组件被忽略，则跳过
    if (
      this.config.ignoreComponents &&
      this.config.ignoreComponents.some(
        (pattern) => event.componentName.includes(pattern) || event.componentType.includes(pattern)
      )
    ) {
      return;
    }

    // 记录事件
    this.lifecycleEvents.push(event);

    // 更新组件树
    this.updateComponentTree(event);

    // 触发回调
    if (this.config.onLifecycle) {
      this.config.onLifecycle(event);
    }
  }

  /**
   * 更新组件树
   * @param event 生命周期事件
   */
  private updateComponentTree(event: IComponentLifecycleEvent): void {
    const { componentId, componentName, componentType, framework, phase } = event;

    // 如果组件不在树中，创建新节点
    if (!this.componentTree[componentId]) {
      this.componentTree[componentId] = {
        id: componentId,
        name: componentName,
        type: componentType,
        framework,
        children: [],
        mounted: false,
        createdAt: Date.now(),
        updateCount: 0,
        renderCount: 0,
        totalExecutionTime: 0,
      };
    }

    const node = this.componentTree[componentId];

    // 根据生命周期阶段更新节点
    switch (phase) {
      case ComponentLifecyclePhase.CREATE:
        // 已处理
        break;

      case ComponentLifecyclePhase.MOUNT:
        node.mounted = true;
        node.mountedAt = Date.now();
        break;

      case ComponentLifecyclePhase.UPDATE:
        node.updateCount += 1;
        node.lastUpdatedAt = Date.now();
        break;

      case ComponentLifecyclePhase.UNMOUNT:
        node.mounted = false;
        node.unmountedAt = Date.now();
        break;

      case ComponentLifecyclePhase.ERROR:
        // 可以添加错误计数等
        break;
    }

    // 更新渲染次数和执行时间
    if (
      event.phase === ComponentLifecyclePhase.MOUNT ||
      event.phase === ComponentLifecyclePhase.UPDATE
    ) {
      node.renderCount += 1;

      if (event.executionTime) {
        node.totalExecutionTime += event.executionTime;
      }
    }

    // 如果有父组件ID，建立父子关系
    if (event.parentId && this.componentTree[event.parentId]) {
      const parent = this.componentTree[event.parentId];

      // 避免重复添加
      if (!parent.children.some((child) => child.id === componentId)) {
        parent.children.push(node);
      }
    }
  }

  /**
   * 生成组件ID
   * @param componentType 组件类型
   * @param _props 组件属性
   * @returns 组件ID
   */
  private generateComponentId(componentType: string, _props: any): string {
    // 使用组件类型和一个唯一ID生成组件ID
    const randomId = Math.random().toString(36).substr(2, 9);
    return `${componentType}_${randomId}`;
  }

  /**
   * 安全克隆属性，去除循环引用
   * @param obj 对象
   * @param depth 当前深度
   * @returns 克隆后的对象
   */
  private safeCloneProps(obj: any, depth: number = 0): any {
    if (depth > (this.config.maxDepth || 3)) {
      return '[MaxDepth]';
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    if (obj instanceof Date) {
      return new Date(obj);
    }

    if (obj instanceof RegExp) {
      return new RegExp(obj.source, obj.flags);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.safeCloneProps(item, depth + 1));
    }

    // 函数不克隆
    if (typeof obj === 'function') {
      return '[Function]';
    }

    try {
      const result: Record<string, any> = {};

      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          // 跳过React内部属性
          if (key.startsWith('_') || key === 'ref' || key === 'key') {
            continue;
          }

          try {
            result[key] = this.safeCloneProps(obj[key], depth + 1);
          } catch (error) {
            result[key] = '[UncloneableValue]';
          }
        }
      }

      return result;
    } catch (error) {
      return '[UncloneableObject]';
    }
  }
}

/**
 * 创建运行时钩子实例
 * @param config 配置
 * @returns 运行时钩子实例
 */
export function createRuntimeHooks(config?: Partial<IHooksConfig>): RuntimeHooks {
  return new RuntimeHooks(config);
}
