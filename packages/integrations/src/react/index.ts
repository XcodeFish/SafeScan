/**
 * SafeScan React集成
 * 提供React应用的安全检测和分析功能
 */
import { setupDevToolsIntegration } from './devtools-integration';
import { setupHooksAnalyzer } from './hooks-analyzer';
import { initReactInspector } from './inspector';
import { setupLifecycleMonitor } from './lifecycle-monitor';
import type { SafeScanReactOptions, SafeScanReactInstance } from './types';

/**
 * 初始化SafeScan React集成
 */
export function initSafeScanReact(options: SafeScanReactOptions = {}): SafeScanReactInstance {
  // 初始化React检测器
  const inspector = initReactInspector({
    enabledInDevelopment: options.enabledInDevelopment,
    trackRenders: options.trackRenders,
    checkPropChanges: options.checkPropChanges,
  });

  // 设置Hooks分析
  const hooksAnalyzer = setupHooksAnalyzer(options.hooksOptions);

  // 设置生命周期监控
  const lifecycleMonitor = setupLifecycleMonitor(options.lifecycleOptions);

  // 设置DevTools集成
  const devTools =
    options.enableDevTools !== false ? setupDevToolsIntegration(options.devToolsOptions) : null;

  return {
    inspector,
    hooksAnalyzer,
    lifecycleMonitor,
    devTools,

    // 清理方法
    cleanup: () => {
      inspector.cleanup();
      hooksAnalyzer.cleanup();
      lifecycleMonitor.cleanup();
      if (devTools) devTools.cleanup();
    },
  };
}

// 导出所有子模块
export * from './inspector';
export * from './hooks-analyzer';
export * from './lifecycle-monitor';
export * from './devtools-integration';
export * from './types';
