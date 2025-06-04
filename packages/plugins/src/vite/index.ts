/**
 * SafeScan Vite插件
 * 提供HMR集成、浏览器覆盖通知和运行时注入功能
 */
import type { Plugin, HmrContext } from 'vite';
import { createInjectHMR } from './hmr';
import { resolveOptions } from './options';
import { createOverlayNotify } from './overlay';
import { createRuntimeInjection, VIRTUAL_MODULE_ID, RESOLVED_VIRTUAL_MODULE_ID } from './runtime';
import type { SafeScanVitePluginOptions } from './types';

/**
 * SafeScan Vite插件
 * @param options 插件配置选项
 * @returns Vite插件
 */
export function safeScanVitePlugin(options: SafeScanVitePluginOptions = {}): Plugin {
  // 解析插件选项，应用默认值
  const resolvedOptions = resolveOptions(options);

  // 创建HMR处理器
  const hmrHandler = createInjectHMR(resolvedOptions);

  // 创建覆盖通知处理器
  const overlayHandler = createOverlayNotify(resolvedOptions);

  // 创建运行时注入处理器
  const runtimeHandler = createRuntimeInjection(resolvedOptions);

  return {
    name: 'vite-plugin-safescan',

    // 解析虚拟模块
    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) {
        return RESOLVED_VIRTUAL_MODULE_ID;
      }
      return null;
    },

    // 配置开发服务器
    configureServer(server) {
      // 应用HMR处理器
      hmrHandler.configureServer(server);

      // 应用覆盖通知处理器
      overlayHandler.configureServer(server);

      // 在内部中间件之后运行
      return () => {
        // 添加运行时中间件
        runtimeHandler.configureServer(server);
      };
    },

    // 处理热更新
    async handleHotUpdate(ctx: HmrContext) {
      // 处理特定文件的热更新
      return hmrHandler.handleHotUpdate(ctx);
    },

    // 转换HTML入口文件
    transformIndexHtml(html) {
      // 注入运行时脚本
      return runtimeHandler.transformIndexHtml(html);
    },

    // 转换模块代码
    async transform(code, id) {
      // 处理虚拟模块
      if (id === RESOLVED_VIRTUAL_MODULE_ID) {
        return runtimeHandler.transform(code, id);
      }

      // 注入HMR运行时代码
      const hmrResult = await hmrHandler.transform(code, id);
      if (hmrResult) return hmrResult;

      // 注入运行时监控代码
      return runtimeHandler.transform(code, id);
    },
  };
}

// 导出插件API
export * from './types';

// 导出虚拟模块ID，方便用户导入
export { VIRTUAL_MODULE_ID } from './runtime';
