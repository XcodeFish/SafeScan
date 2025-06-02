/**
 * 规则测试框架
 * 用于测试规则的检测准确性
 */
import type { Node } from '@swc/core';
import { describe, it, expect } from 'vitest';
import { parse } from '../analyzer/static/parser';
import type { TRuleResult } from '../types';
import type { Rule, Issue } from '../types/rule';

/**
 * 测试用例接口
 */
export interface IRuleTestCase {
  /** 测试用例名称 */
  name: string;
  /** 测试代码 */
  code: string;
  /** 期望的错误数量，0表示无错误 */
  errors?: number;
  /** 期望的错误消息列表，用于精确匹配 */
  errorMessages?: string[];
  /** 测试用例的文件名，默认为test.tsx */
  filename?: string;
  /** 测试用例的配置选项 */
  options?: Record<string, any>;
  /** 仅运行此用例 */
  only?: boolean;
  /** 跳过此用例 */
  skip?: boolean;
}

/**
 * 规则测试配置
 */
export interface IRuleTesterConfig {
  /** 规则ID */
  ruleId: string;
  /** 规则对象 */
  rule: Rule;
  /** 有效的测试用例列表 */
  validTestCases: IRuleTestCase[];
  /** 无效的测试用例列表 */
  invalidTestCases: IRuleTestCase[];
}

/**
 * 规则测试器类
 */
export class RuleTester {
  /**
   * 运行规则测试
   * @param config 测试配置
   */
  static run(config: IRuleTesterConfig): void {
    const { ruleId, rule, validTestCases, invalidTestCases } = config;

    describe(`Rule: ${ruleId}`, () => {
      // 测试有效用例
      describe('Valid cases', () => {
        validTestCases.forEach((testCase) => {
          const testFn = testCase.skip ? it.skip : testCase.only ? it.only : it;

          testFn(testCase.name || 'should pass', async () => {
            const results = await RuleTester.testRule(rule, testCase);
            expect(results).toHaveLength(0);
          });
        });
      });

      // 测试无效用例
      describe('Invalid cases', () => {
        invalidTestCases.forEach((testCase) => {
          const testFn = testCase.skip ? it.skip : testCase.only ? it.only : it;
          const expectedErrors = testCase.errors || (testCase.errorMessages?.length ?? 1);

          testFn(testCase.name || `should report ${expectedErrors} error(s)`, async () => {
            const results = await RuleTester.testRule(rule, testCase);

            // 验证错误数量
            expect(results).toHaveLength(expectedErrors);

            // 验证错误消息
            if (testCase.errorMessages) {
              const actualMessages = results.map((result) => result.message);
              expect(actualMessages).toEqual(expect.arrayContaining(testCase.errorMessages));
            }
          });
        });
      });
    });
  }

  /**
   * 测试单个规则
   * @param rule 规则对象
   * @param testCase 测试用例
   * @returns 检测结果
   */
  static async testRule(rule: Rule, testCase: IRuleTestCase): Promise<TRuleResult[]> {
    const { code, filename = 'test.tsx', options = {} } = testCase;

    try {
      // 解析代码
      const ast = await parse(code, filename);

      // 存储检测结果
      const results: TRuleResult[] = [];

      // 模拟规则上下文
      const context = {
        fileContent: code,
        filePath: filename,
        getNodeText: (node: Node) => {
          const startPos = node.span?.start;
          const endPos = node.span?.end;
          if (startPos !== undefined && endPos !== undefined) {
            return code.substring(startPos, endPos);
          }
          return '';
        },
        getNodeLocation: (node: Node) => {
          const startPos = node.span?.start || 0;
          const endPos = node.span?.end || 0;

          // 简单计算行列号
          const beforeStart = code.substring(0, startPos);
          const beforeEnd = code.substring(0, endPos);

          const startLine = (beforeStart.match(/\n/g) || []).length + 1;
          const endLine = (beforeEnd.match(/\n/g) || []).length + 1;

          const startLineStart = beforeStart.lastIndexOf('\n') + 1;
          const endLineStart = beforeEnd.lastIndexOf('\n') + 1;

          return {
            filePath: filename,
            startLine,
            startColumn: startPos - startLineStart + 1,
            endLine,
            endColumn: endPos - endLineStart + 1,
          };
        },
        options,
        report: (issue: Issue) => {
          results.push({
            ruleId: rule.id,
            message: issue.message,
            severity: issue.severity,
            category: issue.category,
            location: issue.location,
            code: issue.code || '',
            suggestions: issue.suggestions,
            fixable: !!issue.fixSuggestion,
            fixSuggestion: issue.fixSuggestion,
          });
        },
      };

      // AST遍历
      if (ast) {
        RuleTester.traverseAST(ast, (node) => {
          const issue = rule.matcher(node, context);
          if (issue) {
            context.report(issue);
          }
        });
      }

      return results;
    } catch (error) {
      console.error('规则测试失败:', error);
      throw error;
    }
  }

  /**
   * 简单的AST遍历器
   * @param node 节点
   * @param visitor 访问器函数
   */
  private static traverseAST(node: any, visitor: (node: Node) => void): void {
    if (!node) return;

    // 调用访问器
    visitor(node);

    // 遍历子节点
    if (Array.isArray(node.body)) {
      node.body.forEach((child: Node) => RuleTester.traverseAST(child, visitor));
    } else if (node.body) {
      RuleTester.traverseAST(node.body, visitor);
    }

    // 遍历其他可能的子节点属性
    const childKeys = [
      'declarations',
      'declaration',
      'expression',
      'expressions',
      'left',
      'right',
      'init',
      'object',
      'property',
      'callee',
      'arguments',
      'test',
      'consequent',
      'alternate',
      'elements',
      'properties',
      'value',
      'openingElement',
      'closingElement',
      'children',
      'attributes',
      'argument',
      'block',
      'handler',
      'finalizer',
      'params',
      'cases',
      'discriminant',
    ];

    for (const key of childKeys) {
      const child = (node as any)[key];

      if (Array.isArray(child)) {
        child.forEach((c: Node) => c && RuleTester.traverseAST(c, visitor));
      } else if (child && typeof child === 'object') {
        RuleTester.traverseAST(child, visitor);
      }
    }
  }
}

/**
 * 创建规则测试器
 * @param ruleId 规则ID
 * @param rule 规则对象
 * @returns 规则测试器
 */
export function createRuleTester(ruleId: string, rule: Rule) {
  return {
    /**
     * 运行规则测试
     * @param validCases 有效的测试用例
     * @param invalidCases 无效的测试用例
     */
    run(validCases: IRuleTestCase[], invalidCases: IRuleTestCase[]): void {
      RuleTester.run({
        ruleId,
        rule,
        validTestCases: validCases,
        invalidTestCases: invalidCases,
      });
    },
  };
}
