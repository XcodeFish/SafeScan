/**
 * 堆快照分析工具
 * 提供内存快照功能和差分比较算法
 */
import crypto from 'crypto';
import { getCache } from '../../cache/memory';
import { Framework } from '../../types';

// 内存快照缓存
const snapshotCache = getCache<TMemorySnapshot>('memory-snapshot');

/**
 * 内存对象类型
 */
export enum MemoryObjectType {
  GC_ROOT = 'gc_root', // GC根对象
  DOM_NODE = 'dom_node', // DOM节点
  COMPONENT_INSTANCE = 'component_instance', // 组件实例
  EVENT_LISTENER = 'event_listener', // 事件监听器
  CLOSURE = 'closure', // 闭包
  FUNCTION = 'function', // 函数
  OBJECT = 'object', // 普通对象
  ARRAY = 'array', // 数组
  MAP = 'map', // Map对象
  SET = 'set', // Set对象
  PROMISE = 'promise', // Promise对象
  TIMER = 'timer', // 定时器
  UNKNOWN = 'unknown', // 未知类型
}

/**
 * 内存对象
 */
export interface IMemoryObject {
  /** 对象ID */
  id: string;
  /** 对象类型 */
  type: MemoryObjectType;
  /** 对象名称/描述 */
  name?: string;
  /** 对象大小（字节） */
  size: number;
  /** 对象引用计数 */
  retainedCount: number;
  /** 指向该对象的引用 */
  incomingReferences?: IMemoryReference[];
  /** 该对象指向的引用 */
  outgoingReferences?: IMemoryReference[];
  /** 组件名称（组件实例专用） */
  componentName?: string;
  /** 组件实例路径（组件实例专用） */
  componentPath?: string;
  /** 创建时间 */
  createdAt?: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 内存对象引用
 */
export interface IMemoryReference {
  /** 源对象ID */
  sourceId: string;
  /** 目标对象ID */
  targetId: string;
  /** 引用名称/路径 */
  name?: string;
  /** 引用类型 */
  type?: string;
  /** 引用权重 */
  weight?: number;
}

/**
 * 内存快照
 */
export interface TMemorySnapshot {
  /** 快照ID */
  id: string;
  /** 快照标签/名称 */
  label?: string;
  /** 快照创建时间 */
  timestamp: number;
  /** 快照中包含的内存对象 */
  objects: IMemoryObject[];
  /** 对象间的引用关系 */
  references: IMemoryReference[];
  /** 快照总内存占用 */
  totalSize: number;
  /** 快照相关元数据 */
  metadata?: {
    /** 堆总大小 */
    heapTotal?: number;
    /** 堆已使用大小 */
    heapUsed?: number;
    /** 外部内存 */
    externalMemory?: number;
    /** 当前页面URL */
    pageUrl?: string;
    /** 浏览器信息 */
    userAgent?: string;
    /** 框架信息 */
    framework?: Framework;
    /** 框架版本 */
    frameworkVersion?: string;
  };
}

/**
 * 差分比较结果
 */
export interface TSnapshotDiff {
  /** 差分ID */
  id: string;
  /** 比较基准快照ID */
  baseSnapshotId: string;
  /** 比较目标快照ID */
  targetSnapshotId: string;
  /** 创建时间 */
  timestamp: number;
  /** 新增对象 */
  added: IMemoryObject[];
  /** 删除的对象 */
  removed: IMemoryObject[];
  /** 变更的对象 */
  changed: Array<{
    /** 前后对象 */
    before: IMemoryObject;
    after: IMemoryObject;
    /** 变化率 */
    changeRate: number;
    /** 大小变化（字节） */
    sizeDelta: number;
  }>;
  /** 内存泄漏候选对象 */
  leakCandidates: IMemoryObject[];
  /** 总内存变化（字节） */
  totalSizeDelta: number;
  /** 总对象数量变化 */
  totalObjectsDelta: number;
  /** 总引用数量变化 */
  totalReferencesDelta: number;
  /** 差分算法版本 */
  diffVersion: string;
}

/**
 * 内存快照配置
 */
export interface ISnapshotConfig {
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 快照采样间隔（毫秒） */
  sampleInterval?: number;
  /** 是否自动分析泄漏 */
  autoDetectLeaks?: boolean;
  /** 是否包含dom节点 */
  includeDomNodes?: boolean;
  /** 是否包含闭包变量 */
  includeClosureVars?: boolean;
  /** 是否收集详细引用链 */
  collectDetailedReferences?: boolean;
  /** 是否跟踪组件实例生命周期 */
  trackComponentLifecycle?: boolean;
}

// 默认快照配置
const DEFAULT_SNAPSHOT_CONFIG: ISnapshotConfig = {
  enableCache: true,
  sampleInterval: 5000,
  autoDetectLeaks: true,
  includeDomNodes: true,
  includeClosureVars: true,
  collectDetailedReferences: true,
  trackComponentLifecycle: true,
};

/**
 * 获取浏览器内存使用情况
 * @returns 内存使用信息
 */
export function getMemoryInfo(): { heapTotal: number; heapUsed: number; externalMemory?: number } {
  if (typeof window !== 'undefined') {
    // 浏览器环境
    if ('performance' in window && 'memory' in window.performance) {
      const memory = (window.performance as any).memory;
      return {
        heapTotal: memory.totalJSHeapSize || 0,
        heapUsed: memory.usedJSHeapSize || 0,
        externalMemory: memory.jsHeapSizeLimit || 0,
      };
    }
  } else if (typeof process !== 'undefined') {
    // Node.js环境
    const memory = process.memoryUsage();
    return {
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      externalMemory: memory.external,
    };
  }

  return { heapTotal: 0, heapUsed: 0 };
}

/**
 * 生成唯一ID
 * @returns 唯一ID字符串
 */
function generateUniqueId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

/**
 * 创建内存快照
 * @param label 快照标签
 * @param config 快照配置
 * @returns 内存快照
 */
export async function createSnapshot(
  label?: string,
  config: ISnapshotConfig = DEFAULT_SNAPSHOT_CONFIG
): Promise<TMemorySnapshot> {
  // 创建快照ID
  const id = generateUniqueId();
  const timestamp = Date.now();

  // 获取内存信息
  const memoryInfo = getMemoryInfo();

  // TODO: 实现实际的内存快照采集
  // 这里需要注入JavaScript运行时中收集内存对象信息
  // 以下为模拟数据，实际实现需要通过浏览器API或自定义工具获取
  const objects: IMemoryObject[] = [];
  const references: IMemoryReference[] = [];

  const snapshot: TMemorySnapshot = {
    id,
    label,
    timestamp,
    objects,
    references,
    totalSize: memoryInfo.heapUsed,
    metadata: {
      heapTotal: memoryInfo.heapTotal,
      heapUsed: memoryInfo.heapUsed,
      externalMemory: memoryInfo.externalMemory,
      pageUrl: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : undefined,
    },
  };

  // 保存到缓存
  if (config.enableCache) {
    snapshotCache.set(id, snapshot);
  }

  return snapshot;
}

/**
 * 获取已存在的快照
 * @param snapshotId 快照ID
 * @returns 快照实例或undefined
 */
export function getSnapshot(snapshotId: string): TMemorySnapshot | undefined {
  return snapshotCache.get(snapshotId);
}

/**
 * 删除快照
 * @param snapshotId 快照ID
 * @returns 是否删除成功
 */
export function deleteSnapshot(snapshotId: string): boolean {
  return snapshotCache.delete(snapshotId);
}

/**
 * 比较两个快照，生成差分结果
 * @param baseSnapshotId 基准快照ID
 * @param targetSnapshotId 目标快照ID
 * @returns 差分结果
 */
export function compareSnapshots(
  baseSnapshotId: string,
  targetSnapshotId: string
): TSnapshotDiff | null {
  // 获取快照
  const baseSnapshot = getSnapshot(baseSnapshotId);
  const targetSnapshot = getSnapshot(targetSnapshotId);

  if (!baseSnapshot || !targetSnapshot) {
    return null;
  }

  // 创建快照ID映射
  const baseObjectMap = new Map<string, IMemoryObject>();
  baseSnapshot.objects.forEach((obj) => baseObjectMap.set(obj.id, obj));

  const targetObjectMap = new Map<string, IMemoryObject>();
  targetSnapshot.objects.forEach((obj) => targetObjectMap.set(obj.id, obj));

  // 计算新增、删除和变化的对象
  const added: IMemoryObject[] = [];
  const removed: IMemoryObject[] = [];
  const changed: Array<{
    before: IMemoryObject;
    after: IMemoryObject;
    changeRate: number;
    sizeDelta: number;
  }> = [];

  // 查找新增和变化的对象
  targetSnapshot.objects.forEach((targetObj) => {
    const baseObj = baseObjectMap.get(targetObj.id);

    if (!baseObj) {
      // 新增的对象
      added.push(targetObj);
    } else if (
      baseObj.size !== targetObj.size ||
      baseObj.retainedCount !== targetObj.retainedCount
    ) {
      // 变化的对象
      const sizeDelta = targetObj.size - baseObj.size;
      const changeRate = Math.abs(sizeDelta) / Math.max(baseObj.size, 1);

      changed.push({
        before: baseObj,
        after: targetObj,
        changeRate,
        sizeDelta,
      });
    }
  });

  // 查找删除的对象
  baseSnapshot.objects.forEach((baseObj) => {
    if (!targetObjectMap.has(baseObj.id)) {
      removed.push(baseObj);
    }
  });

  // 识别可能的内存泄漏对象
  const leakCandidates = identifyLeakCandidates(added, changed, targetSnapshot.references);

  // 计算汇总统计
  const totalSizeDelta = targetSnapshot.totalSize - baseSnapshot.totalSize;
  const totalObjectsDelta = targetSnapshot.objects.length - baseSnapshot.objects.length;
  const totalReferencesDelta = targetSnapshot.references.length - baseSnapshot.references.length;

  // 创建差分结果
  const diff: TSnapshotDiff = {
    id: generateUniqueId(),
    baseSnapshotId,
    targetSnapshotId,
    timestamp: Date.now(),
    added,
    removed,
    changed,
    leakCandidates,
    totalSizeDelta,
    totalObjectsDelta,
    totalReferencesDelta,
    diffVersion: '1.0.0',
  };

  return diff;
}

/**
 * 识别可能的内存泄漏对象
 * @param added 新增对象
 * @param changed 变化对象
 * @param _references 引用关系
 * @returns 泄漏候选对象
 */
function identifyLeakCandidates(
  added: IMemoryObject[],
  changed: Array<{
    before: IMemoryObject;
    after: IMemoryObject;
    changeRate: number;
    sizeDelta: number;
  }>,
  _references: IMemoryReference[]
): IMemoryObject[] {
  const candidates: IMemoryObject[] = [];

  // 检查新增的大型对象
  const largeAddedObjects = added.filter((obj) => obj.size > 10000 && obj.retainedCount > 0);

  // 检查快速增长的对象
  const growingObjects = changed
    .filter((change) => change.sizeDelta > 5000 && change.changeRate > 0.5)
    .map((change) => change.after);

  // 检查组件实例
  const detachedComponents = added.filter(
    (obj) => obj.type === MemoryObjectType.COMPONENT_INSTANCE && obj.retainedCount > 0
  );

  // 合并候选对象并去重
  const allCandidates = [...largeAddedObjects, ...growingObjects, ...detachedComponents];
  const uniqueCandidateIds = new Set<string>();

  for (const candidate of allCandidates) {
    if (!uniqueCandidateIds.has(candidate.id)) {
      uniqueCandidateIds.add(candidate.id);
      candidates.push(candidate);
    }
  }

  return candidates;
}

/**
 * 分析引用链
 * @param objectId 目标对象ID
 * @param snapshot 内存快照
 * @returns 引用路径
 */
export function analyzeReferenceChain(
  objectId: string,
  snapshot: TMemorySnapshot
): Array<Array<IMemoryReference>> {
  const result: Array<Array<IMemoryReference>> = [];
  const objectMap = new Map<string, IMemoryObject>();

  // 构建对象ID映射表
  snapshot.objects.forEach((obj) => objectMap.set(obj.id, obj));

  // 构建引用图（邻接表表示）
  const referenceGraph = new Map<string, Array<IMemoryReference>>();

  snapshot.references.forEach((ref) => {
    if (!referenceGraph.has(ref.targetId)) {
      referenceGraph.set(ref.targetId, []);
    }
    referenceGraph.get(ref.targetId)!.push(ref);
  });

  // 使用DFS查找所有可能的引用路径
  function findPaths(
    currentId: string,
    currentPath: IMemoryReference[],
    visited: Set<string>
  ): void {
    // 检查是否到达GC Root
    const obj = objectMap.get(currentId);
    if (!obj || obj.type === 'gc_root') {
      result.push([...currentPath]);
      return;
    }

    // 避免循环引用
    if (visited.has(currentId)) {
      return;
    }

    visited.add(currentId);

    // 继续遍历引用链
    const incomingReferences = referenceGraph.get(currentId) || [];
    for (const ref of incomingReferences) {
      findPaths(ref.sourceId, [ref, ...currentPath], new Set(visited));
    }
  }

  findPaths(objectId, [], new Set<string>());

  return result;
}
