/**
 * 规则相关类型定义
 */
import type { Node } from '@swc/core';

/**
 * 代码位置信息
 */
export interface CodeLocation {
  line: number;
  column: number;
  filePath?: string;
}

/**
 * 代码范围
 */
export interface CodeRange {
  start: CodeLocation;
  end: CodeLocation;
}

/**
 * 修复建议
 */
export interface FixSuggestion {
  description: string;
  code?: string;
}

/**
 * 问题严重程度
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * 规则类别
 */
export type Category =
  | 'security'
  | 'performance'
  | 'compatibility'
  | 'accessibility'
  | 'bestPractice';

/**
 * 规则框架
 */
export type Framework = 'react' | 'vue' | 'angular' | 'svelte' | 'general';

/**
 * 检测到的问题
 */
export interface Issue {
  ruleId: string;
  message: string;
  severity: Severity;
  category: Category;
  location: CodeRange;
  filePath?: string;
  code?: string;
  suggestions?: FixSuggestion[];
}

/**
 * 规则匹配函数
 */
export type RuleMatcher = (
  node: Node,
  context: RuleContext
) => Issue | Issue[] | null | undefined | void;

/**
 * 规则上下文
 */
export interface RuleContext {
  filePath: string;
  fileContent: string;
  ast: Node;
  getNodeLocation(node: Node): CodeRange;
  getNodeText(node: Node): string;
}

/**
 * 规则定义
 */
export interface Rule {
  // 规则基本信息
  id: string;
  name: string;
  description: string;

  // 规则分类
  severity: Severity;
  category: Category;
  framework?: Framework;

  // 规则匹配
  matcher: RuleMatcher;

  // 文档
  documentation?: string;
  examples?: {
    good?: string[];
    bad?: string[];
  };
}
