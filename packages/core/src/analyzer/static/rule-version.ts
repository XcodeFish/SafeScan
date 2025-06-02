/**
 * 规则版本管理机制
 * 用于跟踪和管理规则版本变化
 */
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import type { IRule } from '../../types';

/**
 * 规则版本信息
 */
export interface RuleVersion {
  id: string;
  version: string;
  hash: string;
  lastUpdated: string;
  changelogs?: string[];
}

/**
 * 规则版本库
 */
interface RuleVersionRegistry {
  schemaVersion: string;
  lastUpdated: string;
  rules: Record<string, RuleVersion>;
}

/**
 * 规则版本更新类型
 */
export enum RuleUpdateType {
  NEW = 'new', // 新规则
  UPDATED = 'updated', // 规则更新
  REMOVED = 'removed', // 规则被移除
  UNCHANGED = 'unchanged', // 规则未变
}

/**
 * 规则更新信息
 */
export interface RuleUpdate {
  ruleId: string;
  type: RuleUpdateType;
  previousVersion?: string;
  currentVersion?: string;
  changelogs?: string[];
}

/**
 * 规则版本管理器
 * 负责跟踪规则版本变化，生成版本号，保存版本历史
 */
export class RuleVersionManager {
  private versionRegistry: RuleVersionRegistry;
  private registryPath: string;

  /**
   * 构造函数
   * @param registryPath 版本注册表保存路径
   */
  constructor(registryPath: string) {
    this.registryPath = registryPath;
    this.versionRegistry = {
      schemaVersion: '1.0',
      lastUpdated: new Date().toISOString(),
      rules: {},
    };
  }

  /**
   * 加载版本注册表
   * @returns 是否加载成功
   */
  async loadRegistry(): Promise<boolean> {
    try {
      const content = await fs.readFile(this.registryPath, 'utf-8');
      const registry = JSON.parse(content) as RuleVersionRegistry;

      // 验证注册表格式
      if (registry.schemaVersion && registry.rules) {
        this.versionRegistry = registry;
        return true;
      }
      return false;
    } catch (error) {
      // 如果文件不存在或格式无效，使用默认空注册表
      console.log('规则版本注册表不存在，将创建新注册表');
      return false;
    }
  }

  /**
   * 保存版本注册表
   * @returns 是否保存成功
   */
  async saveRegistry(): Promise<boolean> {
    try {
      // 更新最后更新时间
      this.versionRegistry.lastUpdated = new Date().toISOString();

      // 确保目录存在
      const dir = path.dirname(this.registryPath);
      await fs.mkdir(dir, { recursive: true });

      // 写入文件
      await fs.writeFile(this.registryPath, JSON.stringify(this.versionRegistry, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('保存规则版本注册表失败:', error);
      return false;
    }
  }

  /**
   * 生成规则的哈希值
   * @param rule 规则对象
   * @returns 哈希值
   */
  private generateRuleHash(rule: IRule): string {
    const hashContent = JSON.stringify({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      category: rule.category,
      severity: rule.severity,
      // 不包含detect函数内容，因为其实现可能变化
      // 但功能相同，这样可以避免不必要的版本变更
      detectorSignature: rule.detect.toString().replace(/\s+/g, ' '),
    });

    return createHash('sha256').update(hashContent).digest('hex');
  }

  /**
   * 生成语义化版本号
   * @param existingVersion 现有版本号
   * @param isMajorUpdate 是否为重大更新
   * @returns 新版本号
   */
  private generateNewVersion(existingVersion?: string, isMajorUpdate: boolean = false): string {
    // 如果没有现有版本，从1.0.0开始
    if (!existingVersion) {
      return '1.0.0';
    }

    // 解析版本号
    const versionParts = existingVersion.split('.').map(Number);

    if (versionParts.length !== 3) {
      // 无效版本号，返回默认值
      return '1.0.0';
    }

    if (isMajorUpdate) {
      // 重大更新，增加主版本号
      return `${versionParts[0] + 1}.0.0`;
    } else {
      // 次要更新，增加次版本号
      return `${versionParts[0]}.${versionParts[1] + 1}.0`;
    }
  }

  /**
   * 更新规则版本
   * @param rule 规则对象
   * @param changelog 变更日志
   * @param isMajorUpdate 是否为重大更新
   * @returns 更新类型
   */
  updateRuleVersion(
    rule: IRule,
    changelog?: string,
    isMajorUpdate: boolean = false
  ): RuleUpdateType {
    const ruleId = rule.id;
    const currentHash = this.generateRuleHash(rule);

    // 检查规则是否已存在
    if (this.versionRegistry.rules[ruleId]) {
      const existingRule = this.versionRegistry.rules[ruleId];

      // 检查哈希值是否变化
      if (existingRule.hash === currentHash) {
        // 规则未变化
        return RuleUpdateType.UNCHANGED;
      }

      // 生成新版本号
      const newVersion = this.generateNewVersion(existingRule.version, isMajorUpdate);

      // 更新规则版本信息
      this.versionRegistry.rules[ruleId] = {
        id: ruleId,
        version: newVersion,
        hash: currentHash,
        lastUpdated: new Date().toISOString(),
        changelogs: [
          ...(existingRule.changelogs || []),
          changelog ? `v${newVersion}: ${changelog}` : `v${newVersion}: 规则更新`,
        ],
      };

      return RuleUpdateType.UPDATED;
    } else {
      // 新规则，初始化版本信息
      this.versionRegistry.rules[ruleId] = {
        id: ruleId,
        version: '1.0.0',
        hash: currentHash,
        lastUpdated: new Date().toISOString(),
        changelogs: changelog ? [`v1.0.0: ${changelog}`] : [`v1.0.0: 初始版本`],
      };

      return RuleUpdateType.NEW;
    }
  }

  /**
   * 批量更新规则版本
   * @param rules 规则数组
   * @param changelogProvider 变更日志提供函数
   * @returns 更新信息数组
   */
  updateRulesVersions(rules: IRule[], changelogProvider?: (rule: IRule) => string): RuleUpdate[] {
    const updates: RuleUpdate[] = [];
    const currentRuleIds = new Set(rules.map((rule) => rule.id));

    // 处理每条规则
    for (const rule of rules) {
      const previousVersion = this.versionRegistry.rules[rule.id]?.version;
      const updateType = this.updateRuleVersion(
        rule,
        changelogProvider ? changelogProvider(rule) : undefined
      );

      updates.push({
        ruleId: rule.id,
        type: updateType,
        previousVersion,
        currentVersion: this.versionRegistry.rules[rule.id].version,
        changelogs: this.versionRegistry.rules[rule.id].changelogs,
      });
    }

    // 标记已删除的规则
    for (const ruleId of Object.keys(this.versionRegistry.rules)) {
      if (!currentRuleIds.has(ruleId)) {
        updates.push({
          ruleId,
          type: RuleUpdateType.REMOVED,
          previousVersion: this.versionRegistry.rules[ruleId].version,
        });
      }
    }

    return updates;
  }

  /**
   * 获取单个规则的版本信息
   * @param ruleId 规则ID
   * @returns 规则版本信息
   */
  getRuleVersion(ruleId: string): RuleVersion | undefined {
    return this.versionRegistry.rules[ruleId];
  }

  /**
   * 获取所有规则的版本信息
   * @returns 所有规则的版本信息
   */
  getAllRuleVersions(): Record<string, RuleVersion> {
    return this.versionRegistry.rules;
  }

  /**
   * 移除规则版本信息
   * @param ruleId 规则ID
   * @returns 是否成功移除
   */
  removeRuleVersion(ruleId: string): boolean {
    if (this.versionRegistry.rules[ruleId]) {
      delete this.versionRegistry.rules[ruleId];
      return true;
    }
    return false;
  }

  /**
   * 生成规则版本变更摘要
   * @param updates 更新信息数组
   * @returns 变更摘要
   */
  generateChangeSummary(updates: RuleUpdate[]): string {
    const newRules = updates.filter((u) => u.type === RuleUpdateType.NEW);
    const updatedRules = updates.filter((u) => u.type === RuleUpdateType.UPDATED);
    const removedRules = updates.filter((u) => u.type === RuleUpdateType.REMOVED);

    const lines: string[] = [
      `# 规则更新摘要 - ${new Date().toISOString().split('T')[0]}`,
      '',
      `总共发生 ${updates.length} 个变更`,
      '',
    ];

    if (newRules.length > 0) {
      lines.push(`## 新增规则 (${newRules.length})`, '');
      newRules.forEach((rule) => {
        lines.push(`* ${rule.ruleId} v${rule.currentVersion}`);
      });
      lines.push('');
    }

    if (updatedRules.length > 0) {
      lines.push(`## 更新规则 (${updatedRules.length})`, '');
      updatedRules.forEach((rule) => {
        lines.push(`* ${rule.ruleId}: v${rule.previousVersion} -> v${rule.currentVersion}`);
        if (rule.changelogs && rule.changelogs.length > 0) {
          lines.push(
            `  * ${rule.changelogs[rule.changelogs.length - 1].replace(/^v[0-9.]+: /, '')}`
          );
        }
      });
      lines.push('');
    }

    if (removedRules.length > 0) {
      lines.push(`## 移除规则 (${removedRules.length})`, '');
      removedRules.forEach((rule) => {
        lines.push(`* ${rule.ruleId} (原版本: v${rule.previousVersion})`);
      });
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * 保存变更日志
   * @param updates 更新信息数组
   * @param changelogPath 变更日志路径
   */
  async saveChangelog(updates: RuleUpdate[], changelogPath: string): Promise<boolean> {
    try {
      // 生成变更摘要
      const summary = this.generateChangeSummary(updates);

      // 确保目录存在
      const dir = path.dirname(changelogPath);
      await fs.mkdir(dir, { recursive: true });

      // 读取现有变更日志（如果存在）
      let existingContent = '';
      try {
        existingContent = await fs.readFile(changelogPath, 'utf-8');
      } catch {
        // 文件不存在，忽略错误
      }

      // 合并新旧内容
      const content = summary + (existingContent ? '\n\n' + existingContent : '');

      // 写入文件
      await fs.writeFile(changelogPath, content, 'utf-8');
      return true;
    } catch (error) {
      console.error('保存规则变更日志失败:', error);
      return false;
    }
  }
}
