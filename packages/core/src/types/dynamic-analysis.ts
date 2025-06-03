/**
 * 动态分析相关类型定义
 */
import { RuleCategory, RuleSeverity } from '../types';

/**
 * 代码位置信息
 */
export interface ICodeLocation {
  /** 文件路径 */
  filePath: string;
  /** 行号 */
  line: number;
  /** 列号 */
  column: number;
  /** 代码片段 */
  snippet?: string;
}

/**
 * 修复建议
 */
export interface IFixSuggestion {
  /** 建议ID */
  id: string;
  /** 修复描述 */
  description: string;
  /** 代码位置 */
  location?: ICodeLocation;
  /** 修复代码 */
  fixCode?: string;
  /** 规则ID */
  ruleId?: string;
  /** 关联问题ID */
  issueId?: string;
  /** 创建时间 */
  createdAt: number;
}

/**
 * 问题信息
 */
export interface IIssueInfo {
  /** 问题ID */
  id: string;
  /** 问题类型 */
  type: string;
  /** 问题描述 */
  description: string;
  /** 严重程度 */
  severity: RuleSeverity;
  /** 问题类别 */
  category: RuleCategory;
  /** 代码位置 */
  location?: ICodeLocation;
  /** 堆栈信息 */
  stack?: string;
  /** 修复建议 */
  fixSuggestions: IFixSuggestion[];
  /** 首次发现时间 */
  firstDetected: number;
  /** 最近发现时间 */
  lastDetected: number;
  /** 发生次数 */
  occurrenceCount: number;
}

/**
 * 组件性能记录
 */
export interface IComponentPerformance {
  /** 组件ID */
  componentId: string;
  /** 组件名称 */
  componentName: string;
  /** 组件类型 */
  componentType: string;
  /** 平均渲染时间(ms) */
  averageRenderTime: number;
  /** 最大渲染时间(ms) */
  maxRenderTime: number;
  /** 总渲染次数 */
  renderCount: number;
  /** 不必要的重新渲染次数 */
  unnecessaryReRenderCount: number;
  /** 最近渲染时间 */
  lastRenderTime: number;
  /** 代码位置 */
  location?: ICodeLocation;
}

/**
 * 动态分析统计信息接口
 */
export interface IDynamicAnalysisStatistics {
  /** 总问题数 */
  totalIssues: number;
  /** 严重问题数 */
  criticalIssues: number;
  /** 高风险问题数 */
  highIssues: number;
  /** 中风险问题数 */
  mediumIssues: number;
  /** 低风险问题数 */
  lowIssues: number;
  /** 跟踪的组件数量 */
  componentsTracked: number;
  /** 性能问题数量 */
  performanceIssues: number;
}

/**
 * 动态分析结果接口
 */
export interface IDynamicAnalysis {
  /** 时间戳 */
  timestamp: number;
  /** 问题列表 */
  issues: IIssueInfo[];
  /** 组件性能信息 */
  componentPerformance: IComponentPerformance[];
  /** 统计信息 */
  statistics: IDynamicAnalysisStatistics;
}
