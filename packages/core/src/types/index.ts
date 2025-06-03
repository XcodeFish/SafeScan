/**
 * SafeScan核心类型定义
 */

// 导出缓存系统类型
export * from './cache';

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
  /** 原始严重程度（在配置覆盖后保留） */
  _originalSeverity?: RuleSeverity;
  /** 规则是否被禁用 */
  _disabled?: boolean;
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
  /** 配置注释 */
  _comment?: string;
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
  /** 位置信息 */
  start: {
    line: number;
    column: number;
  };
  /** 结束位置信息 */
  end: {
    line: number;
    column: number;
  };
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

/**
 * 问题严重程度枚举
 */
export enum Severity {
  INFO = 0,
  WARNING = 1,
  ERROR = 2,
  CRITICAL = 3,
}

/**
 * 问题类型枚举
 */
export enum IssueType {
  SECURITY = 'security',
  MEMORY_LEAK = 'memory-leak',
  PERFORMANCE = 'performance',
  ACCESSIBILITY = 'accessibility',
  CODE_QUALITY = 'code-quality',
}

/**
 * 问题定位接口
 */
export interface IssueLocation {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

/**
 * 自动修复接口
 */
export interface IssueFix {
  type: 'replace' | 'insert' | 'delete';
  text: string;
  range?: [number, number];
}

/**
 * 安全问题接口
 */
export interface Issue {
  id: string;
  ruleId: string;
  severity: Severity;
  type: IssueType;
  message: string;
  location: IssueLocation;
  code?: string;
  pointer?: string;
  fixable: boolean;
  fix?: IssueFix;
  documentation?: string;
}

/**
 * 文件扫描结果接口
 */
export interface FileResult {
  file: string;
  issues: Issue[];
}

/**
 * 内存泄漏接口
 */
export interface MemoryLeak {
  id: string;
  component: string;
  size: number;
  type: string;
  severity: 'critical' | 'major' | 'minor';
  growthRate?: number;
  referenceChain?: string[];
  example?: any;
  recommendation?: string;
}

/**
 * 内存泄漏分析结果接口
 */
export interface MemoryAnalysisResult {
  leaks: MemoryLeak[];
  totalLeakSize: number;
  snapshots: {
    timestamp: number;
    totalMemory: number;
    jsHeapSize: number;
  }[];
}

/**
 * 静态分析选项接口
 */
export interface StaticAnalyzerOptions {
  rootDir: string;
  ignorePatterns?: string[];
  cache?: any;
  ruleSet?: string;
  maxWorkers?: number;
}

/**
 * 动态分析选项接口
 */
export interface DynamicAnalyzerOptions {
  rootDir: string;
  entryPoints: string[];
  timeouts?: {
    navigation: number;
    idle: number;
  };
  headless: boolean;
}

/**
 * 内存分析选项接口
 */
export interface MemoryAnalyzerOptions {
  rootDir: string;
  entryPoints: string[];
  threshold: number;
  snapshotCount: number;
  interval: number;
  headless: boolean;
}

/**
 * 规则更新选项接口
 */
export interface RuleUpdateOptions {
  registryUrl: string;
  forceUpdate: boolean;
  verifySignature: boolean;
}

/**
 * 更新规则接口
 */
export interface UpdatedRule {
  id: string;
  name: string;
  severity: string;
  oldVersion: string;
  newVersion: string;
  changeType: 'NEW' | 'MAJOR' | 'MINOR' | 'PATCH';
  changelog?: string;
}

/**
 * 更新失败规则接口
 */
export interface FailedUpdate {
  ruleId: string;
  reason: string;
}

/**
 * 规则更新结果接口
 */
export interface RuleUpdateResult {
  updatedRules: UpdatedRule[];
  failedUpdates: FailedUpdate[];
  totalRules: number;
  registryVersion?: string;
  lastUpdateTime: number;
}

/**
 * 修复选项接口
 */
export interface FixOptions {
  file: string;
  issueId: string;
  fix: IssueFix;
}

/**
 * 修复结果接口
 */
export interface FixResult {
  successCount: number;
  failedCount: number;
  failures: {
    file: string;
    issueId: string;
    reason: string;
  }[];
}
