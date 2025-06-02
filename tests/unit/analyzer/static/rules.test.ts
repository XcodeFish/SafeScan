/**
 * 静态分析引擎规则系统测试
 */
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { RuleLoader, RuleMatcher } from '../../../../packages/core/src/analyzer/static/rules';
import {
  IRule,
  RuleCategory,
  RuleSeverity,
  Framework,
  TRuleContext,
} from '../../../../packages/core/src/types';
import { mockConsole } from '../../../utils/test-helpers';

// 创建测试规则
function createTestRule(ruleId: string, options: Partial<IRule> = {}): IRule {
  return {
    id: ruleId,
    name: `测试规则 ${ruleId}`,
    description: `这是测试规则 ${ruleId}`,
    category: RuleCategory.SECURITY,
    severity: RuleSeverity.MEDIUM,
    detect: vi.fn().mockImplementation((ast, context) => {
      return [
        {
          ruleId,
          message: `测试问题 ${ruleId}`,
          severity: RuleSeverity.MEDIUM,
          location: {
            filePath: context.filePath,
            startLine: 1,
            startColumn: 1,
            endLine: 1,
            endColumn: 10,
          },
          fixable: false,
        },
      ];
    }),
    ...options,
  };
}

// 模拟AST
const mockAST = {
  type: 'Module',
  body: [],
};

// 模拟规则上下文
const mockContext: TRuleContext = {
  filePath: '/test/file.ts',
  fileContent: 'const x = 1;',
};

describe('静态分析引擎规则系统', () => {
  let consoleSpies: ReturnType<typeof mockConsole>;

  beforeEach(() => {
    consoleSpies = mockConsole();
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleSpies.restore();
  });

  describe('RuleLoader类', () => {
    test('添加和获取规则', () => {
      const loader = new RuleLoader();
      const rule = createTestRule('test-rule-1');

      loader.addRule(rule);

      expect(loader.getRule('test-rule-1')).toBe(rule);
      expect(loader.getAllRules()).toHaveLength(1);
      expect(loader.getAllRules()[0]).toBe(rule);
    });

    test('按框架获取规则', () => {
      const loader = new RuleLoader();

      // 添加React规则
      const reactRule = createTestRule('react-rule', {
        frameworks: [Framework.REACT],
      });
      loader.addRule(reactRule);

      // 添加Vue规则
      const vueRule = createTestRule('vue-rule', {
        frameworks: [Framework.VUE],
      });
      loader.addRule(vueRule);

      // 添加通用规则
      const commonRule = createTestRule('common-rule', {
        frameworks: [Framework.REACT, Framework.VUE],
      });
      loader.addRule(commonRule);

      const reactRules = loader.getRulesByFramework(Framework.REACT);
      expect(reactRules).toHaveLength(2);
      expect(reactRules).toContain(reactRule);
      expect(reactRules).toContain(commonRule);

      const vueRules = loader.getRulesByFramework(Framework.VUE);
      expect(vueRules).toHaveLength(2);
      expect(vueRules).toContain(vueRule);
      expect(vueRules).toContain(commonRule);
    });

    test('按类别获取规则', () => {
      const loader = new RuleLoader();

      // 添加安全类别规则
      const securityRule = createTestRule('security-rule', {
        category: RuleCategory.SECURITY,
      });
      loader.addRule(securityRule);

      // 添加性能类别规则
      const perfRule = createTestRule('perf-rule', {
        category: RuleCategory.PERFORMANCE,
      });
      loader.addRule(perfRule);

      const securityRules = loader.getRulesByCategory(RuleCategory.SECURITY);
      expect(securityRules).toHaveLength(1);
      expect(securityRules[0]).toBe(securityRule);

      const perfRules = loader.getRulesByCategory(RuleCategory.PERFORMANCE);
      expect(perfRules).toHaveLength(1);
      expect(perfRules[0]).toBe(perfRule);
    });

    test('按严重程度获取规则', () => {
      const loader = new RuleLoader();

      // 添加严重级别规则
      const criticalRule = createTestRule('critical-rule', {
        severity: RuleSeverity.CRITICAL,
      });
      loader.addRule(criticalRule);

      // 添加中等级别规则
      const mediumRule = createTestRule('medium-rule', {
        severity: RuleSeverity.MEDIUM,
      });
      loader.addRule(mediumRule);

      const criticalRules = loader.getRulesBySeverity(RuleSeverity.CRITICAL);
      expect(criticalRules).toHaveLength(1);
      expect(criticalRules[0]).toBe(criticalRule);

      const mediumRules = loader.getRulesBySeverity(RuleSeverity.MEDIUM);
      expect(mediumRules).toHaveLength(1);
      expect(mediumRules[0]).toBe(mediumRule);
    });

    test('移除规则', () => {
      const loader = new RuleLoader();
      const rule = createTestRule('test-rule-1', {
        category: RuleCategory.SECURITY,
        severity: RuleSeverity.CRITICAL,
        frameworks: [Framework.REACT],
      });

      loader.addRule(rule);
      expect(loader.getRule('test-rule-1')).toBe(rule);

      // 移除规则
      const removed = loader.removeRule('test-rule-1');
      expect(removed).toBe(true);
      expect(loader.getRule('test-rule-1')).toBeUndefined();

      // 确认各分类中也已移除
      expect(loader.getRulesByCategory(RuleCategory.SECURITY)).toHaveLength(0);
      expect(loader.getRulesBySeverity(RuleSeverity.CRITICAL)).toHaveLength(0);
      expect(loader.getRulesByFramework(Framework.REACT)).toHaveLength(0);
    });

    test('处理无效规则定义', () => {
      const loader = new RuleLoader();
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      // 尝试添加无效规则，应该不会添加成功
      // null 规则
      loader.addRule(null as any);
      expect(loader.getAllRules()).toHaveLength(0);

      // 空对象规则
      loader.addRule({} as any);
      expect(loader.getAllRules()).toHaveLength(0);

      // 不完整规则 - 这个会触发警告
      const incompleteRule = {
        id: 'test',
        name: 'Test',
        description: 'Test rule',
        // 缺少category和其他必要字段
      } as any;
      loader.addRule(incompleteRule);
      expect(loader.getAllRules()).toHaveLength(0);

      // 添加重复ID的规则来触发警告
      const validRule = createTestRule('valid-rule');
      loader.addRule(validRule);
      loader.addRule(validRule); // 添加重复ID的规则，会触发警告

      expect(loader.getRule('valid-rule')).toBeDefined();

      // 应该有警告日志
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  describe('RuleMatcher类', () => {
    test('matchAll方法应用所有规则', () => {
      const loader = new RuleLoader();
      const rule1 = createTestRule('rule-1');
      const rule2 = createTestRule('rule-2');

      loader.addRule(rule1);
      loader.addRule(rule2);

      const matcher = new RuleMatcher(loader);
      const results = matcher.matchAll(mockAST, mockContext);

      expect(results).toHaveLength(2);
      expect(rule1.detect).toHaveBeenCalledWith(mockAST, mockContext);
      expect(rule2.detect).toHaveBeenCalledWith(mockAST, mockContext);

      // 验证结果内容
      expect(results.find((r) => r.ruleId === 'rule-1')).toBeDefined();
      expect(results.find((r) => r.ruleId === 'rule-2')).toBeDefined();
    });

    test('matchByFramework方法应用框架特定规则', () => {
      const loader = new RuleLoader();

      // 添加React规则
      const reactRule = createTestRule('react-rule', {
        frameworks: [Framework.REACT],
      });
      loader.addRule(reactRule);

      // 添加Vue规则
      const vueRule = createTestRule('vue-rule', {
        frameworks: [Framework.VUE],
      });
      loader.addRule(vueRule);

      const matcher = new RuleMatcher(loader);
      const reactResults = matcher.matchByFramework(mockAST, mockContext, Framework.REACT);

      expect(reactResults).toHaveLength(1);
      expect(reactRule.detect).toHaveBeenCalledWith(mockAST, mockContext);
      expect(vueRule.detect).not.toHaveBeenCalled();

      // 验证结果内容
      expect(reactResults[0].ruleId).toBe('react-rule');
    });

    test('matchByCategory方法应用类别特定规则', () => {
      const loader = new RuleLoader();

      // 添加安全规则
      const securityRule = createTestRule('security-rule', {
        category: RuleCategory.SECURITY,
      });
      loader.addRule(securityRule);

      // 添加性能规则
      const perfRule = createTestRule('perf-rule', {
        category: RuleCategory.PERFORMANCE,
      });
      loader.addRule(perfRule);

      const matcher = new RuleMatcher(loader);
      const securityResults = matcher.matchByCategory(mockAST, mockContext, RuleCategory.SECURITY);

      expect(securityResults).toHaveLength(1);
      expect(securityRule.detect).toHaveBeenCalledWith(mockAST, mockContext);
      expect(perfRule.detect).not.toHaveBeenCalled();

      // 验证结果内容
      expect(securityResults[0].ruleId).toBe('security-rule');
    });

    test('matchBySeverity方法应用严重程度大于等于指定级别的规则', () => {
      const loader = new RuleLoader();

      // 添加严重级别规则
      const criticalRule = createTestRule('critical-rule', {
        severity: RuleSeverity.CRITICAL,
      });
      loader.addRule(criticalRule);

      // 添加高级别规则
      const highRule = createTestRule('high-rule', {
        severity: RuleSeverity.HIGH,
      });
      loader.addRule(highRule);

      // 添加中等级别规则
      const mediumRule = createTestRule('medium-rule', {
        severity: RuleSeverity.MEDIUM,
      });
      loader.addRule(mediumRule);

      const matcher = new RuleMatcher(loader);
      const highAndAboveResults = matcher.matchBySeverity(mockAST, mockContext, RuleSeverity.HIGH);

      expect(highAndAboveResults).toHaveLength(2);
      expect(criticalRule.detect).toHaveBeenCalledWith(mockAST, mockContext);
      expect(highRule.detect).toHaveBeenCalledWith(mockAST, mockContext);
      expect(mediumRule.detect).not.toHaveBeenCalled();

      // 验证结果内容
      expect(highAndAboveResults.find((r) => r.ruleId === 'critical-rule')).toBeDefined();
      expect(highAndAboveResults.find((r) => r.ruleId === 'high-rule')).toBeDefined();
    });

    test('matchByRuleId方法应用特定规则', () => {
      const loader = new RuleLoader();
      const rule1 = createTestRule('rule-1');
      const rule2 = createTestRule('rule-2');

      loader.addRule(rule1);
      loader.addRule(rule2);

      const matcher = new RuleMatcher(loader);
      const results = matcher.matchByRuleId(mockAST, mockContext, 'rule-1');

      expect(results).toHaveLength(1);
      expect(rule1.detect).toHaveBeenCalledWith(mockAST, mockContext);
      expect(rule2.detect).not.toHaveBeenCalled();

      // 验证结果内容
      expect(results[0].ruleId).toBe('rule-1');
    });

    test('规则发生错误时应当正确处理', () => {
      const loader = new RuleLoader();

      // 创建会抛出异常的规则
      const errorRule = createTestRule('error-rule');
      errorRule.detect = vi.fn().mockImplementation(() => {
        throw new Error('规则执行错误');
      });

      loader.addRule(errorRule);

      const matcher = new RuleMatcher(loader);
      const results = matcher.matchAll(mockAST, mockContext);

      // 应该没有结果，但不会崩溃
      expect(results).toHaveLength(0);
      expect(errorRule.detect).toHaveBeenCalledWith(mockAST, mockContext);
      expect(consoleSpies.mocks.error).toHaveBeenCalledWith(
        expect.stringContaining("应用规则 'error-rule' 时出错"),
        expect.any(Error)
      );
    });
  });
});
