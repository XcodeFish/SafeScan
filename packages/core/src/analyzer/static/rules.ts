/**
 * 规则加载与匹配系统
 */
import fs from 'fs/promises';
import path from 'path';
import {
  IRule,
  RuleCategory,
  RuleSeverity,
  TRuleContext,
  TRuleResult,
  TAST,
  Framework,
} from '../../types';

/**
 * 规则加载器
 * 负责加载和管理规则库
 */
export class RuleLoader {
  // 规则集合，以规则ID为键
  private rules: Map<string, IRule> = new Map();

  // 按框架分类的规则，方便快速查找
  private frameworkRules: Map<Framework, Set<string>> = new Map();

  // 按类别分类的规则，方便按类别启用/禁用
  private categoryRules: Map<RuleCategory, Set<string>> = new Map();

  // 按严重程度分类的规则，方便按严重程度过滤
  private severityRules: Map<RuleSeverity, Set<string>> = new Map();

  /**
   * 从目录加载规则
   * @param ruleDirPath 规则目录路径
   */
  async loadRulesFromDirectory(ruleDirPath: string): Promise<void> {
    try {
      const ruleFiles = await this.findRuleFiles(ruleDirPath);

      for (const filePath of ruleFiles) {
        try {
          // 动态导入规则模块
          const ruleModule = await import(filePath);

          // 处理默认导出或命名导出
          const rule = ruleModule.default || ruleModule.rule;

          if (this.isValidRule(rule)) {
            this.addRule(rule);
          } else {
            console.warn(`规则文件 ${filePath} 不包含有效的规则定义`);
          }
        } catch (error) {
          console.error(`加载规则文件 ${filePath} 失败:`, error);
        }
      }
    } catch (error) {
      console.error('加载规则目录失败:', error);
      throw error;
    }
  }

  /**
   * 递归查找规则文件
   * @param dirPath 目录路径
   * @returns 规则文件路径数组
   */
  private async findRuleFiles(dirPath: string): Promise<string[]> {
    const results: string[] = [];
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // 递归处理子目录
        const subDirFiles = await this.findRuleFiles(fullPath);
        results.push(...subDirFiles);
      } else if (entry.isFile() && this.isRuleFile(entry.name)) {
        // 将相对路径转换为绝对路径
        results.push(path.resolve(fullPath));
      }
    }

    return results;
  }

  /**
   * 判断文件是否为规则文件
   * @param fileName 文件名
   * @returns 是否为规则文件
   */
  private isRuleFile(fileName: string): boolean {
    return (
      /\.(js|ts)$/.test(fileName) && !fileName.includes('.test.') && !fileName.includes('.spec.')
    );
  }

  /**
   * 验证规则定义是否有效
   * @param rule 规则对象
   * @returns 是否为有效规则
   */
  private isValidRule(rule: any): rule is IRule {
    return (
      rule &&
      typeof rule.id === 'string' &&
      typeof rule.name === 'string' &&
      typeof rule.description === 'string' &&
      Object.values(RuleCategory).includes(rule.category) &&
      Object.values(RuleSeverity).includes(rule.severity) &&
      typeof rule.detect === 'function'
    );
  }

  /**
   * 添加单条规则
   * @param rule 规则对象
   */
  addRule(rule: IRule): void {
    // 检查规则ID是否已存在
    if (this.rules.has(rule.id)) {
      console.warn(`规则ID '${rule.id}' 已存在，将被覆盖`);
    }

    // 添加规则到主集合
    this.rules.set(rule.id, rule);

    // 按框架分类
    if (rule.frameworks && rule.frameworks.length > 0) {
      for (const framework of rule.frameworks) {
        if (!this.frameworkRules.has(framework)) {
          this.frameworkRules.set(framework, new Set());
        }
        this.frameworkRules.get(framework)!.add(rule.id);
      }
    }

    // 按类别分类
    if (!this.categoryRules.has(rule.category)) {
      this.categoryRules.set(rule.category, new Set());
    }
    this.categoryRules.get(rule.category)!.add(rule.id);

    // 按严重程度分类
    if (!this.severityRules.has(rule.severity)) {
      this.severityRules.set(rule.severity, new Set());
    }
    this.severityRules.get(rule.severity)!.add(rule.id);
  }

  /**
   * 移除规则
   * @param ruleId 规则ID
   */
  removeRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return false;
    }

    // 从主集合中移除
    this.rules.delete(ruleId);

    // 从框架分类中移除
    if (rule.frameworks) {
      for (const framework of rule.frameworks) {
        this.frameworkRules.get(framework)?.delete(ruleId);
      }
    }

    // 从类别分类中移除
    this.categoryRules.get(rule.category)?.delete(ruleId);

    // 从严重程度分类中移除
    this.severityRules.get(rule.severity)?.delete(ruleId);

    return true;
  }

  /**
   * 获取所有规则
   * @returns 所有规则对象
   */
  getAllRules(): IRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 获取指定框架的规则
   * @param framework 框架类型
   * @returns 框架规则数组
   */
  getRulesByFramework(framework: Framework): IRule[] {
    const ruleIds = this.frameworkRules.get(framework);
    if (!ruleIds) {
      return [];
    }

    return Array.from(ruleIds)
      .map((id) => this.rules.get(id))
      .filter((rule): rule is IRule => rule !== undefined);
  }

  /**
   * 获取指定类别的规则
   * @param category 规则类别
   * @returns 类别规则数组
   */
  getRulesByCategory(category: RuleCategory): IRule[] {
    const ruleIds = this.categoryRules.get(category);
    if (!ruleIds) {
      return [];
    }

    return Array.from(ruleIds)
      .map((id) => this.rules.get(id))
      .filter((rule): rule is IRule => rule !== undefined);
  }

  /**
   * 获取指定严重程度的规则
   * @param severity 规则严重程度
   * @returns 严重程度规则数组
   */
  getRulesBySeverity(severity: RuleSeverity): IRule[] {
    const ruleIds = this.severityRules.get(severity);
    if (!ruleIds) {
      return [];
    }

    return Array.from(ruleIds)
      .map((id) => this.rules.get(id))
      .filter((rule): rule is IRule => rule !== undefined);
  }

  /**
   * 根据ID获取规则
   * @param ruleId 规则ID
   * @returns 规则对象，不存在则返回undefined
   */
  getRule(ruleId: string): IRule | undefined {
    return this.rules.get(ruleId);
  }
}

/**
 * 规则匹配器
 * 负责对AST应用规则检测
 */
export class RuleMatcher {
  private ruleLoader: RuleLoader;

  constructor(ruleLoader: RuleLoader) {
    this.ruleLoader = ruleLoader;
  }

  /**
   * 对AST应用所有适用规则
   * @param ast AST对象
   * @param context 规则上下文
   * @returns 规则匹配结果数组
   */
  matchAll(ast: TAST, context: TRuleContext): TRuleResult[] {
    const allRules = this.ruleLoader.getAllRules();
    return this.applyRules(allRules, ast, context);
  }

  /**
   * 对AST应用指定框架的规则
   * @param ast AST对象
   * @param context 规则上下文
   * @param framework 框架类型
   * @returns 规则匹配结果数组
   */
  matchByFramework(ast: TAST, context: TRuleContext, framework: Framework): TRuleResult[] {
    const frameworkRules = this.ruleLoader.getRulesByFramework(framework);
    return this.applyRules(frameworkRules, ast, context);
  }

  /**
   * 对AST应用指定类别的规则
   * @param ast AST对象
   * @param context 规则上下文
   * @param category 规则类别
   * @returns 规则匹配结果数组
   */
  matchByCategory(ast: TAST, context: TRuleContext, category: RuleCategory): TRuleResult[] {
    const categoryRules = this.ruleLoader.getRulesByCategory(category);
    return this.applyRules(categoryRules, ast, context);
  }

  /**
   * 对AST应用指定严重程度及以上的规则
   * @param ast AST对象
   * @param context 规则上下文
   * @param minSeverity 最低严重程度
   * @returns 规则匹配结果数组
   */
  matchBySeverity(ast: TAST, context: TRuleContext, minSeverity: RuleSeverity): TRuleResult[] {
    // 获取所有规则
    const allRules = this.ruleLoader.getAllRules();

    // 过滤出符合最低严重程度的规则
    const severityOrder = Object.values(RuleSeverity);
    const minSeverityIndex = severityOrder.indexOf(minSeverity);

    const filteredRules = allRules.filter((rule) => {
      const ruleSeverityIndex = severityOrder.indexOf(rule.severity);
      return ruleSeverityIndex <= minSeverityIndex; // 严重程度越高，索引越小
    });

    return this.applyRules(filteredRules, ast, context);
  }

  /**
   * 对AST应用指定规则
   * @param ast AST对象
   * @param context 规则上下文
   * @param ruleId 规则ID
   * @returns 规则匹配结果数组
   */
  matchByRuleId(ast: TAST, context: TRuleContext, ruleId: string): TRuleResult[] {
    const rule = this.ruleLoader.getRule(ruleId);
    if (!rule) {
      return [];
    }

    return this.applyRules([rule], ast, context);
  }

  /**
   * 应用规则集合到AST
   * @param rules 规则数组
   * @param ast AST对象
   * @param context 规则上下文
   * @returns 规则匹配结果数组
   */
  private applyRules(rules: IRule[], ast: TAST, context: TRuleContext): TRuleResult[] {
    const results: TRuleResult[] = [];

    for (const rule of rules) {
      try {
        // 应用规则的检测函数
        const ruleResults = rule.detect(ast, context);
        if (ruleResults && ruleResults.length > 0) {
          results.push(...ruleResults);
        }
      } catch (error) {
        console.error(`应用规则 '${rule.id}' 时出错:`, error);
        // 继续处理下一条规则
      }
    }

    return results;
  }
}
