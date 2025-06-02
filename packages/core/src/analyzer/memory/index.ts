/**
 * 内存追踪引擎
 * 提供堆快照分析、差分比较和内存泄漏检测功能
 */

// 快照模块导出
export {
  createSnapshot,
  getSnapshot,
  deleteSnapshot,
  compareSnapshots,
  analyzeReferenceChain,
  getMemoryInfo,
  MemoryObjectType,
  type IMemoryObject,
  type IMemoryReference,
  type TMemorySnapshot,
  type TSnapshotDiff,
  type ISnapshotConfig,
} from './snapshot';

// 泄漏检测模块导出
export {
  detectMemoryLeak,
  detectComponentLeak,
  LeakSeverity,
  LeakPatternType,
  type ILeakDetectionResult,
  type ILeakInfo,
  type ILeakDetectionConfig,
} from './leak';
