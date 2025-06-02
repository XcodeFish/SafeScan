/**
 * 规则加载器 - 从目录中加载规则
 */
import fs from 'fs/promises';
import path from 'path';
import type { Rule } from '../../types/rule';

/**
 * 从指定目录加载规则
 * @param rulesDir 规则目录路径
 * @returns 规则数组
 */
export async function loadRules(rulesDir: string): Promise<Rule[]> {
  try {
    // 检查目录是否存在
    try {
      await fs.access(rulesDir);
    } catch (err) {
      console.warn(`规则目录不存在: ${rulesDir}`);
      return [];
    }

    // 查找所有规则文件 (不使用globby，改用原生fs)
    const allFiles = await findRuleFiles(rulesDir);

    if (allFiles.length === 0) {
      console.warn(`未在目录中找到规则文件: ${rulesDir}`);
      return [];
    }

    // 加载每个规则文件
    const rules: Rule[] = [];

    for (const ruleFile of allFiles) {
      try {
        // 动态导入规则文件
        const ruleModule = await import(ruleFile);

        // 规则文件可能导出单个规则或规则数组
        if (Array.isArray(ruleModule.default)) {
          rules.push(...ruleModule.default);
        } else if (ruleModule.default) {
          rules.push(ruleModule.default);
        }

        // 处理命名导出
        for (const key of Object.keys(ruleModule)) {
          if (key !== 'default' && typeof ruleModule[key] === 'object' && ruleModule[key].id) {
            rules.push(ruleModule[key]);
          }
        }
      } catch (err) {
        console.error(`加载规则文件失败: ${ruleFile}`, err);
      }
    }

    return rules;
  } catch (error) {
    console.error('加载规则失败:', error);
    return [];
  }
}

/**
 * 递归查找规则文件
 * @param dir 目录路径
 * @returns 规则文件路径数组
 */
async function findRuleFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // 递归查找子目录
      const subDirFiles = await findRuleFiles(fullPath);
      files.push(...subDirFiles);
    } else if (entry.isFile() && /\.rule\.(js|ts)$/.test(entry.name)) {
      // 匹配 .rule.js 或 .rule.ts 结尾的文件
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * 按框架/类别分组规则
 * @param rules 规则数组
 * @returns 分组后的规则对象
 */
export function groupRulesByCategory(rules: Rule[]): Record<string, Rule[]> {
  const groupedRules: Record<string, Rule[]> = {};

  for (const rule of rules) {
    const category = rule.category || 'general';

    if (!groupedRules[category]) {
      groupedRules[category] = [];
    }

    groupedRules[category].push(rule);
  }

  return groupedRules;
}

/**
 * 按严重程度分组规则
 * @param rules 规则数组
 * @returns 分组后的规则对象
 */
export function groupRulesBySeverity(rules: Rule[]): Record<string, Rule[]> {
  const groupedRules: Record<string, Rule[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
    info: [],
  };

  for (const rule of rules) {
    const severity = rule.severity || 'medium';
    groupedRules[severity].push(rule);
  }

  return groupedRules;
}
