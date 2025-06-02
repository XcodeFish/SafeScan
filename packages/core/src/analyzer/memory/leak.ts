/**
 * 内存泄漏检测工具
 * 提供React组件内存泄漏检测和泄漏模式识别功能
 */
import { Framework } from '../../types';
import {
  MemoryObjectType,
  IMemoryObject,
  TSnapshotDiff,
  compareSnapshots,
  createSnapshot,
} from './snapshot';

/**
 * 泄漏严重程度
 */
export enum LeakSeverity {
  CRITICAL = 'critical', // 严重泄漏
  HIGH = 'high', // 高严重性
  MEDIUM = 'medium', // 中等严重性
  LOW = 'low', // 低严重性
  INFO = 'info', // 信息
}

/**
 * 泄漏模式类型
 */
export enum LeakPatternType {
  DETACHED_DOM = 'detached_dom', // 分离的DOM节点
  ZOMBIE_COMPONENT = 'zombie_component', // 僵尸组件实例
  EVENT_LISTENER = 'dangling_event_listener', // 悬挂的事件监听器
  TIMER_REFERENCE = 'timer_reference', // 定时器引用
  CLOSURE_CYCLE = 'closure_cycle', // 闭包循环引用
  PROMISE_CHAIN = 'promise_chain', // Promise链
  LARGE_CACHE = 'large_cache', // 大型缓存
  GROWING_COLLECTION = 'growing_collection', // 增长的集合
  CONTEXT_REFERENCE = 'context_reference', // Context引用
  REDUX_STORE = 'redux_store', // Redux Store引用
  OTHER = 'other', // 其他类型
}

/**
 * 泄漏检测结果
 */
export interface ILeakDetectionResult {
  /** 结果ID */
  id: string;
  /** 检测时间 */
  timestamp: number;
  /** 是否检测到泄漏 */
  hasLeak: boolean;
  /** 泄漏对象 */
  leaks: ILeakInfo[];
  /** 基准快照ID */
  baseSnapshotId?: string;
  /** 目标快照ID */
  targetSnapshotId?: string;
  /** 差分分析ID */
  diffId?: string;
  /** 内存增长（字节） */
  memoryGrowth: number;
  /** 检测持续时间（毫秒） */
  duration: number;
  /** 扫描对象计数 */
  objectsScanned: number;
}

/**
 * 泄漏信息
 */
export interface ILeakInfo {
  /** 泄漏ID */
  id: string;
  /** 泄漏对象 */
  object: IMemoryObject;
  /** 泄漏模式 */
  pattern: LeakPatternType;
  /** 严重程度 */
  severity: LeakSeverity;
  /** 泄漏大小（字节） */
  size: number;
  /** 泄漏描述 */
  description: string;
  /** 修复建议 */
  fixSuggestion?: string;
  /** 引用链（从根对象到泄漏对象） */
  retentionPath?: IMemoryObject[];
  /** 泄漏详细信息 */
  details?: Record<string, any>;
  /** 泄漏所属框架 */
  framework?: Framework;
  /** 组件名称（如适用） */
  componentName?: string;
  /** 组件路径（如适用） */
  componentPath?: string;
}

/**
 * 泄漏检测配置
 */
export interface ILeakDetectionConfig {
  /** 扫描间隔（毫秒） */
  scanInterval?: number;
  /** 扫描次数 */
  scanCount?: number;
  /** 强制垃圾回收 */
  forceGC?: boolean;
  /** 检测框架 */
  framework?: Framework;
  /** 严重程度阈值 */
  severityThreshold?: LeakSeverity;
  /** 大小阈值（字节） */
  sizeThreshold?: number;
  /** 增长率阈值（0-1） */
  growthRateThreshold?: number;
  /** 是否检测分离的DOM节点 */
  detectDetachedDom?: boolean;
  /** 是否检测僵尸组件 */
  detectZombieComponents?: boolean;
  /** 是否检测悬挂的事件监听器 */
  detectEventListeners?: boolean;
  /** 是否检测定时器引用 */
  detectTimers?: boolean;
  /** 是否检测闭包循环引用 */
  detectClosureCycles?: boolean;
}

// 默认泄漏检测配置
const DEFAULT_LEAK_DETECTION_CONFIG: ILeakDetectionConfig = {
  scanInterval: 2000, // 扫描间隔2秒
  scanCount: 3, // 扫描3次
  forceGC: false, // 不强制GC
  severityThreshold: LeakSeverity.LOW, // 低严重程度
  sizeThreshold: 1024 * 50, // 50KB
  growthRateThreshold: 0.1, // 10%增长率
  detectDetachedDom: true,
  detectZombieComponents: true,
  detectEventListeners: true,
  detectTimers: true,
  detectClosureCycles: true,
};

/**
 * 检测内存泄漏
 * @param config 泄漏检测配置
 * @returns 泄漏检测结果Promise
 */
export async function detectMemoryLeak(
  config: ILeakDetectionConfig = DEFAULT_LEAK_DETECTION_CONFIG
): Promise<ILeakDetectionResult> {
  const startTime = Date.now();

  // 创建基准快照
  const baseSnapshot = await createSnapshot('leak-detection-base');

  // 等待配置的间隔时间
  await new Promise((resolve) => setTimeout(resolve, config.scanInterval || 2000));

  // 如果配置了强制GC，尝试触发垃圾回收
  if (config.forceGC && typeof global !== 'undefined' && global.gc) {
    try {
      global.gc();
    } catch (e) {
      console.warn('无法强制执行垃圾回收。请使用 --expose-gc 标志运行Node.js');
    }
  }

  // 创建目标快照
  const targetSnapshot = await createSnapshot('leak-detection-target');

  // 比较快照
  const diff = compareSnapshots(baseSnapshot.id, targetSnapshot.id);

  if (!diff) {
    // 无法比较快照
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      timestamp: Date.now(),
      hasLeak: false,
      leaks: [],
      baseSnapshotId: baseSnapshot.id,
      targetSnapshotId: targetSnapshot.id,
      memoryGrowth: 0,
      duration: Date.now() - startTime,
      objectsScanned: baseSnapshot.objects.length + targetSnapshot.objects.length,
    };
  }

  // 分析泄漏模式
  const leaks = analyzeLeakPatterns(diff, config);

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
    timestamp: Date.now(),
    hasLeak: leaks.length > 0,
    leaks,
    baseSnapshotId: baseSnapshot.id,
    targetSnapshotId: targetSnapshot.id,
    diffId: diff.id,
    memoryGrowth: diff.totalSizeDelta,
    duration: Date.now() - startTime,
    objectsScanned: baseSnapshot.objects.length + targetSnapshot.objects.length,
  };
}

/**
 * 分析泄漏模式
 * @param diff 快照差分
 * @param config 泄漏检测配置
 * @returns 泄漏信息数组
 */
function analyzeLeakPatterns(diff: TSnapshotDiff, config: ILeakDetectionConfig): ILeakInfo[] {
  const leaks: ILeakInfo[] = [];

  // 从泄漏候选对象开始分析
  for (const candidate of diff.leakCandidates) {
    // 确定泄漏模式和严重程度
    const { pattern, severity } = determineLeakPattern(candidate, diff);

    // 根据配置的阈值过滤泄漏
    if (
      getSeverityValue(severity) < getSeverityValue(config.severityThreshold || LeakSeverity.LOW) ||
      candidate.size < (config.sizeThreshold || 0)
    ) {
      continue;
    }

    // 根据泄漏模式生成描述和修复建议
    const { description, fixSuggestion } = generateLeakGuidance(candidate, pattern);

    // 基于组件类型添加特定信息
    const componentInfo = extractComponentInfo(candidate);

    leaks.push({
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      object: candidate,
      pattern,
      severity,
      size: candidate.size,
      description,
      fixSuggestion,
      framework: determineFramework(candidate),
      componentName: componentInfo.name,
      componentPath: componentInfo.path,
    });
  }

  return leaks;
}

/**
 * 确定泄漏模式和严重程度
 * @param object 内存对象
 * @param diff 差分结果
 * @returns 泄漏模式和严重程度
 */
function determineLeakPattern(
  object: IMemoryObject,
  diff: TSnapshotDiff
): { pattern: LeakPatternType; severity: LeakSeverity } {
  // 基于对象类型和特征确定泄漏模式
  switch (object.type) {
    case MemoryObjectType.DOM_NODE:
      return {
        pattern: LeakPatternType.DETACHED_DOM,
        severity: object.size > 10000 ? LeakSeverity.HIGH : LeakSeverity.MEDIUM,
      };

    case MemoryObjectType.COMPONENT_INSTANCE:
      return {
        pattern: LeakPatternType.ZOMBIE_COMPONENT,
        severity: object.size > 50000 ? LeakSeverity.CRITICAL : LeakSeverity.HIGH,
      };

    case MemoryObjectType.EVENT_LISTENER:
      return {
        pattern: LeakPatternType.EVENT_LISTENER,
        severity: LeakSeverity.MEDIUM,
      };

    case MemoryObjectType.TIMER:
      return {
        pattern: LeakPatternType.TIMER_REFERENCE,
        severity: LeakSeverity.MEDIUM,
      };

    case MemoryObjectType.CLOSURE:
      return {
        pattern: LeakPatternType.CLOSURE_CYCLE,
        severity: object.size > 20000 ? LeakSeverity.HIGH : LeakSeverity.MEDIUM,
      };

    case MemoryObjectType.PROMISE:
      return {
        pattern: LeakPatternType.PROMISE_CHAIN,
        severity: LeakSeverity.MEDIUM,
      };

    case MemoryObjectType.ARRAY:
    case MemoryObjectType.SET:
    case MemoryObjectType.MAP: {
      // 判断是否为大型缓存或增长的集合
      const isGrowing = diff.changed.some(
        (change) => change.after.id === object.id && change.sizeDelta > 5000
      );

      if (isGrowing) {
        return {
          pattern: LeakPatternType.GROWING_COLLECTION,
          severity: object.size > 100000 ? LeakSeverity.HIGH : LeakSeverity.MEDIUM,
        };
      }

      if (object.size > 100000) {
        return {
          pattern: LeakPatternType.LARGE_CACHE,
          severity: LeakSeverity.MEDIUM,
        };
      }
      break;
    }

    default:
      // 对于其他类型，检查是否与上下文或Redux相关
      if (object.name && (object.name.includes('Context') || object.name.includes('Provider'))) {
        return {
          pattern: LeakPatternType.CONTEXT_REFERENCE,
          severity: LeakSeverity.MEDIUM,
        };
      }

      if (object.name && (object.name.includes('Store') || object.name.includes('Redux'))) {
        return {
          pattern: LeakPatternType.REDUX_STORE,
          severity: LeakSeverity.MEDIUM,
        };
      }
  }

  // 默认模式
  return {
    pattern: LeakPatternType.OTHER,
    severity: object.size > 50000 ? LeakSeverity.HIGH : LeakSeverity.LOW,
  };
}

/**
 * 生成泄漏描述和修复建议
 * @param object 内存对象
 * @param pattern 泄漏模式
 * @returns 描述和修复建议
 */
function generateLeakGuidance(
  object: IMemoryObject,
  pattern: LeakPatternType
): { description: string; fixSuggestion?: string } {
  switch (pattern) {
    case LeakPatternType.DETACHED_DOM:
      return {
        description: `检测到分离的DOM节点 (${object.name || '未命名'})，大小为 ${formatBytes(object.size)}。这些节点不再显示但仍被JavaScript引用。`,
        fixSuggestion:
          '移除事件监听器，确保在组件卸载时清除对DOM节点的引用。使用React.useRef或DOM引用时特别注意。',
      };

    case LeakPatternType.ZOMBIE_COMPONENT:
      return {
        description: `检测到僵尸组件实例 (${object.componentName || '未命名组件'})，大小为 ${formatBytes(object.size)}。该组件已卸载但仍被引用。`,
        fixSuggestion:
          '检查组件中的事件监听器、定时器和订阅是否在组件卸载时被清理。特别注意useEffect的清理函数。',
      };

    case LeakPatternType.EVENT_LISTENER:
      return {
        description: `检测到未移除的事件监听器，大小为 ${formatBytes(object.size)}。`,
        fixSuggestion:
          '确保在组件卸载或元素移除时移除所有事件监听器。使用命名函数而非匿名函数以便正确移除。',
      };

    case LeakPatternType.TIMER_REFERENCE:
      return {
        description: `检测到未清除的定时器引用，大小为 ${formatBytes(object.size)}。`,
        fixSuggestion:
          '确保在组件卸载时使用clearTimeout或clearInterval清除所有定时器。在useEffect的清理函数中执行清理操作。',
      };

    case LeakPatternType.CLOSURE_CYCLE:
      return {
        description: `检测到闭包循环引用，大小为 ${formatBytes(object.size)}。函数引用了保存自身引用的外部变量。`,
        fixSuggestion:
          '检查可能形成循环引用的闭包。使用弱引用(WeakMap/WeakSet)或避免在闭包中存储对自身容器的引用。',
      };

    case LeakPatternType.PROMISE_CHAIN:
      return {
        description: `检测到未解决的Promise链，大小为 ${formatBytes(object.size)}。`,
        fixSuggestion:
          '确保所有Promise都有适当的错误处理，并避免创建无限Promise链。使用带取消功能的promise库或AbortController处理过期的promise。',
      };

    case LeakPatternType.GROWING_COLLECTION:
      return {
        description: `检测到持续增长的集合对象，大小为 ${formatBytes(object.size)}。`,
        fixSuggestion:
          '检查集合是否有边界条件，实现LRU缓存机制或定期清理。确保不会无限添加项目到数组、Map或Set中。',
      };

    case LeakPatternType.LARGE_CACHE:
      return {
        description: `检测到大型缓存对象，大小为 ${formatBytes(object.size)}。`,
        fixSuggestion:
          '实现缓存过期策略，使用LRU或其他缓存算法限制缓存大小。考虑使用WeakMap对缓存键进行弱引用。',
      };

    case LeakPatternType.CONTEXT_REFERENCE:
      return {
        description: `检测到React Context引用导致的泄漏，大小为 ${formatBytes(object.size)}。`,
        fixSuggestion:
          '检查是否在Context Provider中传递了包含组件实例或DOM引用的值。尽量使Context值保持简单，避免引用复杂对象。',
      };

    case LeakPatternType.REDUX_STORE:
      return {
        description: `检测到Redux Store引用导致的泄漏，大小为 ${formatBytes(object.size)}。`,
        fixSuggestion:
          '检查Redux存储的状态是否包含组件实例或DOM节点引用。避免在Redux状态中存储非序列化数据。',
      };

    default:
      return {
        description: `检测到潜在的内存泄漏，大小为 ${formatBytes(object.size)}。`,
        fixSuggestion: '检查长期存活的对象引用，考虑使用弱引用或确保适当清理不再需要的资源。',
      };
  }
}

/**
 * 将字节大小格式化为人类可读形式
 * @param bytes 字节数
 * @returns 格式化后的字符串
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * 获取严重程度数值
 * @param severity 严重程度
 * @returns 严重程度数值
 */
function getSeverityValue(severity: LeakSeverity): number {
  switch (severity) {
    case LeakSeverity.CRITICAL:
      return 4;
    case LeakSeverity.HIGH:
      return 3;
    case LeakSeverity.MEDIUM:
      return 2;
    case LeakSeverity.LOW:
      return 1;
    case LeakSeverity.INFO:
      return 0;
    default:
      return 0;
  }
}

/**
 * 提取组件信息
 * @param object 内存对象
 * @returns 组件名称和路径
 */
function extractComponentInfo(object: IMemoryObject): { name?: string; path?: string } {
  if (object.type !== MemoryObjectType.COMPONENT_INSTANCE) {
    return {};
  }

  return {
    name: object.componentName,
    path: object.componentPath,
  };
}

/**
 * 确定对象所属框架
 * @param object 内存对象
 * @returns 框架类型
 */
function determineFramework(object: IMemoryObject): Framework | undefined {
  // 通过组件名称或元数据推断框架类型
  const metadata = object.metadata || {};

  if (metadata.framework) {
    return metadata.framework as Framework;
  }

  // 基于特征推断框架
  if (object.componentName) {
    if (object.componentName.startsWith('React') || metadata.reactFiber) {
      return Framework.REACT;
    }

    if (metadata.vue || metadata.__vue__) {
      return Framework.VUE;
    }

    if (metadata.svelte) {
      return Framework.SVELTE;
    }

    if (metadata.angular) {
      return Framework.ANGULAR;
    }
  }

  return undefined;
}

/**
 * 检测特定组件的内存泄漏
 * @param componentName 组件名称
 * @param componentPath 组件路径
 * @param config 检测配置
 * @returns 检测结果Promise
 */
export async function detectComponentLeak(
  componentName: string,
  componentPath?: string,
  config: ILeakDetectionConfig = DEFAULT_LEAK_DETECTION_CONFIG
): Promise<ILeakDetectionResult> {
  // 创建基准快照
  const baseSnapshot = await createSnapshot(`component-${componentName}-before`);

  // 等待间隔
  await new Promise((resolve) => setTimeout(resolve, config.scanInterval || 2000));

  // 如果配置了强制GC，尝试触发垃圾回收
  if (config.forceGC && typeof global !== 'undefined' && global.gc) {
    try {
      global.gc();
    } catch (e) {
      console.warn('无法强制执行垃圾回收。请使用 --expose-gc 标志运行Node.js');
    }
  }

  // 创建目标快照
  const targetSnapshot = await createSnapshot(`component-${componentName}-after`);

  // 比较快照
  const diff = compareSnapshots(baseSnapshot.id, targetSnapshot.id);

  if (!diff) {
    // 无法比较快照
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      timestamp: Date.now(),
      hasLeak: false,
      leaks: [],
      baseSnapshotId: baseSnapshot.id,
      targetSnapshotId: targetSnapshot.id,
      memoryGrowth: 0,
      duration: 0,
      objectsScanned: baseSnapshot.objects.length + targetSnapshot.objects.length,
    };
  }

  // 过滤只关心特定组件的泄漏
  const componentLeaks = diff.leakCandidates.filter((obj) => {
    if (obj.type !== MemoryObjectType.COMPONENT_INSTANCE) {
      return false;
    }

    if (obj.componentName !== componentName) {
      return false;
    }

    if (componentPath && obj.componentPath !== componentPath) {
      return false;
    }

    return true;
  });

  // 分析泄漏模式
  const leaks: ILeakInfo[] = [];

  for (const leak of componentLeaks) {
    const { pattern, severity } = determineLeakPattern(leak, diff);
    const { description, fixSuggestion } = generateLeakGuidance(leak, pattern);

    leaks.push({
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
      object: leak,
      pattern,
      severity,
      size: leak.size,
      description,
      fixSuggestion,
      framework: determineFramework(leak),
      componentName: leak.componentName,
      componentPath: leak.componentPath,
    });
  }

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
    timestamp: Date.now(),
    hasLeak: leaks.length > 0,
    leaks,
    baseSnapshotId: baseSnapshot.id,
    targetSnapshotId: targetSnapshot.id,
    diffId: diff.id,
    memoryGrowth: diff.totalSizeDelta,
    duration: diff.timestamp - baseSnapshot.timestamp,
    objectsScanned: baseSnapshot.objects.length + targetSnapshot.objects.length,
  };
}
