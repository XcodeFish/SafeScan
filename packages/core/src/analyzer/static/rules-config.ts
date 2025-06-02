/**
 * 规则配置管理模块
 * 允许用户配置规则及其严重性
 */
import fs from 'fs/promises';
import path from 'path';
import { RuleSeverity } from '../../types';
import type { IRule, RuleConfig, TProjectConfig } from '../../types';

/**
 * 规则配置管理器
 * 用于加载、合并和优先级处理规则配置
 */
export class RulesConfigManager {
  // 用户配置的规则设置
  private userConfig: Record<string, RuleConfig> = {};

  // 默认配置
  private defaultConfig: Record<string, RuleConfig> = {};

  // 项目配置
  private projectConfig: TProjectConfig | null = null;

  /**
   * 从配置文件加载规则配置
   * @param configPath 配置文件路径
   */
  async loadConfigFromFile(configPath: string): Promise<boolean> {
    try {
      const configContent = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      if (config.rules && typeof config.rules === 'object') {
        this.userConfig = config.rules;
      }

      this.projectConfig = config;
      return true;
    } catch (error) {
      console.error('加载规则配置文件失败:', error);
      return false;
    }
  }

  /**
   * 设置默认规则配置
   * @param rules 规则数组
   */
  setDefaultConfig(rules: IRule[]): void {
    const defaultConfig: Record<string, RuleConfig> = {};

    for (const rule of rules) {
      defaultConfig[rule.id] = {
        enabled: true,
        severity: rule.severity,
      };
    }

    this.defaultConfig = defaultConfig;
  }

  /**
   * 设置用户规则配置
   * @param config 规则配置对象
   */
  setUserConfig(config: Record<string, RuleConfig>): void {
    this.userConfig = config;
  }

  /**
   * 获取规则配置
   * @param ruleId 规则ID
   * @returns 规则配置，如不存在则返回默认启用配置
   */
  getRuleConfig(ruleId: string): RuleConfig {
    // 优先使用用户配置
    if (this.userConfig[ruleId]) {
      return this.userConfig[ruleId];
    }

    // 其次使用默认配置
    if (this.defaultConfig[ruleId]) {
      return this.defaultConfig[ruleId];
    }

    // 如果没有配置，则默认启用
    return {
      enabled: true,
      severity: RuleSeverity.MEDIUM,
    };
  }

  /**
   * 应用规则配置
   * @param rule 规则对象
   * @returns 带有应用配置的规则对象
   */
  applyConfigToRule(rule: IRule): IRule {
    const config = this.getRuleConfig(rule.id);

    // 如果规则被禁用，不修改其他配置
    if (!config.enabled) {
      return {
        ...rule,
        // 添加一个标记表示该规则已被禁用
        _disabled: true,
      } as IRule;
    }

    // 应用用户配置的严重程度
    if (config.severity) {
      return {
        ...rule,
        severity: config.severity,
        _originalSeverity: rule.severity, // 保存原始严重程度
      };
    }

    return rule;
  }

  /**
   * 判断规则是否启用
   * @param ruleId 规则ID
   * @returns 是否启用
   */
  isRuleEnabled(ruleId: string): boolean {
    const config = this.getRuleConfig(ruleId);
    return config.enabled !== false; // 默认为true
  }

  /**
   * 获取规则严重程度
   * @param ruleId 规则ID
   * @returns 规则严重程度
   */
  getRuleSeverity(ruleId: string): RuleSeverity {
    const config = this.getRuleConfig(ruleId);
    return config.severity || RuleSeverity.MEDIUM;
  }

  /**
   * 保存规则配置到文件
   * @param configPath 配置文件路径
   */
  async saveConfigToFile(configPath: string): Promise<boolean> {
    try {
      // 合并现有配置
      const config = this.projectConfig || {};
      config.rules = this.userConfig;

      // 确保目录存在
      const dir = path.dirname(configPath);
      await fs.mkdir(dir, { recursive: true });

      // 写入配置文件
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('保存规则配置文件失败:', error);
      return false;
    }
  }

  /**
   * 获取完整项目配置
   */
  getProjectConfig(): TProjectConfig | null {
    return this.projectConfig;
  }

  /**
   * 从默认配置生成用户配置模板
   * @returns 用户配置模板
   */
  generateConfigTemplate(): Record<string, RuleConfig> {
    const template: Record<string, RuleConfig> = {};

    // 从默认配置中生成模板
    for (const [ruleId, config] of Object.entries(this.defaultConfig)) {
      template[ruleId] = {
        enabled: config.enabled,
        severity: config.severity,
        // 添加注释字段，方便用户了解规则
        _comment: `规则ID: ${ruleId}，默认严重程度: ${config.severity}`,
      };
    }

    return template;
  }
}

/**
 * 创建默认规则配置管理器
 * @returns 规则配置管理器实例
 */
export function createDefaultRulesConfigManager(): RulesConfigManager {
  return new RulesConfigManager();
}

/**
 * 解析安全扫描配置文件
 * 支持package.json中的配置和独立的配置文件
 * @param projectDir 项目目录
 * @returns 配置文件路径或undefined
 */
export async function findConfigFile(projectDir: string): Promise<string | undefined> {
  // 查找顺序：
  // 1. safescan.config.json
  // 2. .safescan.json
  // 3. package.json中的safescan字段

  const configPaths = [
    path.join(projectDir, 'safescan.config.json'),
    path.join(projectDir, '.safescan.json'),
  ];

  // 尝试查找独立配置文件
  for (const configPath of configPaths) {
    try {
      await fs.access(configPath);
      return configPath;
    } catch (error) {
      // 文件不存在，继续检查下一个
    }
  }

  // 查找package.json中的配置
  const packageJsonPath = path.join(projectDir, 'package.json');
  try {
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    if (packageJson.safescan) {
      return packageJsonPath;
    }
  } catch (error) {
    // package.json不存在或解析失败
  }

  return undefined;
}

/**
 * 规则禁用注释分析器
 * 用于识别源代码中禁用规则的注释
 */
export class RuleDisableCommentsParser {
  /**
   * 分析源代码中的规则禁用注释
   * @param source 源代码
   * @returns 禁用规则信息
   */
  parseDisableComments(source: string): Map<number, Set<string>> {
    const disabledRules = new Map<number, Set<string>>();
    const lines = source.split('\n');

    // 正则表达式匹配disable注释模式
    const disableRegex = /\/\/\s*safescan-disable(-next-line)?\s+([\w\-,\s]+)/g;
    const disableLineRegex = /\/\/\s*safescan-disable-line\s+([\w\-,\s]+)/;

    let skipNextLine = false;
    let skipNextLineRules: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // 处理前一行的disable-next-line
      if (skipNextLine) {
        const lineRules = disabledRules.get(lineNumber) || new Set<string>();
        skipNextLineRules.forEach((rule) => lineRules.add(rule));
        disabledRules.set(lineNumber, lineRules);
        skipNextLine = false;
        skipNextLineRules = [];
      }

      // 匹配当前行的disable-line
      const lineMatch = line.match(disableLineRegex);
      if (lineMatch) {
        const rules = lineMatch[1].split(',').map((r) => r.trim());
        const lineRules = disabledRules.get(lineNumber) || new Set<string>();
        rules.forEach((rule) => lineRules.add(rule));
        disabledRules.set(lineNumber, lineRules);
      }

      // 匹配disable-next-line
      let match;
      while ((match = disableRegex.exec(line)) !== null) {
        if (match[1] === '-next-line') {
          // 禁用下一行
          skipNextLine = true;
          skipNextLineRules = match[2].split(',').map((r) => r.trim());
        }
      }
    }

    return disabledRules;
  }

  /**
   * 检查规则是否在指定行禁用
   * @param ruleId 规则ID
   * @param line 行号
   * @param disabledRules 禁用规则信息
   * @returns 是否禁用
   */
  isRuleDisabledForLine(
    ruleId: string,
    line: number,
    disabledRules: Map<number, Set<string>>
  ): boolean {
    const lineRules = disabledRules.get(line);
    if (!lineRules) return false;

    return lineRules.has(ruleId) || lineRules.has('all');
  }
}
