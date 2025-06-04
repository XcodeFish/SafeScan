/**
 * 选项处理模块
 */
import type {
  HMROptions,
  OverlayOptions,
  RuntimeOptions,
  SafeScanVitePluginOptions,
} from './types';

/**
 * 默认的HMR选项
 */
export const defaultHMROptions: HMROptions = {
  enabled: true,
  include: ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte'],
  exclude: [],
};

/**
 * 默认的覆盖通知选项
 */
export const defaultOverlayOptions: OverlayOptions = {
  enabled: true,
  duration: 3000,
  position: 'top-right',
};

/**
 * 默认的运行时注入选项
 */
export const defaultRuntimeOptions: RuntimeOptions = {
  enabled: true,
  include: ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte'],
  exclude: ['node_modules'],
  config: {},
};

/**
 * 合并配置选项
 * @param target 目标配置对象
 * @param source 源配置对象
 * @returns 合并后的配置对象
 */
function mergeOptions<T>(target: T, source?: Partial<T>): T {
  if (!source) return { ...target };

  const result = { ...target } as any;

  for (const key in source) {
    const value = source[key];

    if (value === undefined) continue;

    if (Array.isArray(value)) {
      result[key] = [...value];
    } else if (value !== null && typeof value === 'object') {
      result[key] = { ...(target as any)[key], ...value };
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * 解析用户配置，应用默认配置
 * @param options 用户配置选项
 * @returns 解析后的完整配置
 */
export function resolveOptions(options: SafeScanVitePluginOptions = {}) {
  return {
    hmr: mergeOptions(defaultHMROptions, options.hmr),
    overlay: mergeOptions(defaultOverlayOptions, options.overlay),
    runtime: mergeOptions(defaultRuntimeOptions, options.runtime),
  };
}
