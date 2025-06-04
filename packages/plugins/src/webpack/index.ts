/**
 * SafeScan Webpack插件
 * 提供生产构建检查、包大小监控和可视化报告生成功能
 */

import type { Compiler, Stats } from 'webpack';
import { monitorBundleSize } from './bundle-size';
import { runProductionCheck } from './production-check';
import { generateReport } from './report';
import { SafeScanWebpackPluginOptions } from './types';

class SafeScanWebpackPlugin {
  private options: SafeScanWebpackPluginOptions;

  constructor(options: Partial<SafeScanWebpackPluginOptions> = {}) {
    this.options = {
      productionCheck: true,
      bundleSizeMonitor: true,
      visualReport: true,
      reportOutputPath: 'safescan-report.html',
      sizeLimit: 250 * 1024, // 默认警告阈值250KB
      ...options,
    };
  }

  apply(compiler: Compiler): void {
    // 访问SafeScan核心API
    const isProduction = compiler.options.mode === 'production';

    // 生产构建检查
    if (this.options.productionCheck && isProduction) {
      compiler.hooks.afterEmit.tapAsync(
        'SafeScanWebpackPlugin',
        (compilation: any, callback: any) => {
          runProductionCheck(compilation, this.options);
          callback();
        }
      );
    }

    // 包大小监控
    if (this.options.bundleSizeMonitor) {
      compiler.hooks.done.tap('SafeScanWebpackPlugin', (stats: Stats) => {
        monitorBundleSize(stats, this.options);
      });
    }

    // 可视化报告生成
    if (this.options.visualReport) {
      compiler.hooks.done.tap('SafeScanWebpackPlugin', (stats: Stats) => {
        generateReport(stats, compiler, this.options);
      });
    }
  }
}

export = SafeScanWebpackPlugin;
