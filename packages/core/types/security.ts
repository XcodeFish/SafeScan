/**
 * 安全相关类型定义
 */

// 安全问题接口
export interface SecurityIssue {
  // 问题ID
  id: string;
  // 问题标题
  title: string;
  // 问题描述
  description: string;
  // 严重程度
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  // 问题类型
  type: 'xss' | 'memory-leak' | 'unsafe-resource' | 'prop-validation' | 'hook-misuse' | 'other';
  // 相关组件
  component?: string;
  // 问题位置
  location?: {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
  };
  // 修复建议
  remediation?: string;
  // 代码片段
  codeSnippet?: string;
}

// 规则接口
export interface Rule {
  // 规则ID
  id: string;
  // 规则名称
  name: string;
  // 规则描述
  description: string;
  // 规则严重程度
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  // 规则类别
  category: 'security' | 'performance' | 'best-practice';
  // 规则检查函数
  check: (component: any) => SecurityIssue[];
  // 是否启用
  enabled: boolean;
}

// 规则管理器接口
export interface RuleManager {
  // 检查组件是否有安全问题
  checkComponent: (component: any) => SecurityIssue[];
  // 获取所有规则
  getAllRules: () => Rule[];
  // 启用规则
  enableRule: (ruleId: string) => void;
  // 禁用规则
  disableRule: (ruleId: string) => void;
}
