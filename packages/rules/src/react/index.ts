/**
 * React规则管理器
 * 负责加载和执行React相关的安全规则
 */
import { SecurityIssue, Rule, RuleManager } from '../../../core/types/security';
import * as hooksRules from './hooks-rules';
import { ReactComponent } from './types';

// 规则管理器单例
let ruleManagerInstance: RuleManager | null = null;

/**
 * 获取规则管理器
 */
export function getRuleManager(): RuleManager {
  if (ruleManagerInstance) {
    return ruleManagerInstance;
  }

  // 规则列表，确保类型兼容
  const rules: Rule[] = Object.values(hooksRules)
    .filter((rule) => typeof rule === 'object' && rule.id)
    .map((rule: any) => ({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      severity: rule.severity as 'critical' | 'high' | 'medium' | 'low' | 'info',
      category: rule.category as 'security' | 'performance' | 'best-practice',
      check: typeof rule.check === 'function' ? rule.check : () => [],
      enabled: rule.enabled !== false,
    }));

  // 已禁用的规则ID集合
  const disabledRuleIds = new Set<string>();

  // 创建规则管理器实例
  ruleManagerInstance = {
    // 检查组件
    checkComponent: (component: ReactComponent): SecurityIssue[] => {
      if (!component) {
        return [];
      }

      const issues: SecurityIssue[] = [];

      // 执行所有启用的规则
      rules.forEach((rule) => {
        if (rule.enabled && !disabledRuleIds.has(rule.id)) {
          try {
            const ruleIssues = rule.check(component);
            if (ruleIssues && ruleIssues.length > 0) {
              issues.push(...ruleIssues);
            }
          } catch (err) {
            console.error(`[SafeScan] 规则 "${rule.id}" 执行失败:`, err);
          }
        }
      });

      return issues;
    },

    // 获取所有规则
    getAllRules: () => {
      return [...rules];
    },

    // 启用规则
    enableRule: (ruleId: string) => {
      disabledRuleIds.delete(ruleId);

      // 更新规则的启用状态
      rules.forEach((rule) => {
        if (rule.id === ruleId) {
          rule.enabled = true;
        }
      });
    },

    // 禁用规则
    disableRule: (ruleId: string) => {
      disabledRuleIds.add(ruleId);

      // 更新规则的启用状态
      rules.forEach((rule) => {
        if (rule.id === ruleId) {
          rule.enabled = false;
        }
      });
    },
  };

  return ruleManagerInstance;
}
