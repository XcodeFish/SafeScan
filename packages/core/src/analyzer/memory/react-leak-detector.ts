/**
 * React组件内存泄漏检测器
 * 提供React组件内存泄漏专项检测功能
 */
import { Framework } from '../../types';
import {
  ILeakDetectionConfig,
  ILeakDetectionResult,
  ILeakInfo,
  LeakPatternType,
  LeakSeverity,
  detectComponentLeak,
} from './leak';
import { createSnapshot } from './snapshot';

// 确保WeakRef类型可用
declare global {
  interface WeakRef<T extends object> {
    readonly [Symbol.toStringTag]: string;
    deref(): T | undefined;
  }

  let WeakRef: {
    prototype: WeakRef<object>;
    new <T extends object>(target: T): WeakRef<T>;
  };
}

/**
 * React内存泄漏类型
 */
export enum ReactLeakType {
  HOOK_CLEANUP_MISSING = 'hook_cleanup_missing', // useEffect清理函数缺失
  EVENT_LISTENER_UNMOUNT = 'event_listener_unmount', // 卸载后的事件监听器
  INTERVAL_UNMOUNT = 'interval_unmount', // 卸载后的定时器
  CLOSURE_CAPTURE = 'closure_capture', // 闭包捕获
  CONTEXT_SUBSCRIPTION = 'context_subscription', // Context订阅未清理
  INVALID_DEPS_ARRAY = 'invalid_deps_array', // 依赖数组不完整
  MEMO_LEAK = 'memo_leak', // useMemo/useCallback泄漏
  GLOBAL_STORE = 'global_store', // 全局状态存储引用
  MEMO_EXCESSIVE = 'memo_excessive', // 过度使用memo
  UNMOUNTED_STATE_UPDATE = 'unmounted_state_update', // 卸载后状态更新
}

/**
 * React组件泄漏检测配置
 */
export interface IReactLeakDetectionConfig extends ILeakDetectionConfig {
  /** 是否检测useEffect清理函数缺失 */
  detectMissingCleanup?: boolean;
  /** 是否检测卸载后的事件监听器 */
  detectUnmountedEventListeners?: boolean;
  /** 是否检测卸载后的定时器 */
  detectUnmountedIntervals?: boolean;
  /** 是否检测闭包捕获 */
  detectClosureCapture?: boolean;
  /** 是否检测Context订阅未清理 */
  detectContextSubscription?: boolean;
  /** 是否检测不完整的依赖数组 */
  detectInvalidDepsArray?: boolean;
  /** 是否检测卸载后状态更新 */
  detectUnmountedStateUpdate?: boolean;
  /** 监控组件的选择器 */
  componentSelector?: string;
  /** 是否在组件挂载时自动捕获基准快照 */
  autoSnapshotOnMount?: boolean;
  /** 是否在组件卸载时自动捕获目标快照 */
  autoSnapshotOnUnmount?: boolean;
}

// 默认React泄漏检测配置
const DEFAULT_REACT_LEAK_DETECTION_CONFIG: IReactLeakDetectionConfig = {
  scanInterval: 1000, // 扫描间隔1秒
  scanCount: 5, // 扫描5次
  forceGC: true, // 强制GC
  framework: Framework.REACT, // React框架
  severityThreshold: LeakSeverity.LOW, // 低严重程度
  sizeThreshold: 1024 * 10, // 10KB
  growthRateThreshold: 0.05, // 5%增长率
  detectDetachedDom: true,
  detectZombieComponents: true,
  detectEventListeners: true,
  detectTimers: true,
  detectClosureCycles: true,
  detectMissingCleanup: true,
  detectUnmountedEventListeners: true,
  detectUnmountedIntervals: true,
  detectClosureCapture: true,
  detectContextSubscription: true,
  detectInvalidDepsArray: true,
  detectUnmountedStateUpdate: true,
  autoSnapshotOnMount: true,
  autoSnapshotOnUnmount: true,
};

/**
 * React组件内存泄漏检测结果
 */
export interface IReactLeakDetectionResult extends ILeakDetectionResult {
  /** React特定泄漏类型 */
  reactLeakTypes: ReactLeakType[];
  /** Hook相关泄漏 */
  hookLeaks?: Array<{
    /** Hook名称 */
    hookName: string;
    /** 依赖数组问题 */
    depArrayIssue?: boolean;
    /** 清理函数缺失 */
    cleanupMissing?: boolean;
    /** 泄漏类型 */
    leakType: ReactLeakType;
  }>;
  /** 组件卸载时间 */
  unmountTime?: number;
  /** 组件挂载时间 */
  mountTime?: number;
}

// 组件挂载快照映射
const componentMountSnapshots = new Map<string, string>();

// 组件实例映射
const componentInstances = new Map<string, WeakRef<any>>();

// 组件状态跟踪
const componentLifecycleState = new Map<
  string,
  {
    mounted: boolean;
    mountTime: number;
    unmountTime?: number;
    hookCalls?: Array<{
      hookName: string;
      hasCleanup: boolean;
      depsArray?: any[];
    }>;
  }
>();

/**
 * 注册React组件挂载
 * @param componentId 组件ID
 * @param componentName 组件名称
 * @param componentInstance 组件实例
 */
export async function registerComponentMount(
  componentId: string,
  componentName: string,
  componentInstance: any
): Promise<void> {
  // 记录组件实例（使用WeakRef避免阻止GC）
  componentInstances.set(componentId, new WeakRef(componentInstance));

  // 更新组件生命周期状态
  componentLifecycleState.set(componentId, {
    mounted: true,
    mountTime: Date.now(),
    hookCalls: [],
  });

  // 自动创建挂载时快照
  const config = DEFAULT_REACT_LEAK_DETECTION_CONFIG;
  if (config.autoSnapshotOnMount) {
    const snapshot = await createSnapshot(`component-${componentName}-mount-${componentId}`);
    componentMountSnapshots.set(componentId, snapshot.id);
  }
}

/**
 * 注册React组件卸载
 * @param componentId 组件ID
 * @param componentName 组件名称
 */
export async function registerComponentUnmount(
  componentId: string,
  componentName: string
): Promise<IReactLeakDetectionResult | null> {
  // 更新组件生命周期状态
  const lifecycleState = componentLifecycleState.get(componentId);
  if (lifecycleState) {
    lifecycleState.mounted = false;
    lifecycleState.unmountTime = Date.now();
  }

  // 检测卸载后是否发生泄漏
  const config = DEFAULT_REACT_LEAK_DETECTION_CONFIG;
  if (config.autoSnapshotOnUnmount) {
    // 等待一段时间，让GC有机会运行
    await new Promise((resolve) => setTimeout(resolve, config.scanInterval));

    // 尝试触发垃圾回收
    if (config.forceGC && typeof global !== 'undefined' && global.gc) {
      try {
        global.gc();
      } catch (e) {
        console.warn('无法强制执行垃圾回收');
      }
    }

    // 获取挂载时的快照ID
    const mountSnapshotId = componentMountSnapshots.get(componentId);
    if (!mountSnapshotId) {
      return null;
    }

    // 创建卸载后快照
    await createSnapshot(`component-${componentName}-unmount-${componentId}`);

    // 调用原有组件泄漏检测
    const result = await detectComponentLeak(componentName, undefined, config);

    // 增强结果，添加React特定数据
    const reactResult: IReactLeakDetectionResult = {
      ...result,
      reactLeakTypes: [],
      unmountTime: lifecycleState?.unmountTime,
      mountTime: lifecycleState?.mountTime,
    };

    // 分析React特定泄漏类型
    reactResult.reactLeakTypes = analyzeReactLeakTypes(reactResult.leaks, lifecycleState);

    // 添加Hook相关泄漏信息
    if (lifecycleState?.hookCalls) {
      reactResult.hookLeaks = analyzeHookLeaks(lifecycleState.hookCalls, reactResult.leaks);
    }

    // 清理组件映射
    componentMountSnapshots.delete(componentId);
    componentInstances.delete(componentId);

    return reactResult;
  }

  return null;
}

/**
 * 注册Hook调用
 * @param componentId 组件ID
 * @param hookName hook名称
 * @param hasCleanup 是否有清理函数
 * @param depsArray 依赖数组
 */
export function registerHookCall(
  componentId: string,
  hookName: string,
  hasCleanup: boolean,
  depsArray?: any[]
): void {
  const lifecycleState = componentLifecycleState.get(componentId);
  if (lifecycleState) {
    if (!lifecycleState.hookCalls) {
      lifecycleState.hookCalls = [];
    }

    lifecycleState.hookCalls.push({
      hookName,
      hasCleanup,
      depsArray,
    });
  }
}

/**
 * 分析React特定泄漏类型
 * @param leaks 泄漏信息
 * @param lifecycleState 组件生命周期状态
 * @returns React泄漏类型数组
 */
function analyzeReactLeakTypes(
  leaks: ILeakInfo[],
  lifecycleState?: {
    mounted: boolean;
    mountTime: number;
    unmountTime?: number;
    hookCalls?: Array<{
      hookName: string;
      hasCleanup: boolean;
      depsArray?: any[];
    }>;
  }
): ReactLeakType[] {
  const reactLeakTypes = new Set<ReactLeakType>();

  if (!leaks.length) {
    return [];
  }

  // 分析泄漏类型
  for (const leak of leaks) {
    // 检查Hook清理函数缺失
    if (
      leak.pattern === LeakPatternType.CLOSURE_CYCLE &&
      leak.object.metadata?.reactHook &&
      lifecycleState?.hookCalls
    ) {
      const hookCall = lifecycleState.hookCalls.find(
        (h) => h.hookName === leak.object.metadata?.reactHook
      );

      if (hookCall && !hookCall.hasCleanup) {
        reactLeakTypes.add(ReactLeakType.HOOK_CLEANUP_MISSING);
      }
    }

    // 检查卸载后的事件监听器
    if (
      leak.pattern === LeakPatternType.EVENT_LISTENER &&
      lifecycleState?.unmountTime &&
      leak.object.createdAt &&
      leak.object.createdAt < lifecycleState.unmountTime
    ) {
      reactLeakTypes.add(ReactLeakType.EVENT_LISTENER_UNMOUNT);
    }

    // 检查卸载后的定时器
    if (
      leak.pattern === LeakPatternType.TIMER_REFERENCE &&
      lifecycleState?.unmountTime &&
      leak.object.createdAt &&
      leak.object.createdAt < lifecycleState.unmountTime
    ) {
      reactLeakTypes.add(ReactLeakType.INTERVAL_UNMOUNT);
    }

    // 检查闭包捕获
    if (leak.pattern === LeakPatternType.CLOSURE_CYCLE && leak.object.metadata?.reactHook) {
      reactLeakTypes.add(ReactLeakType.CLOSURE_CAPTURE);
    }

    // 检查Context订阅未清理
    if (leak.pattern === LeakPatternType.CONTEXT_REFERENCE) {
      reactLeakTypes.add(ReactLeakType.CONTEXT_SUBSCRIPTION);
    }

    // 检查依赖数组不完整
    if (
      leak.pattern === LeakPatternType.CLOSURE_CYCLE &&
      leak.object.metadata?.reactHook &&
      lifecycleState?.hookCalls
    ) {
      const hookCall = lifecycleState.hookCalls.find(
        (h) => h.hookName === leak.object.metadata?.reactHook
      );

      if (
        hookCall &&
        hookCall.depsArray &&
        leak.object.metadata?.capturedVariables &&
        !allDependenciesInDepsArray(leak.object.metadata?.capturedVariables, hookCall.depsArray)
      ) {
        reactLeakTypes.add(ReactLeakType.INVALID_DEPS_ARRAY);
      }
    }

    // 检查卸载后状态更新
    if (
      leak.pattern === LeakPatternType.ZOMBIE_COMPONENT &&
      leak.object.metadata?.stateUpdateAfterUnmount
    ) {
      reactLeakTypes.add(ReactLeakType.UNMOUNTED_STATE_UPDATE);
    }

    // 检查全局状态存储引用
    if (leak.pattern === LeakPatternType.REDUX_STORE || leak.object.metadata?.globalStore) {
      reactLeakTypes.add(ReactLeakType.GLOBAL_STORE);
    }
  }

  return Array.from(reactLeakTypes);
}

/**
 * 分析Hook相关泄漏
 * @param hookCalls Hook调用信息
 * @param leaks 泄漏信息
 * @returns Hook泄漏信息数组
 */
function analyzeHookLeaks(
  hookCalls: Array<{
    hookName: string;
    hasCleanup: boolean;
    depsArray?: any[];
  }>,
  leaks: ILeakInfo[]
): Array<{
  hookName: string;
  depArrayIssue?: boolean;
  cleanupMissing?: boolean;
  leakType: ReactLeakType;
}> {
  const hookLeaks: Array<{
    hookName: string;
    depArrayIssue?: boolean;
    cleanupMissing?: boolean;
    leakType: ReactLeakType;
  }> = [];

  // 查找有问题的Hook调用
  for (const hookCall of hookCalls) {
    // 查找与此Hook相关的泄漏
    const relatedLeaks = leaks.filter(
      (leak) => leak.object.metadata?.reactHook === hookCall.hookName
    );

    if (relatedLeaks.length > 0) {
      // 检查清理函数缺失
      if (!hookCall.hasCleanup) {
        hookLeaks.push({
          hookName: hookCall.hookName,
          cleanupMissing: true,
          leakType: ReactLeakType.HOOK_CLEANUP_MISSING,
        });
      }

      // 检查依赖数组问题
      const leakWithCapturedVars = relatedLeaks.find(
        (leak) => leak.object.metadata?.capturedVariables
      );

      if (
        leakWithCapturedVars &&
        hookCall.depsArray &&
        !allDependenciesInDepsArray(
          leakWithCapturedVars.object.metadata?.capturedVariables,
          hookCall.depsArray
        )
      ) {
        hookLeaks.push({
          hookName: hookCall.hookName,
          depArrayIssue: true,
          leakType: ReactLeakType.INVALID_DEPS_ARRAY,
        });
      }
    }
  }

  return hookLeaks;
}

/**
 * 检查所有捕获的变量是否都在依赖数组中
 * @param capturedVariables 捕获的变量
 * @param depsArray 依赖数组
 * @returns 是否所有依赖都在数组中
 */
function allDependenciesInDepsArray(capturedVariables: string[], depsArray: any[]): boolean {
  // 这是一个简化实现，实际需要更复杂的依赖分析
  return capturedVariables.length <= depsArray.length;
}

/**
 * 检测React组件内存泄漏
 * 增强版本，专门针对React组件的内存泄漏检测
 * @param componentName 组件名称
 * @param componentPath 组件路径
 * @param config React泄漏检测配置
 * @returns React泄漏检测结果Promise
 */
export async function detectReactComponentLeak(
  componentName: string,
  componentPath?: string,
  config: IReactLeakDetectionConfig = DEFAULT_REACT_LEAK_DETECTION_CONFIG
): Promise<IReactLeakDetectionResult> {
  // 首先使用基础检测
  const baseResult = await detectComponentLeak(componentName, componentPath, config);

  // 增强结果
  const reactResult: IReactLeakDetectionResult = {
    ...baseResult,
    reactLeakTypes: [],
  };

  // 获取组件生命周期状态
  let lifecycleState:
    | {
        mounted: boolean;
        mountTime: number;
        unmountTime?: number;
        hookCalls?: Array<{
          hookName: string;
          hasCleanup: boolean;
          depsArray?: any[];
        }>;
      }
    | undefined;

  // 查找组件ID
  for (const state of componentLifecycleState.values()) {
    if (state.hookCalls && state.hookCalls.length > 0) {
      lifecycleState = state;
      break;
    }
  }

  // 分析React特定泄漏类型
  reactResult.reactLeakTypes = analyzeReactLeakTypes(reactResult.leaks, lifecycleState);

  // 添加Hook相关泄漏信息
  if (lifecycleState?.hookCalls) {
    reactResult.hookLeaks = analyzeHookLeaks(lifecycleState.hookCalls, reactResult.leaks);
    reactResult.mountTime = lifecycleState.mountTime;
    reactResult.unmountTime = lifecycleState.unmountTime;
  }

  return reactResult;
}

/**
 * 设置监听器，自动检测React组件的泄漏
 * 可以集成到React应用中
 */
export function setupReactLeakDetection(): {
  cleanup: () => void;
  getResults: () => Array<IReactLeakDetectionResult>;
} {
  const results: IReactLeakDetectionResult[] = [];

  // React组件装饰器或高阶组件可以使用这些函数

  // 清理函数
  const cleanup = () => {
    componentMountSnapshots.clear();
    componentInstances.clear();
    componentLifecycleState.clear();
  };

  // 获取结果
  const getResults = () => results;

  return {
    cleanup,
    getResults,
  };
}
