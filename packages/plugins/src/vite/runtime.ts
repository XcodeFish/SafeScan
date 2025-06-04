/**
 * 运行时注入模块
 * 实现SafeScan运行时的注入功能
 */
import { createFilter } from '@rollup/pluginutils';
import { ModuleEventType } from '@safescan/core';
import type { ViteDevServer } from 'vite';

// 虚拟模块ID
export const VIRTUAL_MODULE_ID = 'virtual:safescan-runtime';
export const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

// 运行时模块事件
export const RUNTIME_EVENT = 'safescan:runtime-event';

interface RuntimeHandler {
  configureServer(server: ViteDevServer): void;
  transformIndexHtml(html: string): { html: string; tags: any[] } | void;
  transform(code: string, id: string): Promise<{ code: string } | null>;
}

/**
 * 创建运行时注入处理器
 * @param options 插件配置选项
 */
export function createRuntimeInjection(
  options: ReturnType<typeof import('./options').resolveOptions>
): RuntimeHandler {
  // 如果运行时注入被禁用，返回无操作处理器
  if (!options.runtime.enabled) {
    return {
      configureServer: () => {},
      transformIndexHtml: () => undefined,
      transform: async () => null,
    };
  }

  // 创建文件过滤器
  const filter = createFilter(
    options.runtime.include.map((ext) => `**/*${ext}`),
    options.runtime.exclude.map((pattern) => (pattern.startsWith('!') ? pattern.slice(1) : pattern))
  );

  // 服务器实例
  let server: ViteDevServer | null = null;

  return {
    // 配置开发服务器
    configureServer(s: ViteDevServer) {
      server = s;

      // 监听SafeScan运行时事件
      server.ws.on(RUNTIME_EVENT, (data, client) => {
        // 处理运行时事件
        console.log(`[SafeScan] 接收到运行时事件:`, data);

        // 响应客户端
        client.send({
          type: 'custom',
          event: `${RUNTIME_EVENT}:response`,
          data: {
            id: data.id,
            success: true,
            result: { received: true },
          },
        });

        // 广播事件给所有客户端
        if (data.broadcast && server) {
          server.ws.send({
            type: 'custom',
            event: `${RUNTIME_EVENT}:broadcast`,
            data: {
              type: data.type,
              payload: data.payload,
            },
          });
        }
      });

      // 处理文件打开请求
      server.ws.on('safescan:open-file', (data) => {
        console.log(`[SafeScan] 打开文件请求:`, data);
        // 这里可以集成IDE打开文件的功能
        // 由于这里无法直接操作本地IDE，实际实现可能需要通过其他机制处理
      });
    },

    // 转换HTML，注入SafeScan运行时脚本
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'script',
            attrs: { type: 'module' },
            children: generateRuntimeInitCode(options.runtime.config || {}),
            injectTo: 'head',
          },
        ],
      };
    },

    // 转换模块代码，注入运行时监控代码
    async transform(code, id) {
      // 虚拟模块处理
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return {
          code: generateVirtualModuleCode(),
        };
      }

      // 如果不是需要处理的文件，则不处理
      if (!filter(id)) {
        return null;
      }

      // 检查是否需要注入运行时监控
      const shouldInject = !id.includes('node_modules') && !id.includes('virtual:');

      if (!shouldInject) {
        return null;
      }

      // 注入运行时监控代码
      const injectedCode = `
// SafeScan运行时监控
import "${VIRTUAL_MODULE_ID}";
try {
  if (window.__SAFESCAN_RUNTIME__) {
    window.__SAFESCAN_RUNTIME__.__monitorModule("${id.replace(/\\/g, '/')}");
  }
} catch (e) {
  console.error("[SafeScan] 运行时监控注入失败:", e);
}

${code}
      `;

      return {
        code: injectedCode,
      };
    },
  };
}

/**
 * 生成运行时初始化代码
 * @param config 运行时配置
 */
function generateRuntimeInitCode(config: any): string {
  return `
// SafeScan运行时初始化
;(function() {
  if (window.__SAFESCAN_RUNTIME_INITIALIZED__) return;
  window.__SAFESCAN_RUNTIME_INITIALIZED__ = true;
  
  console.log('[SafeScan] 运行时初始化中...');
  
  // 创建运行时配置
  const runtimeConfig = ${JSON.stringify(config, null, 2)};
  
  // 创建运行时全局对象
  window.__SAFESCAN_RUNTIME__ = {
    version: '0.1.0',
    config: runtimeConfig,
    modules: new Map(),
    
    // 监控模块
    __monitorModule(moduleId) {
      if (this.modules.has(moduleId)) return;
      console.log('[SafeScan] 监控模块:', moduleId);
      this.modules.set(moduleId, {
        id: moduleId,
        loads: 0,
        lastLoad: Date.now()
      });
    },
    
    // 发送运行时事件
    sendRuntimeEvent(type, payload = {}, options = {}) {
      if (!import.meta.hot) return Promise.reject(new Error('HMR not available'));
      
      return new Promise((resolve, reject) => {
        const eventId = Date.now().toString(36) + Math.random().toString(36).substring(2);
        
        // 监听响应
        const cleanup = import.meta.hot.on('safescan:runtime-event:response', (response) => {
          if (response.id === eventId) {
            cleanup(); // 移除监听器
            if (response.success) {
              resolve(response.result);
            } else {
              reject(new Error(response.error || 'Unknown error'));
            }
          }
        });
        
        // 发送事件
        import.meta.hot.send('safescan:runtime-event', {
          id: eventId,
          type,
          payload,
          broadcast: options.broadcast || false
        });
        
        // 超时处理
        setTimeout(() => {
          cleanup();
          reject(new Error('Event response timeout'));
        }, 5000);
      });
    }
  };

  // 初始化完成回调
  window.__SAFESCAN_RUNTIME__.onInit = (callback) => {
    if (typeof callback === 'function') {
      callback(window.__SAFESCAN_RUNTIME__);
    }
  };
  
  // 监听运行时广播事件
  if (import.meta.hot) {
    import.meta.hot.on('safescan:runtime-event:broadcast', (data) => {
      // 分发事件
      if (data && data.type) {
        const event = new CustomEvent('safescan:' + data.type, { 
          detail: data.payload || {} 
        });
        window.dispatchEvent(event);
      }
    });

    // 通知初始化完成
    import.meta.hot.send('safescan:runtime-event', {
      id: 'init-' + Date.now(),
      type: '${ModuleEventType.READY}',
      payload: { version: '0.1.0' },
      broadcast: false
    });
  }

  console.log('[SafeScan] 运行时初始化完成');
})();
  `;
}

/**
 * 生成虚拟模块代码
 */
function generateVirtualModuleCode(): string {
  return `
// SafeScan虚拟模块
export const VERSION = '0.1.0';

// 运行时API
export const runtime = window.__SAFESCAN_RUNTIME__;

// 通知API
export const notify = window.__SAFESCAN_NOTIFY__;

// 提供运行时帮助函数
export function getSafeScanRuntime() {
  return window.__SAFESCAN_RUNTIME__;
}

// 提供通知帮助函数
export function getSafeScanNotify() {
  return window.__SAFESCAN_NOTIFY__;
}

// 触发运行时事件
export function triggerRuntimeEvent(eventType, payload = {}) {
  if (!runtime) {
    console.error('[SafeScan] 运行时未初始化，无法触发事件');
    return Promise.reject(new Error('Runtime not initialized'));
  }
  
  return runtime.sendRuntimeEvent(eventType, payload, { broadcast: true });
}

// 监听运行时事件
export function onRuntimeEvent(eventType, callback) {
  if (typeof window === 'undefined') return () => {};

  const handler = (e) => callback(e.detail);
  window.addEventListener('safescan:' + eventType, handler);
  
  // 返回清理函数
  return () => {
    window.removeEventListener('safescan:' + eventType, handler);
  };
}

console.log('[SafeScan] 虚拟模块已加载');
  `;
}
