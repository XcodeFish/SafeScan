/**
 * SafeScan构建工具插件
 * 提供多种构建工具集成
 */

// 导出Webpack插件
import SafeScanWebpackPlugin from './webpack';
export { SafeScanWebpackPlugin };

// 导出为具名导出
export const webpack = SafeScanWebpackPlugin;

// 其他构建工具插件
// 将来会添加Vite、esbuild和Rollup插件
// export { default as VitePlugin } from './vite';
// export { default as EsbuildPlugin } from './esbuild';
// export { default as RollupPlugin } from './rollup';
