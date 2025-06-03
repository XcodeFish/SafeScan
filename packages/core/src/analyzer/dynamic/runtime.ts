/**
 * 运行时防护机制
 * 实现前端应用的运行时安全保护
 */
import { RuleCategory, RuleSeverity } from '../../types';
import { ModulePriority, ModuleStatus } from '../../types/module-interface';
import { createProxyHandler } from './hooks';

/**
 * 运行时保护配置
 */
export interface IRuntimeProtectionConfig {
  /** 是否启用运行时保护 */
  enabled: boolean;
  /** 模块优先级 */
  priority: ModulePriority;
  /** 是否拦截危险API */
  interceptAPIs: boolean;
  /** 是否监控DOM操作 */
  monitorDOM: boolean;
  /** 是否监控网络请求 */
  monitorNetwork: boolean;
  /** 是否监控存储操作 */
  monitorStorage: boolean;
  /** 是否启用XSS保护 */
  enableXSSProtection: boolean;
  /** 是否启用CSP违规监测 */
  monitorCSP: boolean;
  /** 自定义拦截API列表 */
  customInterceptAPIs?: Record<string, boolean>;
  /** 拦截回调函数 */
  onInterception?: (api: string, args: any[], stack: string) => boolean;
  /** 违规回调函数 */
  onViolation?: (type: string, details: any) => void;
}

// 默认运行时保护配置
const DEFAULT_RUNTIME_PROTECTION_CONFIG: IRuntimeProtectionConfig = {
  enabled: true,
  priority: ModulePriority.HIGH,
  interceptAPIs: true,
  monitorDOM: true,
  monitorNetwork: true,
  monitorStorage: true,
  enableXSSProtection: true,
  monitorCSP: true,
};

/**
 * 危险API定义
 */
export interface IDangerousAPI {
  /** API路径 */
  path: string[];
  /** API描述 */
  description: string;
  /** 安全替代方案 */
  safeAlternative?: string;
  /** 违规级别 */
  severity: RuleSeverity;
  /** 安全类别 */
  category: RuleCategory;
}

// 危险API列表定义（可在实际使用中引用）
export const DANGEROUS_APIS: IDangerousAPI[] = [
  {
    path: ['eval'],
    description: 'eval() 执行任意代码，可能导致XSS攻击',
    safeAlternative: 'JSON.parse() 或自定义解析器',
    severity: RuleSeverity.CRITICAL,
    category: RuleCategory.SECURITY,
  },
  {
    path: ['document', 'write'],
    description: 'document.write() 可能导致XSS攻击',
    safeAlternative: 'document.createElement() 和 appendChild()',
    severity: RuleSeverity.HIGH,
    category: RuleCategory.SECURITY,
  },
  {
    path: ['innerHTML'],
    description: '直接设置innerHTML可能导致XSS攻击',
    safeAlternative: 'textContent 或 创建DOM元素',
    severity: RuleSeverity.HIGH,
    category: RuleCategory.SECURITY,
  },
  {
    path: ['localStorage', 'setItem'],
    description: '存储敏感数据到localStorage',
    safeAlternative: '使用加密存储敏感数据',
    severity: RuleSeverity.MEDIUM,
    category: RuleCategory.SECURITY,
  },
  {
    path: ['sessionStorage', 'setItem'],
    description: '存储敏感数据到sessionStorage',
    safeAlternative: '使用加密存储敏感数据',
    severity: RuleSeverity.MEDIUM,
    category: RuleCategory.SECURITY,
  },
  {
    path: ['fetch'],
    description: '网络请求可能包含敏感数据',
    safeAlternative: '使用HTTPS并添加适当的安全头',
    severity: RuleSeverity.MEDIUM,
    category: RuleCategory.SECURITY,
  },
  {
    path: ['XMLHttpRequest', 'open'],
    description: 'XMLHttpRequest可能包含敏感数据',
    safeAlternative: '使用fetch API并添加适当的安全头',
    severity: RuleSeverity.MEDIUM,
    category: RuleCategory.SECURITY,
  },
  {
    path: ['setTimeout'],
    description: '使用setTimeout执行字符串可能导致安全问题',
    safeAlternative: '只传递函数而非字符串到setTimeout',
    severity: RuleSeverity.MEDIUM,
    category: RuleCategory.SECURITY,
  },
  {
    path: ['setInterval'],
    description: '使用setInterval执行字符串可能导致安全问题',
    safeAlternative: '只传递函数而非字符串到setInterval',
    severity: RuleSeverity.MEDIUM,
    category: RuleCategory.SECURITY,
  },
  {
    path: ['Function'],
    description: 'new Function() 可能导致代码注入',
    safeAlternative: '使用更安全的代码执行方式',
    severity: RuleSeverity.CRITICAL,
    category: RuleCategory.SECURITY,
  },
];

/**
 * 运行时违规记录
 */
export interface IRuntimeViolation {
  /** 违规类型 */
  type: string;
  /** API名称 */
  api?: string;
  /** 严重程度 */
  severity: RuleSeverity;
  /** 违规描述 */
  description: string;
  /** 堆栈信息 */
  stack?: string;
  /** 详细信息 */
  details?: any;
  /** 时间戳 */
  timestamp: number;
}

/**
 * 运行时保护模块
 * 实现API拦截和安全防护
 */
export class RuntimeProtection {
  /** 模块ID */
  readonly id: string = 'runtime-protection';

  /** 模块状态 */
  private status: ModuleStatus = ModuleStatus.IDLE;

  /** 模块配置 */
  private config: IRuntimeProtectionConfig;

  /** 违规记录 */
  private violations: IRuntimeViolation[] = [];

  /** 原始对象备份 */
  private originalObjects: Map<string, any> = new Map();

  /** 拦截处理器列表 */
  private interceptors: Map<string, any> = new Map();

  /**
   * 构造函数
   * @param config 运行时保护配置
   */
  constructor(config: Partial<IRuntimeProtectionConfig> = {}) {
    this.config = { ...DEFAULT_RUNTIME_PROTECTION_CONFIG, ...config };
  }

  /**
   * 初始化运行时保护
   */
  async init(): Promise<void> {
    if (this.status !== ModuleStatus.IDLE) {
      return;
    }

    this.status = ModuleStatus.INITIALIZING;

    try {
      // 监控DOM操作
      if (this.config.monitorDOM && typeof window !== 'undefined') {
        this.setupDOMMonitoring();
      }

      // 监控网络请求
      if (this.config.monitorNetwork && typeof window !== 'undefined') {
        this.setupNetworkMonitoring();
      }

      // 监控存储操作
      if (this.config.monitorStorage && typeof window !== 'undefined') {
        this.setupStorageMonitoring();
      }

      // 拦截危险API
      if (this.config.interceptAPIs && typeof window !== 'undefined') {
        this.setupAPIInterception();
      }

      // 启用XSS保护
      if (this.config.enableXSSProtection && typeof window !== 'undefined') {
        this.setupXSSProtection();
      }

      // 监控CSP违规
      if (this.config.monitorCSP && typeof window !== 'undefined') {
        this.setupCSPMonitoring();
      }

      this.status = ModuleStatus.READY;
    } catch (error) {
      this.status = ModuleStatus.ERROR;
      throw error;
    }
  }

  /**
   * 启动运行时保护
   */
  async start(): Promise<void> {
    if (this.status !== ModuleStatus.READY) {
      throw new Error('Runtime protection is not ready');
    }

    this.status = ModuleStatus.RUNNING;
  }

  /**
   * 停止运行时保护
   */
  async stop(): Promise<void> {
    if (this.status !== ModuleStatus.RUNNING) {
      return;
    }

    // 恢复原始对象
    this.restoreOriginalObjects();

    // 清除拦截器
    this.interceptors.clear();

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
  getConfig(): IRuntimeProtectionConfig {
    return { ...this.config };
  }

  /**
   * 更新模块配置
   * @param config 新配置
   */
  updateConfig(config: Partial<IRuntimeProtectionConfig>): void {
    const wasEnabled = this.config.enabled;
    this.config = { ...this.config, ...config };

    // 如果启用状态改变，相应地启动或停止
    if (!wasEnabled && this.config.enabled && this.status === ModuleStatus.STOPPED) {
      this.init().then(() => this.start());
    } else if (wasEnabled && !this.config.enabled && this.status === ModuleStatus.RUNNING) {
      this.stop();
    }
  }

  /**
   * 获取违规记录
   */
  getViolations(): IRuntimeViolation[] {
    return [...this.violations];
  }

  /**
   * 清除违规记录
   */
  clearViolations(): void {
    this.violations = [];
  }

  /**
   * 设置DOM操作监控
   */
  private setupDOMMonitoring(): void {
    if (typeof document === 'undefined') {
      return;
    }

    // 保存原始方法
    this.backupOriginalMethod(Element.prototype, 'innerHTML', 'setter');
    this.backupOriginalMethod(Element.prototype, 'outerHTML', 'setter');
    this.backupOriginalMethod(document, 'write');
    this.backupOriginalMethod(document, 'writeln');

    // 创建Proxy拦截DOM操作
    const elementProxyHandler = createProxyHandler({
      onSetter: (target: any, prop: string | symbol, value: any) => {
        if (prop === 'innerHTML' || prop === 'outerHTML') {
          if (typeof value === 'string' && this.detectXSSPattern(value)) {
            this.logViolation({
              type: 'dom-xss',
              api: `Element.${prop}`,
              severity: RuleSeverity.HIGH,
              description: `可能的XSS注入: ${truncate(value, 100)}`,
              stack: new Error().stack,
              timestamp: Date.now(),
            });

            // 如果配置了拦截回调，则调用
            if (this.config.onInterception) {
              const shouldProceed = this.config.onInterception(
                `Element.${prop}`,
                [value],
                new Error().stack || ''
              );
              if (!shouldProceed) {
                return false;
              }
            }
          }
        }
        return true;
      },
    });

    // 拦截document.write和document.writeln
    const documentProxyHandler = createProxyHandler({
      onMethod: (target: any, prop: string | symbol, args: any[]) => {
        if (prop === 'write' || prop === 'writeln') {
          const content = args[0];
          if (typeof content === 'string' && this.detectXSSPattern(content)) {
            this.logViolation({
              type: 'dom-xss',
              api: `document.${prop}`,
              severity: RuleSeverity.HIGH,
              description: `可能的XSS注入: ${truncate(content, 100)}`,
              stack: new Error().stack,
              timestamp: Date.now(),
            });

            // 如果配置了拦截回调，则调用
            if (this.config.onInterception) {
              const shouldProceed = this.config.onInterception(
                `document.${prop}`,
                args,
                new Error().stack || ''
              );
              if (!shouldProceed) {
                return false;
              }
            }
          }
        }
        return true;
      },
    });

    // 应用拦截
    this.applyProxy(Element.prototype, 'innerHTML', elementProxyHandler);
    this.applyProxy(Element.prototype, 'outerHTML', elementProxyHandler);
    this.applyProxy(document, 'write', documentProxyHandler);
    this.applyProxy(document, 'writeln', documentProxyHandler);
  }

  /**
   * 设置网络请求监控
   */
  private setupNetworkMonitoring(): void {
    if (typeof window === 'undefined') {
      return;
    }

    // 拦截Fetch API
    this.backupOriginalMethod(window, 'fetch');

    const fetchProxyHandler = createProxyHandler({
      onMethod: (target: any, prop: string | symbol, args: any[]) => {
        if (prop === 'fetch' && args.length > 0) {
          const request = args[0];
          let url: string;

          if (typeof request === 'string') {
            url = request;
          } else if (request instanceof Request) {
            url = request.url;
          } else {
            return true;
          }

          // 检查不安全的URL
          if (
            url.startsWith('http:') &&
            !url.startsWith('http://localhost') &&
            !url.startsWith('http://127.0.0.1')
          ) {
            this.logViolation({
              type: 'insecure-request',
              api: 'fetch',
              severity: RuleSeverity.MEDIUM,
              description: `不安全的HTTP请求: ${truncate(url, 100)}`,
              stack: new Error().stack,
              timestamp: Date.now(),
            });
          }

          // 如果配置了拦截回调，则调用
          if (this.config.onInterception) {
            const shouldProceed = this.config.onInterception(
              'fetch',
              args,
              new Error().stack || ''
            );
            if (!shouldProceed) {
              return false;
            }
          }
        }
        return true;
      },
    });

    // 拦截XMLHttpRequest
    this.backupOriginalMethod(XMLHttpRequest.prototype, 'open');

    const xhrProxyHandler = createProxyHandler({
      onMethod: (target: any, prop: string | symbol, args: any[]) => {
        if (prop === 'open' && args.length > 1) {
          const url = args[1];

          if (
            typeof url === 'string' &&
            url.startsWith('http:') &&
            !url.startsWith('http://localhost') &&
            !url.startsWith('http://127.0.0.1')
          ) {
            this.logViolation({
              type: 'insecure-request',
              api: 'XMLHttpRequest.open',
              severity: RuleSeverity.MEDIUM,
              description: `不安全的HTTP请求: ${truncate(url, 100)}`,
              stack: new Error().stack,
              timestamp: Date.now(),
            });
          }

          // 如果配置了拦截回调，则调用
          if (this.config.onInterception) {
            const shouldProceed = this.config.onInterception(
              'XMLHttpRequest.open',
              args,
              new Error().stack || ''
            );
            if (!shouldProceed) {
              return false;
            }
          }
        }
        return true;
      },
    });

    // 应用拦截
    this.applyProxy(window, 'fetch', fetchProxyHandler);
    this.applyProxy(XMLHttpRequest.prototype, 'open', xhrProxyHandler);
  }

  /**
   * 设置存储监控
   */
  private setupStorageMonitoring(): void {
    if (typeof window === 'undefined') {
      return;
    }

    // 监控localStorage
    this.backupOriginalMethod(Storage.prototype, 'setItem');

    const storageProxyHandler = createProxyHandler({
      onMethod: (target: any, prop: string | symbol, args: any[]) => {
        if (prop === 'setItem' && args.length > 1) {
          const key = args[0];
          const value = args[1];

          // 检测可能存储的敏感数据
          if (this.detectSensitiveData(String(value))) {
            this.logViolation({
              type: 'sensitive-storage',
              api: `${target === localStorage ? 'localStorage' : 'sessionStorage'}.setItem`,
              severity: RuleSeverity.MEDIUM,
              description: `可能存储敏感数据: ${key}`,
              stack: new Error().stack,
              timestamp: Date.now(),
            });

            // 如果配置了拦截回调，则调用
            if (this.config.onInterception) {
              const shouldProceed = this.config.onInterception(
                `${target === localStorage ? 'localStorage' : 'sessionStorage'}.setItem`,
                args,
                new Error().stack || ''
              );
              if (!shouldProceed) {
                return false;
              }
            }
          }
        }
        return true;
      },
    });

    // 应用拦截
    this.applyProxy(Storage.prototype, 'setItem', storageProxyHandler);
  }

  /**
   * 设置API拦截
   */
  private setupAPIInterception(): void {
    if (typeof window === 'undefined') {
      return;
    }

    // 拦截eval
    this.backupOriginalMethod(window, 'eval');

    const evalProxyHandler = createProxyHandler({
      onMethod: (target: any, prop: string | symbol, args: any[]) => {
        if (prop === 'eval') {
          this.logViolation({
            type: 'dangerous-api',
            api: 'eval',
            severity: RuleSeverity.CRITICAL,
            description: `使用危险的eval()函数`,
            stack: new Error().stack,
            timestamp: Date.now(),
          });

          // 如果配置了拦截回调，则调用
          if (this.config.onInterception) {
            const shouldProceed = this.config.onInterception('eval', args, new Error().stack || '');
            if (!shouldProceed) {
              return false;
            }
          }
        }
        return true;
      },
    });

    // 拦截Function构造函数
    this.backupOriginalMethod(window, 'Function');

    const functionProxyHandler = createProxyHandler({
      onMethod: (target: any, prop: string | symbol, args: any[]) => {
        if (prop === 'Function') {
          this.logViolation({
            type: 'dangerous-api',
            api: 'Function',
            severity: RuleSeverity.CRITICAL,
            description: `使用危险的Function构造函数`,
            stack: new Error().stack,
            timestamp: Date.now(),
          });

          // 如果配置了拦截回调，则调用
          if (this.config.onInterception) {
            const shouldProceed = this.config.onInterception(
              'Function',
              args,
              new Error().stack || ''
            );
            if (!shouldProceed) {
              return false;
            }
          }
        }
        return true;
      },
    });

    // 拦截setTimeout和setInterval
    this.backupOriginalMethod(window, 'setTimeout');
    this.backupOriginalMethod(window, 'setInterval');

    const timerProxyHandler = createProxyHandler({
      onMethod: (target: any, prop: string | symbol, args: any[]) => {
        if ((prop === 'setTimeout' || prop === 'setInterval') && args.length > 0) {
          const callback = args[0];

          // 检查字符串回调函数
          if (typeof callback === 'string') {
            this.logViolation({
              type: 'dangerous-api',
              api: prop,
              severity: RuleSeverity.MEDIUM,
              description: `使用字符串作为${prop}回调函数`,
              stack: new Error().stack,
              timestamp: Date.now(),
            });

            // 如果配置了拦截回调，则调用
            if (this.config.onInterception) {
              const shouldProceed = this.config.onInterception(prop, args, new Error().stack || '');
              if (!shouldProceed) {
                return false;
              }
            }
          }
        }
        return true;
      },
    });

    // 应用拦截
    this.applyProxy(window, 'eval', evalProxyHandler);
    this.applyProxy(window, 'Function', functionProxyHandler);
    this.applyProxy(window, 'setTimeout', timerProxyHandler);
    this.applyProxy(window, 'setInterval', timerProxyHandler);

    // 拦截自定义API
    if (this.config.customInterceptAPIs) {
      for (const apiPath in this.config.customInterceptAPIs) {
        if (this.config.customInterceptAPIs[apiPath]) {
          this.interceptCustomAPI(apiPath);
        }
      }
    }
  }

  /**
   * 设置XSS保护
   */
  private setupXSSProtection(): void {
    // 已在DOM监控中实现，此处可以添加更多保护策略
  }

  /**
   * 设置CSP监控
   */
  private setupCSPMonitoring(): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.addEventListener('securitypolicyviolation', (e) => {
      this.logViolation({
        type: 'csp-violation',
        severity: RuleSeverity.HIGH,
        description: `CSP违规: ${e.violatedDirective}`,
        details: {
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
          effectiveDirective: e.effectiveDirective,
          originalPolicy: e.originalPolicy,
        },
        timestamp: Date.now(),
      });

      // 如果配置了违规回调，则调用
      if (this.config.onViolation) {
        this.config.onViolation('csp-violation', {
          blockedURI: e.blockedURI,
          violatedDirective: e.violatedDirective,
          effectiveDirective: e.effectiveDirective,
          originalPolicy: e.originalPolicy,
        });
      }
    });
  }

  /**
   * 拦截自定义API
   * @param apiPath API路径
   */
  private interceptCustomAPI(apiPath: string): void {
    const pathParts = apiPath.split('.');
    let obj: any = window;

    // 遍历路径直到倒数第二个部分
    for (let i = 0; i < pathParts.length - 1; i++) {
      if (obj && typeof obj === 'object') {
        obj = obj[pathParts[i]];
      } else {
        // 如果路径不存在，直接返回
        return;
      }
    }

    // 获取最后一个属性名
    const lastProp = pathParts[pathParts.length - 1];

    // 如果对象和属性存在
    if (obj && typeof obj === 'object' && lastProp in obj) {
      // 备份原始方法
      this.backupOriginalMethod(obj, lastProp);

      // 创建代理处理器
      const customProxyHandler = createProxyHandler({
        onMethod: (target: any, prop: string | symbol, args: any[]) => {
          if (prop === lastProp) {
            this.logViolation({
              type: 'custom-api',
              api: apiPath,
              severity: RuleSeverity.MEDIUM,
              description: `使用拦截的API: ${apiPath}`,
              stack: new Error().stack,
              timestamp: Date.now(),
            });

            // 如果配置了拦截回调，则调用
            if (this.config.onInterception) {
              const shouldProceed = this.config.onInterception(
                apiPath,
                args,
                new Error().stack || ''
              );
              if (!shouldProceed) {
                return false;
              }
            }
          }
          return true;
        },
      });

      // 应用拦截
      this.applyProxy(obj, lastProp, customProxyHandler);
    }
  }

  /**
   * 备份原始方法
   * @param obj 对象
   * @param prop 属性
   * @param type 属性类型
   */
  private backupOriginalMethod(obj: any, prop: string, type: 'method' | 'setter' = 'method'): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    const key = `${obj.constructor?.name || 'unknown'}.${prop}.${type}`;

    if (!this.originalObjects.has(key)) {
      if (type === 'method') {
        this.originalObjects.set(key, obj[prop]);
      } else if (type === 'setter') {
        const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
        if (descriptor && descriptor.set) {
          this.originalObjects.set(key, descriptor.set);
        }
      }
    }
  }

  /**
   * 应用代理
   * @param obj 对象
   * @param prop 属性
   * @param handler 代理处理器
   */
  private applyProxy(obj: any, prop: string, handler: any): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    const key = `${obj.constructor?.name || 'unknown'}.${prop}.method`;
    const setterKey = `${obj.constructor?.name || 'unknown'}.${prop}.setter`;

    // 处理普通方法
    if (typeof obj[prop] === 'function') {
      const original = obj[prop];

      obj[prop] = function (...args: any[]) {
        // 调用代理处理器
        const shouldProceed = handler.onMethod?.(this, prop, args, this);

        // 如果允许继续执行
        if (shouldProceed !== false) {
          return original.apply(this, args);
        } else {
          // 返回一个空的Promise或undefined
          try {
            const result = original.call(this);
            return typeof result?.then === 'function' ? Promise.resolve() : undefined;
          } catch {
            return undefined;
          }
        }
      };

      // 记录拦截器
      this.interceptors.set(key, obj[prop]);
    }
    // 处理setter
    else {
      const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
      if (descriptor && descriptor.set) {
        const originalSetter = descriptor.set;

        Object.defineProperty(obj, prop, {
          ...descriptor,
          set(value) {
            // 调用代理处理器
            const shouldProceed = handler.onSetter?.(this, prop, value, this);

            // 如果允许继续执行
            if (shouldProceed !== false) {
              originalSetter.call(this, value);
            }
          },
        });

        // 记录拦截器
        this.interceptors.set(setterKey, descriptor.set);
      }
    }
  }

  /**
   * 恢复原始对象
   */
  private restoreOriginalObjects(): void {
    this.originalObjects.forEach((original, key) => {
      const [objName, prop, type] = key.split('.');
      let obj: any;

      // 根据对象名获取对象
      switch (objName) {
        case 'Window':
          obj = window;
          break;
        case 'Document':
          obj = document;
          break;
        case 'Element':
          obj = Element.prototype;
          break;
        case 'Storage':
          obj = Storage.prototype;
          break;
        case 'XMLHttpRequest':
          obj = XMLHttpRequest.prototype;
          break;
        default:
          // 尝试从window获取
          obj = (window as any)[objName];
      }

      // 恢复原始方法或属性
      if (obj && typeof obj === 'object') {
        if (type === 'method') {
          obj[prop] = original;
        } else if (type === 'setter') {
          const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
          if (descriptor) {
            Object.defineProperty(obj, prop, {
              ...descriptor,
              set: original,
            });
          }
        }
      }
    });

    // 清空备份
    this.originalObjects.clear();
  }

  /**
   * 记录违规
   * @param violation 违规记录
   */
  private logViolation(violation: IRuntimeViolation): void {
    this.violations.push(violation);

    // 触发违规回调
    if (this.config.onViolation) {
      this.config.onViolation(violation.type, violation);
    }

    // 可以在此处添加更多处理，如发送到服务器或触发事件
  }

  /**
   * 检测XSS模式
   * @param content 内容
   * @returns 是否包含XSS模式
   */
  private detectXSSPattern(content: string): boolean {
    // 简单的XSS检测规则
    const xssPatterns = [
      /<script\b[^>]*>(.*?)<\/script>/i,
      /javascript\s*:/i,
      /on\w+\s*=\s*["']?[^"']*["']?/i,
      /eval\s*\(/i,
      /expression\s*\(/i,
    ];

    return xssPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * 检测敏感数据
   * @param content 内容
   * @returns 是否包含敏感数据
   */
  private detectSensitiveData(content: string): boolean {
    // 简单的敏感数据检测规则
    const sensitivePatterns = [
      /password/i,
      /passwd/i,
      /token/i,
      /api[-_]?key/i,
      /secret/i,
      /credential/i,
      /\d{13,16}/, // 信用卡号
      /\b[\w.%+-]+@[\w.-]+\.[a-zA-Z]{2,}\b/, // 邮箱
    ];

    return sensitivePatterns.some((pattern) => pattern.test(content));
  }
}

/**
 * 截断字符串
 * @param str 字符串
 * @param maxLength 最大长度
 * @returns 截断后的字符串
 */
function truncate(str: string, maxLength: number): string {
  return str.length <= maxLength ? str : str.substring(0, maxLength) + '...';
}

/**
 * 创建运行时保护实例
 * @param config 配置
 * @returns 运行时保护实例
 */
export function createRuntimeProtection(
  config?: Partial<IRuntimeProtectionConfig>
): RuntimeProtection {
  return new RuntimeProtection(config);
}
