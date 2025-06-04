/**
 * HMR集成模块
 * 实现SafeScan的热模块替换功能
 */
import { createFilter } from '@rollup/pluginutils';
import type { HmrContext, ModuleNode, ViteDevServer } from 'vite';
import type { UpdateModuleInfo } from './types';

// HMR客户端事件名称
export const HMR_CUSTOM_EVENT = 'safescan:hmr-update';

interface HMRHandler {
  configureServer(server: ViteDevServer): void;
  handleHotUpdate(ctx: HmrContext): Promise<ModuleNode[] | void>;
  transform(code: string, id: string): Promise<{ code: string } | null>;
}

/**
 * 判断模块是否为SafeScan模块
 * @param id 模块路径
 */
function isSafeScanModule(id: string): boolean {
  // 检查是否为SafeScan的模块
  return (
    id.includes('@safescan/') || id.includes('safescan/') || id.includes('node_modules/safescan/')
  );
}

/**
 * 创建HMR注入处理器
 * @param options 插件配置选项
 */
export function createInjectHMR(
  options: ReturnType<typeof import('./options').resolveOptions>
): HMRHandler {
  // 如果HMR集成被禁用，返回无操作处理器
  if (!options.hmr.enabled) {
    return {
      configureServer: () => {},
      handleHotUpdate: async () => undefined,
      transform: async () => null,
    };
  }

  // 创建过滤器
  const filter = createFilter(
    options.hmr.include.map((ext) => `**/*${ext}`),
    options.hmr.exclude.map((pattern) => (pattern.startsWith('!') ? pattern.slice(1) : pattern))
  );

  // 记录需要监控的模块
  const watchedModules = new Map<string, UpdateModuleInfo>();

  return {
    // 配置开发服务器
    configureServer(server: ViteDevServer) {
      // 监听客户端连接事件
      server.ws.on('connection', () => {
        // 当客户端连接时，发送一个初始化事件
        server.ws.send({
          type: 'custom',
          event: 'safescan:init',
          data: {
            timestamp: Date.now(),
          },
        });
      });

      // 监听SafeScan相关自定义事件
      server.ws.on('safescan:request-update', () => {
        // 当客户端请求更新时，重新发送所有监控的模块信息
        const updates = Array.from(watchedModules.values());
        if (updates.length > 0) {
          server.ws.send({
            type: 'custom',
            event: HMR_CUSTOM_EVENT,
            data: updates,
          });
        }
      });
    },

    // 处理热更新
    async handleHotUpdate(ctx: HmrContext): Promise<ModuleNode[] | void> {
      // 如果不是SafeScan的相关模块，则不进行特殊处理
      if (!filter(ctx.file)) {
        return;
      }

      const { modules, file, timestamp, server } = ctx;

      // 没有影响的模块，直接返回
      if (!modules || modules.length === 0) {
        return;
      }

      // 过滤出相关的模块
      const relevantModules = modules.filter((m: ModuleNode) => m.id && filter(m.id));

      // 更新监控的模块信息
      for (const module of relevantModules) {
        const moduleId = module.id || '';
        const isSafeScanMod = isSafeScanModule(moduleId);

        // 更新或添加到监控列表
        watchedModules.set(moduleId, {
          module,
          file,
          timestamp,
          isEntry: module.importers.size === 0,
          isSafeScanModule: isSafeScanMod,
        });
      }

      // 发送自定义HMR更新事件
      server.ws.send({
        type: 'custom',
        event: HMR_CUSTOM_EVENT,
        data: Array.from(watchedModules.values()).filter((info) =>
          relevantModules.includes(info.module)
        ),
      });

      // 返回要处理的模块，让Vite正常处理HMR
      return relevantModules;
    },

    // 转换模块代码，注入HMR客户端代码
    async transform(code: string, id: string): Promise<{ code: string } | null> {
      // 排除不需要处理的文件
      if (!filter(id)) {
        return null;
      }

      // 检查是否是入口文件或SafeScan相关模块
      const isEntryOrSafeScan =
        isSafeScanModule(id) || id.endsWith('main.js') || id.endsWith('main.ts');

      // 如果不是入口文件或SafeScan模块，不需要注入额外代码
      if (!isEntryOrSafeScan) {
        return null;
      }

      // 构建HMR客户端代码
      // 只在顶级SafeScan模块和入口文件中注入HMR处理代码
      const hmrCode = `
// SafeScan HMR处理
if (import.meta.hot) {
  import.meta.hot.on('${HMR_CUSTOM_EVENT}', (data) => {
    // 处理SafeScan模块更新
    console.log('[SafeScan] 接收到模块热更新:', data);
    
    // 如果有相关的SafeScan模块发生变化，调用刷新函数
    if (window.__SAFESCAN_REFRESH__) {
      window.__SAFESCAN_REFRESH__(data);
    }
  });
  
  // 仅在入口模块执行一次
  if (!window.__SAFESCAN_HMR_INITIALIZED__) {
    window.__SAFESCAN_HMR_INITIALIZED__ = true;
    
    // 接收SafeScan初始化事件
    import.meta.hot.on('safescan:init', (data) => {
      console.log('[SafeScan] 初始化完成，时间戳:', data.timestamp);
      
      // 请求最新的模块状态
      if (import.meta.hot) {
        import.meta.hot.send('safescan:request-update');
      }
    });
  }
}
`;

      // 追加HMR处理代码
      return {
        code: code + hmrCode,
      };
    },
  };
}
