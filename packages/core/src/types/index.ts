/**
 * SafeScan核心类型定义
 */

// 规则相关类型
export interface IRule {
  /** 规则唯一ID */
  id: string;
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description: string;
  /** 规则类别 */
  category: RuleCategory;
  /** 规则严重程度 */
  severity: RuleSeverity;
  /** 规则适用的框架 */
  frameworks?: Framework[];
  /** 规则检测函数 */
  detect: (ast: TAST, context: TRuleContext) => TRuleResult[];
  /** 规则自动修复函数 */
  fix?: (result: TRuleResult, ast: TAST, context: TRuleContext) => TFixResult;
}

// 规则类别
export enum RuleCategory {
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  MEMORY = 'memory',
  BEST_PRACTICE = 'best-practice',
  ACCESSIBILITY = 'accessibility',
}

// 规则严重程度
export enum RuleSeverity {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
  INFO = 'info',
}

// 支持的框架
export enum Framework {
  REACT = 'react',
  VUE = 'vue',
  SVELTE = 'svelte',
  ANGULAR = 'angular',
  NODEJS = 'nodejs',
  VANILLA = 'vanilla',
}

// AST相关类型
export type TAST = any; // 使用SWC的AST类型，后续会具体定义

// 规则上下文
export interface TRuleContext {
  /** 文件路径 */
  filePath: string;
  /** 文件内容 */
  fileContent: string;
  /** 解析配置 */
  parseOptions?: TParseOptions;
  /** 项目配置 */
  projectConfig?: TProjectConfig;
}

// 解析配置
export interface TParseOptions {
  /** 解析器类型 */
  parser?: 'swc' | 'babel' | 'typescript';
  /** 语言类型 */
  language?: 'typescript' | 'javascript' | 'jsx' | 'tsx';
  /** 解析器特定配置 */
  parserOptions?: Record<string, any>;
}

// 项目配置
export interface TProjectConfig {
  /** 规则配置 */
  rules?: Record<string, RuleConfig>;
  /** 忽略的文件 */
  ignorePatterns?: string[];
  /** 缓存配置 */
  cache?: TCacheConfig;
}

// 规则配置
export interface RuleConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 严重程度覆盖 */
  severity?: RuleSeverity;
  /** 特定规则配置 */
  options?: Record<string, any>;
}

// 缓存配置
export interface TCacheConfig {
  /** 是否启用缓存 */
  enabled: boolean;
  /** 缓存路径 */
  path?: string;
  /** 缓存过期时间（毫秒） */
  ttl?: number;
}

// 规则检测结果
export interface TRuleResult {
  /** 规则ID */
  ruleId: string;
  /** 问题消息 */
  message: string;
  /** 严重程度 */
  severity: RuleSeverity;
  /** 代码位置 */
  location: TCodeLocation;
  /** 代码片段 */
  codeSnippet?: string;
  /** 修复建议 */
  fixSuggestion?: string;
  /** 是否可自动修复 */
  fixable: boolean;
}

// 代码位置
export interface TCodeLocation {
  /** 文件路径 */
  filePath: string;
  /** 开始行 */
  startLine: number;
  /** 开始列 */
  startColumn: number;
  /** 结束行 */
  endLine: number;
  /** 结束列 */
  endColumn: number;
}

// 修复结果
export interface TFixResult {
  /** 是否成功修复 */
  success: boolean;
  /** 修复后的代码 */
  fixedCode?: string;
  /** 修复信息 */
  message?: string;
}

// 解析结果
export type TParseResult = {
  success: boolean;
  ast?: any;
  filePath?: string;
  sourceCode?: string;
  errors?: Error[];
  hash?: string;
};
