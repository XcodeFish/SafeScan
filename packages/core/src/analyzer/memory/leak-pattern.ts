/**
 * 泄漏模式识别机制
 * 提供对内存泄漏模式的识别和分类功能
 */
import crypto from 'crypto';
import { Framework } from '../../types';
import { ILeakDetectionResult, ILeakInfo, LeakPatternType, LeakSeverity } from './leak';
import { IMemoryObject, MemoryObjectType, TMemorySnapshot, TSnapshotDiff } from './snapshot';

/**
 * 泄漏特征
 */
export interface ILeakFeature {
  /** 特征ID */
  id: string;
  /** 特征名称 */
  name: string;
  /** 特征描述 */
  description: string;
  /** 检测函数 */
  detect: (obj: IMemoryObject, snapshot?: TMemorySnapshot, diff?: TSnapshotDiff) => boolean;
  /** 泄漏类型 */
  patternType: LeakPatternType;
  /** 严重程度 */
  severity: LeakSeverity;
  /** 适用的框架 */
  frameworks: Framework[];
  /** 修复建议 */
  fixSuggestion: string;
}

/**
 * 泄漏模式识别配置
 */
export interface ILeakPatternConfig {
  /** 最小匹配置信度(0-1) */
  minConfidence?: number;
  /** 启用的泄漏模式类型 */
  enabledPatternTypes?: LeakPatternType[];
  /** 最小严重程度阈值 */
  minSeverity?: LeakSeverity;
  /** 应用的框架 */
  framework?: Framework;
  /** 是否使用机器学习增强 */
  useMLEnhancement?: boolean;
  /** 是否收集统计数据 */
  collectStats?: boolean;
  /** 用户反馈数据路径 */
  feedbackDataPath?: string;
  /** 特征阈值比例 */
  featureThresholdRatio?: number;
}

// 默认泄漏模式识别配置
const DEFAULT_LEAK_PATTERN_CONFIG: ILeakPatternConfig = {
  minConfidence: 0.6,
  minSeverity: LeakSeverity.LOW,
  framework: Framework.REACT,
  useMLEnhancement: false,
  collectStats: true,
  featureThresholdRatio: 0.25,
};

/**
 * 泄漏模式匹配结果
 */
export interface ILeakPatternMatch {
  /** 匹配ID */
  id: string;
  /** 泄漏对象ID */
  objectId: string;
  /** 匹配的特征 */
  features: ILeakFeature[];
  /** 匹配置信度(0-1) */
  confidence: number;
  /** 泄漏类型 */
  patternType: LeakPatternType;
  /** 严重程度 */
  severity: LeakSeverity;
  /** 描述 */
  description: string;
  /** 修复建议 */
  fixSuggestion: string;
}

/**
 * 泄漏统计数据
 */
export interface ILeakStats {
  /** 检测总次数 */
  totalDetections: number;
  /** 发现的泄漏数 */
  totalLeaksFound: number;
  /** 各类型泄漏计数 */
  typeCount: Record<LeakPatternType, number>;
  /** 各严重程度计数 */
  severityCount: Record<LeakSeverity, number>;
  /** 各框架计数 */
  frameworkCount: Record<string, number>;
  /** 各特征匹配计数 */
  featureMatchCount: Record<string, number>;
  /** 用户反馈正确率 */
  userFeedbackAccuracy: number;
  /** 假阳性率 */
  falsePositiveRate: number;
}

// 初始化统计数据
const leakStats: ILeakStats = {
  totalDetections: 0,
  totalLeaksFound: 0,
  typeCount: {
    [LeakPatternType.DETACHED_DOM]: 0,
    [LeakPatternType.ZOMBIE_COMPONENT]: 0,
    [LeakPatternType.EVENT_LISTENER]: 0,
    [LeakPatternType.TIMER_REFERENCE]: 0,
    [LeakPatternType.CLOSURE_CYCLE]: 0,
    [LeakPatternType.PROMISE_CHAIN]: 0,
    [LeakPatternType.LARGE_CACHE]: 0,
    [LeakPatternType.GROWING_COLLECTION]: 0,
    [LeakPatternType.CONTEXT_REFERENCE]: 0,
    [LeakPatternType.REDUX_STORE]: 0,
    [LeakPatternType.OTHER]: 0,
  },
  severityCount: {
    [LeakSeverity.CRITICAL]: 0,
    [LeakSeverity.HIGH]: 0,
    [LeakSeverity.MEDIUM]: 0,
    [LeakSeverity.LOW]: 0,
    [LeakSeverity.INFO]: 0,
  },
  frameworkCount: {},
  featureMatchCount: {},
  userFeedbackAccuracy: 0,
  falsePositiveRate: 0,
};

// 注册所有泄漏特征
const leakFeatures: ILeakFeature[] = [];

/**
 * 注册常见的React泄漏特征
 */
function registerReactLeakFeatures() {
  // DOM节点相关特征
  leakFeatures.push({
    id: 'react-detached-dom',
    name: '分离的DOM节点',
    description: '组件卸载后，DOM节点未从文档中移除',
    detect: (obj: IMemoryObject) =>
      obj.type === MemoryObjectType.DOM_NODE && obj.metadata?.detached === true,
    patternType: LeakPatternType.DETACHED_DOM,
    severity: LeakSeverity.MEDIUM,
    frameworks: [Framework.REACT],
    fixSuggestion: '确保在组件卸载时移除所有创建的DOM节点，特别是添加到document.body的节点。',
  });

  // 僵尸组件特征
  leakFeatures.push({
    id: 'react-zombie-component',
    name: '僵尸组件实例',
    description: '组件实例在卸载后仍然存在于内存中',
    detect: (obj: IMemoryObject) =>
      obj.type === MemoryObjectType.COMPONENT_INSTANCE && obj.metadata?.unmounted === true,
    patternType: LeakPatternType.ZOMBIE_COMPONENT,
    severity: LeakSeverity.HIGH,
    frameworks: [Framework.REACT],
    fixSuggestion:
      '检查组件是否在其他地方被引用，如全局对象、闭包或事件处理函数。考虑使用WeakRef或在组件卸载时解除引用。',
  });

  // 事件监听器特征
  leakFeatures.push({
    id: 'react-event-listener',
    name: '未移除的事件监听器',
    description: '组件卸载后，事件监听器未被移除',
    detect: (obj: IMemoryObject) =>
      obj.type === MemoryObjectType.EVENT_LISTENER && obj.metadata?.owner?.unmounted === true,
    patternType: LeakPatternType.EVENT_LISTENER,
    severity: LeakSeverity.HIGH,
    frameworks: [Framework.REACT],
    fixSuggestion:
      '在useEffect的清理函数或componentWillUnmount中移除所有事件监听器，特别是添加到window或document的监听器。',
  });

  // 定时器特征
  leakFeatures.push({
    id: 'react-timer',
    name: '未清除的定时器',
    description: '组件卸载后，定时器仍在运行',
    detect: (obj: IMemoryObject) =>
      obj.type === MemoryObjectType.TIMER && obj.metadata?.owner?.unmounted === true,
    patternType: LeakPatternType.TIMER_REFERENCE,
    severity: LeakSeverity.HIGH,
    frameworks: [Framework.REACT],
    fixSuggestion:
      '在useEffect的清理函数或componentWillUnmount中清除所有定时器（使用clearTimeout或clearInterval）。',
  });

  // 闭包循环特征
  leakFeatures.push({
    id: 'react-closure-cycle',
    name: '闭包循环引用',
    description: '函数闭包形成循环引用，阻止了垃圾回收',
    detect: (obj: IMemoryObject, snapshot) => {
      if (obj.type !== MemoryObjectType.CLOSURE) {
        return false;
      }

      // 检查闭包是否引用了自身或其父组件
      const hasSelfRef = obj.outgoingReferences?.some(
        (ref) =>
          ref.targetId === obj.id || (snapshot && isCyclicReference(obj.id, ref.targetId, snapshot))
      );

      return hasSelfRef || false;
    },
    patternType: LeakPatternType.CLOSURE_CYCLE,
    severity: LeakSeverity.MEDIUM,
    frameworks: [Framework.REACT],
    fixSuggestion:
      '避免在闭包中直接引用组件实例或大型对象。对于需要在副作用中使用的值，考虑使用useRef存储最新值。',
  });

  // useEffect依赖数组缺失特征
  leakFeatures.push({
    id: 'react-useeffect-deps',
    name: 'useEffect依赖数组不完整',
    description: 'useEffect的依赖数组中缺少被闭包捕获的变量',
    detect: (obj: IMemoryObject) =>
      obj.type === MemoryObjectType.CLOSURE &&
      obj.metadata?.reactHook === 'useEffect' &&
      obj.metadata?.missingDeps === true,
    patternType: LeakPatternType.CLOSURE_CYCLE,
    severity: LeakSeverity.MEDIUM,
    frameworks: [Framework.REACT],
    fixSuggestion:
      '确保useEffect的依赖数组包含Effect内部使用的所有变量和函数。使用eslint-plugin-react-hooks可以帮助检测此类问题。',
  });

  // Context引用特征
  leakFeatures.push({
    id: 'react-context-ref',
    name: 'Context引用未清理',
    description: 'Context保留了对已卸载组件的引用',
    detect: (obj: IMemoryObject) =>
      (obj.metadata?.reactContext === true &&
        obj.outgoingReferences?.some(
          (ref) => ref.name === 'consumers' || ref.name === '_currentValue'
        )) ||
      false,
    patternType: LeakPatternType.CONTEXT_REFERENCE,
    severity: LeakSeverity.MEDIUM,
    frameworks: [Framework.REACT],
    fixSuggestion:
      '避免在Context中存储组件实例或非原始值。如果必须存储复杂对象，确保在组件卸载时移除或更新Context值。',
  });

  // Redux Store引用特征
  leakFeatures.push({
    id: 'react-redux-ref',
    name: 'Redux Store引用',
    description: 'Redux Store中存储了组件实例或DOM节点引用',
    detect: (obj: IMemoryObject) =>
      (obj.metadata?.reduxStore === true &&
        obj.outgoingReferences?.some(
          (ref) =>
            ref.name?.includes('Component') ||
            ref.name?.includes('Element') ||
            ref.name?.includes('Instance')
        )) ||
      false,
    patternType: LeakPatternType.REDUX_STORE,
    severity: LeakSeverity.HIGH,
    frameworks: [Framework.REACT],
    fixSuggestion:
      '避免在Redux状态中存储非序列化数据，如组件实例、DOM节点或类实例。只存储原始值和普通对象。',
  });

  // Promise链特征
  leakFeatures.push({
    id: 'react-promise-chain',
    name: '未处理的Promise链',
    description: '长Promise链阻止了垃圾回收',
    detect: (obj: IMemoryObject) =>
      obj.type === MemoryObjectType.PROMISE && obj.metadata?.chainLength > 5,
    patternType: LeakPatternType.PROMISE_CHAIN,
    severity: LeakSeverity.LOW,
    frameworks: [Framework.REACT],
    fixSuggestion:
      '确保所有Promise链都有适当的错误处理。考虑使用Promise.finally清理资源。在useEffect中使用Promise时，注意处理组件卸载后的场景。',
  });

  // 大型缓存特征
  leakFeatures.push({
    id: 'react-large-cache',
    name: '大型内存缓存',
    description: '组件持有大型缓存，但未设置大小限制',
    detect: (obj: IMemoryObject) =>
      (obj.type === MemoryObjectType.MAP || obj.type === MemoryObjectType.OBJECT) &&
      obj.size > 1024 * 1024 && // 1MB
      obj.metadata?.cacheSize > 100,
    patternType: LeakPatternType.LARGE_CACHE,
    severity: LeakSeverity.MEDIUM,
    frameworks: [Framework.REACT],
    fixSuggestion:
      '对大型缓存使用LRU算法限制大小，或考虑使用WeakMap以允许键被垃圾回收。定期清理不再需要的缓存项。',
  });

  // 增长集合特征
  leakFeatures.push({
    id: 'react-growing-collection',
    name: '持续增长的集合',
    description: '集合大小随时间持续增长，没有清理机制',
    detect: (obj: IMemoryObject, _snapshot, diff) => {
      if (
        obj.type !== MemoryObjectType.ARRAY &&
        obj.type !== MemoryObjectType.MAP &&
        obj.type !== MemoryObjectType.SET
      ) {
        return false;
      }

      // 检查集合是否在快照间持续增长
      const previousSize = obj.metadata?.previousSize || 0;
      const currentSize = obj.metadata?.size || 0;

      // 只有当集合增长率超过阈值时才认为是泄漏
      const growthRate = previousSize > 0 ? (currentSize - previousSize) / previousSize : 0;

      return (diff && growthRate > 0.2) || false; // 20%增长率阈值
    },
    patternType: LeakPatternType.GROWING_COLLECTION,
    severity: LeakSeverity.MEDIUM,
    frameworks: [Framework.REACT],
    fixSuggestion:
      '为集合实现清理机制，如设置最大大小、过期策略或定期清理。考虑使用WeakMap/WeakSet允许键被垃圾回收。',
  });
}

/**
 * 检查是否存在循环引用
 * @param sourceId 源对象ID
 * @param targetId 目标对象ID
 * @param snapshot 内存快照
 * @returns 是否存在循环引用
 */
function isCyclicReference(sourceId: string, targetId: string, snapshot: TMemorySnapshot): boolean {
  // 简单实现，仅检查一层循环引用
  const targetObj = snapshot.objects.find((obj) => obj.id === targetId);
  if (!targetObj || !targetObj.outgoingReferences) {
    return false;
  }

  // 检查目标对象是否引用回源对象
  return targetObj.outgoingReferences.some((ref) => ref.targetId === sourceId);
}

/**
 * 获取严重程度数值
 * @param severity 严重程度
 * @returns 严重程度数值(0-4)
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
    default:
      return 0;
  }
}

/**
 * 获取最高严重程度
 * @param severities 严重程度数组
 * @returns 最高严重程度
 */
function getHighestSeverity(severities: LeakSeverity[]): LeakSeverity {
  if (severities.length === 0) {
    return LeakSeverity.INFO;
  }

  const severityValues = severities.map(getSeverityValue);
  const maxValue = Math.max(...severityValues);

  switch (maxValue) {
    case 4:
      return LeakSeverity.CRITICAL;
    case 3:
      return LeakSeverity.HIGH;
    case 2:
      return LeakSeverity.MEDIUM;
    case 1:
      return LeakSeverity.LOW;
    default:
      return LeakSeverity.INFO;
  }
}

// 初始化特征库
registerReactLeakFeatures();

/**
 * 识别内存对象的泄漏模式
 * @param obj 内存对象
 * @param snapshot 内存快照
 * @param diff 快照差异
 * @param config 泄漏模式配置
 * @returns 泄漏模式匹配结果
 */
export function identifyLeakPattern(
  obj: IMemoryObject,
  snapshot: TMemorySnapshot,
  diff?: TSnapshotDiff,
  config: ILeakPatternConfig = DEFAULT_LEAK_PATTERN_CONFIG
): ILeakPatternMatch | null {
  // 匹配特征
  const matchedFeatures: ILeakFeature[] = [];

  // 只考虑启用的模式类型
  const effectiveFeatures = config.enabledPatternTypes
    ? leakFeatures.filter((f) => config.enabledPatternTypes?.includes(f.patternType))
    : leakFeatures;

  // 检查每个特征是否匹配
  for (const feature of effectiveFeatures) {
    // 考虑框架适用性
    if (config.framework && !feature.frameworks.includes(config.framework)) {
      continue;
    }

    // 检查严重程度阈值
    if (
      config.minSeverity &&
      getSeverityValue(feature.severity) < getSeverityValue(config.minSeverity)
    ) {
      continue;
    }

    // 检测特征
    try {
      if (feature.detect(obj, snapshot, diff)) {
        matchedFeatures.push(feature);

        // 收集统计数据
        if (config.collectStats) {
          leakStats.featureMatchCount[feature.id] =
            (leakStats.featureMatchCount[feature.id] || 0) + 1;
        }
      }
    } catch (err) {
      console.error(`特征检测错误[${feature.id}]:`, err);
    }
  }

  // 如果没有匹配任何特征，返回null
  if (matchedFeatures.length === 0) {
    return null;
  }

  // 计算置信度
  const confidence = Math.min(
    matchedFeatures.length /
      Math.max(effectiveFeatures.length * (config.featureThresholdRatio || 0.25), 1),
    1
  );

  // 如果置信度低于阈值，返回null
  if (confidence < (config.minConfidence || 0.6)) {
    return null;
  }

  // 确定泄漏类型和严重程度
  const patternTypes = matchedFeatures.map((f) => f.patternType);
  const mostCommonType = getMostCommonValue(patternTypes);

  const severities = matchedFeatures.map((f) => f.severity);
  const highestSeverity = getHighestSeverity(severities);

  // 生成描述和修复建议
  const typeFeatures = matchedFeatures.filter((f) => f.patternType === mostCommonType);
  const description = generatePatternDescription(typeFeatures, obj);
  const fixSuggestion = generateFixSuggestions(typeFeatures);

  // 生成结果
  const result: ILeakPatternMatch = {
    id: `pattern-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2)}`,
    objectId: obj.id,
    features: matchedFeatures,
    confidence,
    patternType: mostCommonType,
    severity: highestSeverity,
    description,
    fixSuggestion,
  };

  // 收集统计数据
  if (config.collectStats) {
    leakStats.typeCount[mostCommonType]++;
    leakStats.severityCount[highestSeverity]++;
    leakStats.totalLeaksFound++;
  }

  return result;
}

/**
 * 获取数组中最常见的值
 * @param arr 数组
 * @returns 最常见的值
 */
function getMostCommonValue<T>(arr: T[]): T {
  const counts = arr.reduce(
    (acc, val) => {
      acc[val as any] = (acc[val as any] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  let maxCount = 0;
  let maxVal: T = arr[0];

  for (const val in counts) {
    if (counts[val] > maxCount) {
      maxCount = counts[val];
      maxVal = val as unknown as T;
    }
  }

  return maxVal;
}

/**
 * 生成泄漏模式描述
 * @param features 特征数组
 * @param obj 内存对象
 * @returns 描述文本
 */
function generatePatternDescription(features: ILeakFeature[], obj: IMemoryObject): string {
  if (features.length === 0) {
    return `检测到未知类型的内存泄漏，对象大小: ${formatBytes(obj.size)}`;
  }

  const mainFeature = features[0];
  let description = mainFeature.description;

  if (obj.componentName) {
    description += `。发生在组件 ${obj.componentName} 中`;
  }

  if (obj.size > 1024 * 100) {
    // 100KB
    description += `。泄漏对象占用 ${formatBytes(obj.size)} 的内存，这是一个较大的泄漏`;
  }

  return description;
}

/**
 * 生成修复建议
 * @param features 特征数组
 * @returns 修复建议文本
 */
function generateFixSuggestions(features: ILeakFeature[]): string {
  if (features.length === 0) {
    return '检查是否有长期存活的对象引用，考虑使用WeakRef或在不再需要时解除引用。';
  }

  // 如果只有一个特征，直接返回其修复建议
  if (features.length === 1) {
    return features[0].fixSuggestion;
  }

  // 组合多个特征的建议
  const suggestions = new Set<string>();
  features.forEach((f) => suggestions.add(f.fixSuggestion));

  return Array.from(suggestions).join('\n\n');
}

/**
 * 分析泄漏检测结果，识别泄漏模式
 * @param result 泄漏检测结果
 * @param snapshot 内存快照
 * @param diff 快照差异
 * @param config 泄漏模式配置
 * @returns 增强的泄漏检测结果
 */
export function analyzeLeakPatterns(
  result: ILeakDetectionResult,
  snapshot: TMemorySnapshot,
  diff?: TSnapshotDiff,
  config: ILeakPatternConfig = DEFAULT_LEAK_PATTERN_CONFIG
): ILeakDetectionResult {
  // 更新统计数据
  if (config.collectStats) {
    leakStats.totalDetections++;
  }

  // 如果没有泄漏，直接返回
  if (!result.hasLeak || result.leaks.length === 0) {
    return result;
  }

  // 对每个泄漏对象识别模式
  const enhancedLeaks: ILeakInfo[] = [];

  for (const leak of result.leaks) {
    const patternMatch = identifyLeakPattern(leak.object, snapshot, diff, config);

    if (patternMatch) {
      // 使用识别的模式增强泄漏信息
      enhancedLeaks.push({
        ...leak,
        pattern: patternMatch.patternType,
        severity: patternMatch.severity,
        description: patternMatch.description,
        fixSuggestion: patternMatch.fixSuggestion,
        details: {
          ...leak.details,
          confidence: patternMatch.confidence,
          matchedFeatures: patternMatch.features.map((f) => f.id),
        },
      });

      // 更新框架统计
      if (config.collectStats && leak.framework) {
        const framework = leak.framework.toString();
        leakStats.frameworkCount[framework] = (leakStats.frameworkCount[framework] || 0) + 1;
      }
    } else {
      // 保持原样
      enhancedLeaks.push(leak);
    }
  }

  // 返回增强的结果
  return {
    ...result,
    leaks: enhancedLeaks,
  };
}

/**
 * 获取泄漏统计数据
 * @returns 泄漏统计数据
 */
export function getLeakStats(): ILeakStats {
  return { ...leakStats };
}

/**
 * 重置泄漏统计数据
 */
export function resetLeakStats(): void {
  for (const key in leakStats.typeCount) {
    leakStats.typeCount[key as LeakPatternType] = 0;
  }

  for (const key in leakStats.severityCount) {
    leakStats.severityCount[key as LeakSeverity] = 0;
  }

  leakStats.frameworkCount = {};
  leakStats.featureMatchCount = {};
  leakStats.totalDetections = 0;
  leakStats.totalLeaksFound = 0;
  leakStats.userFeedbackAccuracy = 0;
  leakStats.falsePositiveRate = 0;
}

/**
 * 将字节数格式化为人类可读形式
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
 * 注册用户反馈
 * @param leakId 泄漏ID
 * @param isCorrect 识别是否正确
 * @param feedback 用户反馈
 */
export function registerUserFeedback(leakId: string, isCorrect: boolean, feedback?: string): void {
  // 简单实现，实际可能需要将反馈存储到文件或数据库
  console.info(`用户反馈 [${leakId}]: ${isCorrect ? '正确' : '错误'} - ${feedback || ''}`);

  // 更新统计数据
  const feedbackCount = leakStats.totalLeaksFound || 1;
  const correctCount = leakStats.userFeedbackAccuracy * feedbackCount;

  leakStats.userFeedbackAccuracy = (correctCount + (isCorrect ? 1 : 0)) / (feedbackCount + 1);

  if (!isCorrect) {
    leakStats.falsePositiveRate =
      (leakStats.falsePositiveRate * feedbackCount + 1) / (feedbackCount + 1);
  } else {
    leakStats.falsePositiveRate =
      (leakStats.falsePositiveRate * feedbackCount) / (feedbackCount + 1);
  }
}
