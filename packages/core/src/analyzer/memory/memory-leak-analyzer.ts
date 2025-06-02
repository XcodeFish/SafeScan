/**
 * 内存泄漏综合分析器
 * 集成各个内存泄漏检测组件
 */
import { Framework } from '../../types';
import { ILeakDetectionConfig, ILeakDetectionResult } from './leak';
import { analyzeLeakPatterns, ILeakPatternConfig } from './leak-pattern';
import {
  ReactLeakType,
  detectReactComponentLeak,
  IReactLeakDetectionConfig,
} from './react-leak-detector';
import {
  traceReferenceChains,
  IReferenceChainConfig,
  IReferenceChainInfo,
} from './reference-chain';
import { chainToVisData, generateHTMLReport } from './reference-chain-visualizer';
import { createSnapshot, TMemorySnapshot } from './snapshot';

/**
 * 内存泄漏分析配置
 */
export interface IMemoryLeakAnalyzerConfig {
  /** 框架 */
  framework: Framework;
  /** 组件名称 */
  componentName?: string;
  /** 组件路径 */
  componentPath?: string;
  /** 是否自动创建快照 */
  autoSnapshot?: boolean;
  /** 是否生成报告 */
  generateReport?: boolean;
  /** 报告路径 */
  reportPath?: string;
  /** 泄漏检测配置 */
  leakDetectionConfig?: ILeakDetectionConfig;
  /** 引用链配置 */
  referenceChainConfig?: IReferenceChainConfig;
  /** 泄漏模式配置 */
  leakPatternConfig?: ILeakPatternConfig;
}

/**
 * 内存泄漏分析结果
 */
export interface IMemoryLeakAnalysisResult {
  /** 泄漏检测结果 */
  leakDetectionResult: ILeakDetectionResult;
  /** 引用链信息 */
  referenceChains: IReferenceChainInfo[];
  /** 报告路径(如果生成) */
  reportPath?: string;
  /** 快照 */
  snapshot?: TMemorySnapshot;
}

/**
 * 默认内存泄漏分析配置
 */
const DEFAULT_MEMORY_LEAK_ANALYZER_CONFIG: IMemoryLeakAnalyzerConfig = {
  framework: Framework.REACT,
  autoSnapshot: true,
  generateReport: true,
};

/**
 * 分析内存泄漏
 * @param config 分析配置
 * @returns 分析结果
 */
export async function analyzeMemoryLeak(
  config: IMemoryLeakAnalyzerConfig = DEFAULT_MEMORY_LEAK_ANALYZER_CONFIG
): Promise<IMemoryLeakAnalysisResult> {
  // 使用传入的配置或默认配置
  const finalConfig = { ...DEFAULT_MEMORY_LEAK_ANALYZER_CONFIG, ...config };

  // 初始化结果
  const result: IMemoryLeakAnalysisResult = {
    leakDetectionResult: {
      id: `leak-detection-${Date.now()}`,
      timestamp: Date.now(),
      hasLeak: false,
      leaks: [],
      memoryGrowth: 0,
      duration: 0,
      objectsScanned: 0,
    },
    referenceChains: [],
  };

  // 创建快照(如果需要)
  let snapshot: TMemorySnapshot | undefined;
  if (finalConfig.autoSnapshot) {
    const snapshotName = `leak-analysis-${finalConfig.componentName || 'global'}-${Date.now()}`;
    snapshot = await createSnapshot(snapshotName);
    result.snapshot = snapshot;
  }

  // 根据框架执行对应的泄漏检测
  switch (finalConfig.framework) {
    case Framework.REACT: {
      // 使用React特定检测器
      const reactResult = await detectReactComponentLeak(
        finalConfig.componentName || 'unknown',
        finalConfig.componentPath,
        finalConfig.leakDetectionConfig as IReactLeakDetectionConfig
      );

      // 使用泄漏模式分析增强结果
      if (snapshot) {
        result.leakDetectionResult = analyzeLeakPatterns(
          reactResult,
          snapshot,
          undefined,
          finalConfig.leakPatternConfig
        );
      } else {
        result.leakDetectionResult = reactResult;
      }

      break;
    }
    // 可以添加其他框架的处理
    default:
      throw new Error(`不支持的框架: ${finalConfig.framework}`);
  }

  // 如果检测到泄漏且有快照，生成引用链
  if (result.leakDetectionResult.hasLeak && snapshot) {
    // 为每个泄漏对象生成引用链
    for (const leak of result.leakDetectionResult.leaks) {
      const chains = traceReferenceChains(
        leak.object.id,
        snapshot,
        finalConfig.referenceChainConfig
      );

      result.referenceChains.push(...chains);
    }
  }

  // 生成报告(如果需要)
  if (finalConfig.generateReport && result.referenceChains.length > 0) {
    result.reportPath = generateLeakReport(result.referenceChains, finalConfig);
  }

  return result;
}

/**
 * 生成泄漏报告
 * @param chains 引用链数组
 * @param config 分析配置
 * @returns 报告路径
 */
function generateLeakReport(
  chains: IReferenceChainInfo[],
  config: IMemoryLeakAnalyzerConfig
): string {
  const reports: string[] = [];

  // 为每个引用链生成可视化数据并转换为HTML
  for (const chain of chains) {
    const visData = chainToVisData(chain);
    const html = generateHTMLReport(visData);
    reports.push(html);
  }

  // 简单实现：返回报告路径，实际使用时需将报告保存到文件系统
  const reportPath = config.reportPath || `memory-leak-report-${Date.now()}.html`;

  // 这里可以添加将报告保存到文件系统的逻辑
  console.info(`报告已生成: ${reportPath}（实际需要保存到文件系统）`);

  return reportPath;
}

/**
 * 导出引用链JSON
 * @param chains 引用链数组
 * @returns JSON字符串
 */
export function exportReferenceChains(chains: IReferenceChainInfo[]): string {
  return JSON.stringify(
    chains.map((chain) => ({
      id: chain.id,
      type: chain.type,
      length: chain.length,
      rootObject: {
        id: chain.root.id,
        type: chain.root.type,
        name: chain.root.name,
        size: chain.root.size,
      },
      leakObject: {
        id: chain.leakObject.id,
        type: chain.leakObject.type,
        name: chain.leakObject.name,
        size: chain.leakObject.size,
      },
      explanation: chain.explanation,
      fixSuggestion: chain.fixSuggestion,
    })),
    null,
    2
  );
}

/**
 * 获取React特定泄漏类型描述
 * @param leakType React泄漏类型
 * @returns 描述文本
 */
export function getReactLeakTypeDescription(leakType: ReactLeakType): string {
  switch (leakType) {
    case ReactLeakType.HOOK_CLEANUP_MISSING:
      return 'useEffect清理函数缺失，导致卸载后仍有副作用运行';
    case ReactLeakType.EVENT_LISTENER_UNMOUNT:
      return '组件卸载后，事件监听器未被移除';
    case ReactLeakType.INTERVAL_UNMOUNT:
      return '组件卸载后，定时器仍在运行';
    case ReactLeakType.CLOSURE_CAPTURE:
      return '闭包捕获了可能导致内存泄漏的变量引用';
    case ReactLeakType.CONTEXT_SUBSCRIPTION:
      return 'Context订阅没有在组件卸载时取消';
    case ReactLeakType.INVALID_DEPS_ARRAY:
      return 'useEffect/useMemo/useCallback的依赖数组不完整';
    case ReactLeakType.MEMO_LEAK:
      return 'useMemo或useCallback导致的内存泄漏';
    case ReactLeakType.GLOBAL_STORE:
      return '全局状态存储(如Redux)中保留了组件引用';
    case ReactLeakType.MEMO_EXCESSIVE:
      return '过度使用memo导致内存消耗增加';
    case ReactLeakType.UNMOUNTED_STATE_UPDATE:
      return '组件卸载后仍然尝试更新状态';
    default:
      return '未知的React特定泄漏类型';
  }
}
