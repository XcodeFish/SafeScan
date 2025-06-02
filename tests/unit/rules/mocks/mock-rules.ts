/**
 * 测试用模拟规则
 */
import { vi } from 'vitest';
import type {
  IRule,
  RuleCategory,
  RuleSeverity,
  Framework,
  TAST,
  TRuleContext,
  TRuleResult,
} from '@safescan/core/types';

/**
 * 创建一个模拟的XSS检测规则
 */
export const mockXssRule: IRule = {
  id: 'security-xss-innerHTML',
  name: 'Unsafe HTML injection',
  description: '检测直接将用户输入赋值给innerHTML的风险',
  category: 'security' as RuleCategory,
  severity: 'critical' as RuleSeverity,
  frameworks: ['vanilla', 'react'] as Framework[],
  detect: vi.fn().mockImplementation((ast: TAST, context: TRuleContext): TRuleResult[] => {
    // 简单模拟：如果代码中包含innerHTML且不包含sanitize，则返回问题
    if (
      context.fileContent.includes('innerHTML') &&
      !context.fileContent.includes('sanitizeHTML')
    ) {
      return [
        {
          ruleId: 'security-xss-innerHTML',
          message: '直接将未经处理的用户输入赋值给innerHTML可能导致XSS攻击',
          severity: 'critical' as RuleSeverity,
          location: {
            filePath: context.filePath,
            startLine: 4,
            startColumn: 9,
            endLine: 4,
            endColumn: 56,
          },
          fixable: true,
          fixSuggestion: '使用DOMPurify或其他HTML净化库处理用户输入',
        },
      ];
    }
    return [];
  }),
  fix: vi.fn().mockImplementation((result, ast, context) => {
    // 模拟修复实现
    return {
      success: true,
      fixedCode: context.fileContent.replace(
        /innerHTML\s*=\s*([^;]+)/g,
        'innerHTML = sanitizeHTML($1)'
      ),
      message: '添加了sanitizeHTML函数调用',
    };
  }),
};

/**
 * 创建一个模拟的eval函数XSS检测规则
 */
export const mockEvalXssRule: IRule = {
  id: 'security-xss-eval',
  name: 'Unsafe eval usage',
  description: '检测使用eval执行用户输入的风险',
  category: 'security' as RuleCategory,
  severity: 'critical' as RuleSeverity,
  frameworks: ['vanilla', 'react'] as Framework[],
  detect: vi.fn().mockImplementation((ast: TAST, context: TRuleContext): TRuleResult[] => {
    // 简单模拟：如果代码中包含eval，则返回问题
    if (context.fileContent.includes('eval(')) {
      return [
        {
          ruleId: 'security-xss-eval',
          message: '使用eval执行用户输入可能导致代码注入攻击',
          severity: 'critical' as RuleSeverity,
          location: {
            filePath: context.filePath,
            startLine: 4,
            startColumn: 9,
            endLine: 4,
            endColumn: 22,
          },
          fixable: false,
        },
      ];
    }
    return [];
  }),
};

/**
 * 创建一个模拟的React dangerouslySetInnerHTML检测规则
 */
export const mockReactDangerousHtmlRule: IRule = {
  id: 'security-xss-react-dangerouslySetInnerHTML',
  name: 'Unsafe React dangerouslySetInnerHTML',
  description: '检测React中不安全使用dangerouslySetInnerHTML的风险',
  category: 'security' as RuleCategory,
  severity: 'high' as RuleSeverity,
  frameworks: ['react'] as Framework[],
  detect: vi.fn().mockImplementation((ast: TAST, context: TRuleContext): TRuleResult[] => {
    // 简单模拟：如果代码中包含dangerouslySetInnerHTML，则返回问题
    if (context.fileContent.includes('dangerouslySetInnerHTML')) {
      return [
        {
          ruleId: 'security-xss-react-dangerouslySetInnerHTML',
          message: '使用dangerouslySetInnerHTML而未对内容进行净化可能导致XSS攻击',
          severity: 'high' as RuleSeverity,
          location: {
            filePath: context.filePath,
            startLine: 7,
            startColumn: 13,
            endLine: 9,
            endColumn: 14,
          },
          fixable: true,
          fixSuggestion: '使用DOMPurify处理HTML内容后再赋值',
        },
      ];
    }
    return [];
  }),
};

/**
 * 创建一个模拟的URL注入检测规则
 */
export const mockUrlInjectionRule: IRule = {
  id: 'security-xss-url-injection',
  name: 'Unsafe URL redirection',
  description: '检测不安全的URL重定向风险',
  category: 'security' as RuleCategory,
  severity: 'high' as RuleSeverity,
  frameworks: ['vanilla', 'react'] as Framework[],
  detect: vi.fn().mockImplementation((ast: TAST, context: TRuleContext): TRuleResult[] => {
    // 简单模拟：如果代码中包含location赋值，则返回问题
    if (
      context.fileContent.includes('location =') ||
      context.fileContent.includes('location.href =')
    ) {
      return [
        {
          ruleId: 'security-xss-url-injection',
          message: '直接将用户输入赋值给location可能导致重定向劫持',
          severity: 'high' as RuleSeverity,
          location: {
            filePath: context.filePath,
            startLine: 4,
            startColumn: 9,
            endLine: 4,
            endColumn: 36,
          },
          fixable: true,
          fixSuggestion: '验证URL格式和来源，或使用白名单',
        },
      ];
    }
    return [];
  }),
};

/**
 * 创建一个模拟的安全HTML检测规则（用于测试不会误报的情况）
 */
export const mockSanitizedHtmlRule: IRule = {
  id: 'security-xss-sanitized',
  name: 'Sanitized HTML is safe',
  description: '检测经过净化的HTML内容是否安全',
  category: 'security' as RuleCategory,
  severity: 'medium' as RuleSeverity,
  frameworks: ['vanilla', 'react'] as Framework[],
  detect: vi.fn().mockImplementation((_ast: TAST, _context: TRuleContext): TRuleResult[] => {
    // 简单模拟：如果代码中包含sanitizeHTML，则认为是安全的，不返回问题
    return [];
  }),
};

/**
 * 组合所有XSS相关规则
 */
export const mockXssRules = [
  mockXssRule,
  mockEvalXssRule,
  mockReactDangerousHtmlRule,
  mockUrlInjectionRule,
  mockSanitizedHtmlRule,
];
