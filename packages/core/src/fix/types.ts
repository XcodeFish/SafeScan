/**
 * 修复模板接口
 */
export interface IFixTemplate {
  /** 模板唯一ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 支持的规则ID列表 */
  supportedRules: string[];
  /** 模板描述 */
  description: string;
  /** 模板标签 */
  tags: string[];
  /** 修复函数 */
  fix: (context: IFixContext) => IFixResult;
}

/**
 * 修复上下文接口
 */
export interface IFixContext {
  /** 源代码 */
  sourceCode: string;
  /** 文件路径 */
  filePath: string;
  /** AST节点 */
  node: any;
  /** 规则ID */
  ruleId: string;
  /** 问题位置 */
  location: ISourceLocation;
  /** 原始问题详情 */
  issue: IIssue;
}

/**
 * 源码位置接口
 */
export interface ISourceLocation {
  /** 起始行 */
  startLine: number;
  /** 起始列 */
  startColumn: number;
  /** 结束行 */
  endLine: number;
  /** 结束列 */
  endColumn: number;
}

/**
 * 修复结果接口
 */
export interface IFixResult {
  /** 是否成功修复 */
  fixed: boolean;
  /** 修复后的代码 */
  fixedCode?: string;
  /** 失败原因 */
  failReason?: string;
  /** 修改描述 */
  description: string;
  /** 变更位置 */
  changedLocations: ISourceLocation[];
  /** 修复建议(如果无法自动修复) */
  suggestion?: string;
}

/**
 * 问题接口
 */
export interface IIssue {
  /** 问题ID */
  id: string;
  /** 规则ID */
  ruleId: string;
  /** 问题描述 */
  message: string;
  /** 问题位置 */
  location: ISourceLocation;
  /** 严重程度 */
  severity: 'critical' | 'error' | 'warning' | 'info';
  /** 其他元数据 */
  metadata?: Record<string, any>;
}

/**
 * 修复验证结果
 */
export interface IValidationResult {
  /** 是否验证通过 */
  valid: boolean;
  /** 验证失败原因 */
  errors?: string[];
  /** 验证警告 */
  warnings?: string[];
  /** 性能影响指标(0-10) */
  performanceImpact?: number;
}

/**
 * 修复建议接口
 */
export interface IFixSuggestion {
  /** 建议ID */
  id: string;
  /** 修复描述 */
  description: string;
  /** 问题原因分析 */
  reason: string;
  /** 代码片段 */
  codeSnippet?: string;
  /** 修复示例 */
  exampleFix?: string;
  /** 文档链接 */
  documentationLinks?: string[];
  /** 严重程度 */
  severity: 'critical' | 'error' | 'warning' | 'info';
}
