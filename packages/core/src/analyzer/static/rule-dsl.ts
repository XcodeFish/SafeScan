/**
 * 规则DSL - 简化规则编写的领域特定语言
 */
import type { Node } from '@swc/core';
import type {
  Rule,
  RuleMatcher,
  Issue,
  RuleContext,
  Severity,
  Category,
  Framework,
} from '../../types/rule';
import { isNodeType, getNodeSource } from '../../utils/ast-helpers';

/**
 * DSL选择器类型
 */
export type NodeSelector = (node: Node, context: RuleContext) => boolean;

/**
 * 规则构建器接口
 */
export interface RuleBuilder {
  // 规则身份与描述
  id(value: string): RuleBuilder;
  name(value: string): RuleBuilder;
  description(value: string): RuleBuilder;

  // 规则分类
  severity(value: Severity): RuleBuilder;
  category(value: Category): RuleBuilder;
  framework(value: Framework | Framework[]): RuleBuilder;

  // 节点选择器
  select(selector: NodeSelector | string): RuleBuilder;
  selectAll(selector: NodeSelector | string): RuleBuilder;

  // 条件匹配
  when(condition: (node: Node, context: RuleContext) => boolean): RuleBuilder;
  unless(condition: (node: Node, context: RuleContext) => boolean): RuleBuilder;

  // 节点属性匹配
  hasAttribute(name: string, value?: string | RegExp | ((val: string) => boolean)): RuleBuilder;
  containsText(pattern: string | RegExp): RuleBuilder;

  // 自定义检测逻辑
  detect(matcher: RuleMatcher): RuleBuilder;

  // 报告问题
  report(messageOrOptions: string | Partial<Issue>): RuleBuilder;

  // 文档
  documentation(value: string): RuleBuilder;
  example(type: 'good' | 'bad', code: string): RuleBuilder;

  // 构建规则对象
  build(): Rule;
}

/**
 * 创建内部规则构建器
 */
class RuleBuilderImpl implements RuleBuilder {
  private ruleData: Partial<Rule> = {
    examples: { good: [], bad: [] },
  };

  private selectors: NodeSelector[] = [];
  private conditions: Array<(node: Node, context: RuleContext) => boolean> = [];
  private reportOptions: Partial<Issue> | null = null;
  private reportMessage: string | null = null;

  // 规则身份与描述
  id(value: string): RuleBuilder {
    this.ruleData.id = value;
    return this;
  }

  name(value: string): RuleBuilder {
    this.ruleData.name = value;
    return this;
  }

  description(value: string): RuleBuilder {
    this.ruleData.description = value;
    return this;
  }

  // 规则分类
  severity(value: Severity): RuleBuilder {
    this.ruleData.severity = value;
    return this;
  }

  category(value: Category): RuleBuilder {
    this.ruleData.category = value;
    return this;
  }

  framework(value: Framework | Framework[]): RuleBuilder {
    if (Array.isArray(value)) {
      this.ruleData.framework = value[0]; // 当前类型定义只支持单个框架，后续可优化
    } else {
      this.ruleData.framework = value;
    }
    return this;
  }

  // 节点选择器
  select(selector: NodeSelector | string): RuleBuilder {
    if (typeof selector === 'string') {
      // 字符串选择器转换为函数
      this.selectors.push((node: Node) => {
        return isNodeType(node, selector);
      });
    } else {
      this.selectors.push(selector);
    }
    return this;
  }

  selectAll(selector: NodeSelector | string): RuleBuilder {
    // selectAll类似于select，但用于后续AST遍历场景
    return this.select(selector);
  }

  // 条件匹配
  when(condition: (node: Node, context: RuleContext) => boolean): RuleBuilder {
    this.conditions.push(condition);
    return this;
  }

  unless(condition: (node: Node, context: RuleContext) => boolean): RuleBuilder {
    this.conditions.push((node, context) => !condition(node, context));
    return this;
  }

  // 节点属性匹配
  hasAttribute(name: string, value?: string | RegExp | ((val: string) => boolean)): RuleBuilder {
    this.conditions.push((node: Node, _context: RuleContext) => {
      // 使用辅助函数检查JSX节点的属性
      if (!isNodeType(node, 'JSXElement')) {
        return false;
      }

      const jsxNode = node as any;
      if (!jsxNode.openingElement?.attributes) {
        return false;
      }

      const attr = jsxNode.openingElement.attributes.find((attr: any) => attr.name?.value === name);

      if (!attr) return false;
      if (value === undefined) return true;

      const attrValue = attr.value?.value;
      if (attrValue === undefined) return false;

      if (typeof value === 'string') {
        return attrValue === value;
      } else if (value instanceof RegExp) {
        return value.test(attrValue);
      } else if (typeof value === 'function') {
        return value(attrValue);
      }

      return false;
    });
    return this;
  }

  containsText(pattern: string | RegExp): RuleBuilder {
    this.conditions.push((node: Node, context: RuleContext) => {
      const text = getNodeSource(node, context);
      if (!text) return false;

      if (typeof pattern === 'string') {
        return text.includes(pattern);
      } else {
        return pattern.test(text);
      }
    });
    return this;
  }

  // 自定义检测逻辑
  detect(matcher: RuleMatcher): RuleBuilder {
    this.ruleData.matcher = matcher;
    return this;
  }

  // 报告问题
  report(messageOrOptions: string | Partial<Issue>): RuleBuilder {
    if (typeof messageOrOptions === 'string') {
      this.reportMessage = messageOrOptions;
    } else {
      this.reportOptions = messageOrOptions;
    }
    return this;
  }

  // 文档
  documentation(value: string): RuleBuilder {
    this.ruleData.documentation = value;
    return this;
  }

  example(type: 'good' | 'bad', code: string): RuleBuilder {
    if (!this.ruleData.examples) {
      this.ruleData.examples = { good: [], bad: [] };
    }

    if (type === 'good') {
      this.ruleData.examples.good?.push(code);
    } else {
      this.ruleData.examples.bad?.push(code);
    }
    return this;
  }

  // 构建规则对象
  build(): Rule {
    // 如果没有提供自定义matcher，则基于配置生成一个
    if (!this.ruleData.matcher) {
      this.ruleData.matcher = this.generateMatcher();
    }

    // 验证必要字段
    if (!this.ruleData.id) throw new Error('规则必须提供ID');
    if (!this.ruleData.name) throw new Error('规则必须提供名称');
    if (!this.ruleData.description) throw new Error('规则必须提供描述');
    if (!this.ruleData.severity) this.ruleData.severity = 'medium';
    if (!this.ruleData.category) this.ruleData.category = 'bestPractice';

    return this.ruleData as Rule;
  }

  // 基于配置生成匹配器
  private generateMatcher(): RuleMatcher {
    return (node: Node, context: RuleContext) => {
      // 首先检查节点类型是否匹配
      if (
        this.selectors.length > 0 &&
        !this.selectors.some((selector) => selector(node, context))
      ) {
        return null;
      }

      // 然后检查条件
      if (
        this.conditions.length > 0 &&
        !this.conditions.every((condition) => condition(node, context))
      ) {
        return null;
      }

      // 所有条件满足，生成问题报告
      let issue: Partial<Issue> = {
        ruleId: this.ruleData.id || '',
        message: this.reportMessage || '',
        severity: this.ruleData.severity || 'medium',
        category: this.ruleData.category || 'bestPractice',
        location: context.getNodeLocation(node),
        code: context.getNodeText(node),
      };

      // 合并自定义报告选项
      if (this.reportOptions) {
        issue = { ...issue, ...this.reportOptions };
      }

      return issue as Issue;
    };
  }
}

/**
 * 创建规则构建器
 */
export function createRule(): RuleBuilder {
  return new RuleBuilderImpl();
}

/**
 * 创建多条规则
 */
export function createRules(factory: (create: typeof createRule) => Rule[]): Rule[] {
  return factory(createRule);
}

// 预定义通用选择器
export const selectors = {
  jsx: (node: Node) => isNodeType(node, 'JSXElement'),
  jsxAttribute: (node: Node) => isNodeType(node, 'JSXAttribute'),
  jsxText: (node: Node) => isNodeType(node, 'JSXText'),
  callExpression: (node: Node) => isNodeType(node, 'CallExpression'),
  stringLiteral: (node: Node) => isNodeType(node, 'StringLiteral'),
  dangerouslySetInnerHTML: (node: Node) => {
    if (!isNodeType(node, 'JSXAttribute')) return false;
    return (node as any).name?.value === 'dangerouslySetInnerHTML';
  },
};
