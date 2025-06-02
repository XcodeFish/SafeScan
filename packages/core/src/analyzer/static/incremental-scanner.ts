/**
 * 增量扫描器
 * 只扫描自上次扫描后修改过的文件，提高性能
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getCache } from '../../cache/memory';
import type { TRuleResult, IRule } from '../../types';
import { parse } from './parser';
import { RuleVersionManager } from './rule-version';
import { IRuleSchedulerConfig } from './rules-config';
import { matchRulesWithScheduler } from './rules-matcher';

// 定义SWC节点的扩展类型，用于AST操作
interface SWCNode extends Record<string, unknown> {
  type?: string;
  span?: {
    start: number;
    end: number;
    ctxt?: number;
  };
  body?: SWCNode[] | SWCNode;
}

/**
 * 文件内容哈希缓存
 */
const fileHashCache = getCache<string>('fileHash');

/**
 * 规则结果缓存
 */
const ruleResultCache = getCache<TRuleResult[]>('rules');

/**
 * 增量扫描配置
 */
export interface IncrementalScannerConfig {
  /**
   * 是否启用缓存
   * @default true
   */
  enableCache?: boolean;

  /**
   * 是否强制重新扫描所有文件
   * @default false
   */
  forceRescan?: boolean;

  /**
   * 缓存TTL（毫秒）
   * @default 3600000 (1小时)
   */
  cacheTTL?: number;

  /**
   * 排除文件模式
   */
  exclude?: string[];

  /**
   * 规则调度器配置
   */
  schedulerConfig?: IRuleSchedulerConfig;

  /**
   * 规则版本管理器配置路径
   */
  rulesVersionRegistryPath?: string;

  /**
   * 是否启用规则优先级调度
   * @default true
   */
  enablePriorityScheduling?: boolean;
}

/**
 * 增量扫描器
 */
export class IncrementalScanner {
  private config: IncrementalScannerConfig;
  private ruleVersionManager: RuleVersionManager | null = null;

  /**
   * 创建增量扫描器实例
   * @param config 配置选项
   */
  constructor(config: IncrementalScannerConfig = {}) {
    this.config = {
      enableCache: true,
      forceRescan: false,
      cacheTTL: 3600000, // 1小时
      enablePriorityScheduling: true,
      ...config,
    };

    // 初始化规则版本管理器
    if (this.config.rulesVersionRegistryPath) {
      this.ruleVersionManager = new RuleVersionManager(this.config.rulesVersionRegistryPath);
      // 异步加载版本注册表
      this.ruleVersionManager.loadRegistry().catch((err) => {
        console.error('加载规则版本注册表失败:', err);
      });
    }
  }

  /**
   * 对文件执行增量规则检查
   * @param filePath 文件路径
   * @param rules 要检查的规则
   * @returns 规则检查结果
   */
  async scanFile(filePath: string, rules: IRule[]): Promise<TRuleResult[]> {
    // 如果启用了规则版本管理，更新规则版本
    await this.updateRuleVersions(rules);

    // 如果禁用缓存或强制重新扫描，则执行完整扫描
    if (!this.config.enableCache || this.config.forceRescan) {
      return this.fullScan(filePath, rules);
    }

    try {
      // 检查文件是否更改
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const currentHash = this.hashContent(fileContent);
      const cachedHash = fileHashCache.get(filePath);

      // 如果文件内容未变化且有缓存结果，直接返回缓存结果
      if (currentHash === cachedHash && ruleResultCache.has(this.getCacheKey(filePath, rules))) {
        return ruleResultCache.get(this.getCacheKey(filePath, rules)) || [];
      }

      // 执行完整扫描
      const results = await this.fullScan(filePath, rules);

      // 更新文件哈希缓存
      fileHashCache.set(filePath, currentHash);

      // 缓存扫描结果
      ruleResultCache.set(this.getCacheKey(filePath, rules), results);

      return results;
    } catch (error) {
      console.error(`增量扫描失败 (${filePath}):`, error);
      // 出错时尝试使用缓存结果
      return ruleResultCache.get(this.getCacheKey(filePath, rules)) || [];
    }
  }

  /**
   * 扫描多个文件
   * @param filePaths 文件路径列表
   * @param rules 要检查的规则
   * @returns 规则检查结果
   */
  async scanFiles(filePaths: string[], rules: IRule[]): Promise<TRuleResult[]> {
    // 如果启用了规则版本管理，更新规则版本
    await this.updateRuleVersions(rules);

    // 过滤排除的文件
    const filteredPaths = this.config.exclude
      ? filePaths.filter((filePath) => !this.isExcluded(filePath))
      : filePaths;

    // 并行扫描所有文件
    const resultsPromises = filteredPaths.map((filePath) => this.scanFile(filePath, rules));
    const resultsArrays = await Promise.all(resultsPromises);

    // 合并所有结果
    return resultsArrays.flat();
  }

  /**
   * 执行完整的规则扫描
   * @param filePath 文件路径
   * @param rules 要检查的规则
   * @returns 规则检查结果
   */
  private async fullScan(filePath: string, rules: IRule[]): Promise<TRuleResult[]> {
    try {
      // 读取文件内容
      const fileContent = await fs.readFile(filePath, 'utf-8');

      // 解析AST
      const parseResult = await parse(fileContent, filePath);
      if (!parseResult || !parseResult.success || !parseResult.ast) {
        throw new Error(`解析AST失败: ${filePath}`);
      }

      // 使用优先级调度器执行规则检测
      if (this.config.enablePriorityScheduling) {
        const issues = await matchRulesWithScheduler(
          parseResult,
          rules,
          this.config.schedulerConfig
        );

        // 转换为TRuleResult类型
        return issues as unknown as TRuleResult[];
      } else {
        // 使用传统方式（遍历AST）执行规则检测
        const results: TRuleResult[] = [];

        // 遍历AST执行所有规则
        this.traverseAST(parseResult.ast, (_node) => {
          for (const rule of rules) {
            // 创建规则上下文
            const context = {
              fileContent,
              filePath,
              ast: parseResult.ast,
              getNodeText: (node: SWCNode) => {
                const startPos = node.span?.start;
                const endPos = node.span?.end;
                if (startPos !== undefined && endPos !== undefined) {
                  return fileContent.substring(startPos, endPos);
                }
                return '';
              },
              getNodeLocation: (node: SWCNode) => {
                const startPos = node.span?.start || 0;
                const endPos = node.span?.end || 0;

                // 简单计算行列号
                const beforeStart = fileContent.substring(0, startPos);
                const beforeEnd = fileContent.substring(0, endPos);

                const startLine = (beforeStart.match(/\n/g) || []).length + 1;
                const endLine = (beforeEnd.match(/\n/g) || []).length + 1;

                const startLineStart = beforeStart.lastIndexOf('\n') + 1;
                const endLineStart = beforeEnd.lastIndexOf('\n') + 1;

                return {
                  filePath,
                  start: {
                    line: startLine,
                    column: startPos - startLineStart + 1,
                  },
                  end: {
                    line: endLine,
                    column: endPos - endLineStart + 1,
                  },
                };
              },
            };

            try {
              // 执行规则检测
              const ruleResults = rule.detect(parseResult.ast, context);
              if (ruleResults && ruleResults.length > 0) {
                results.push(...ruleResults);
              }
            } catch (error) {
              console.error(`规则 ${rule.id} 执行错误:`, error);
            }
          }
        });

        return results;
      }
    } catch (error) {
      console.error(`扫描文件失败 (${filePath}):`, error);
      return [];
    }
  }

  /**
   * 更新规则版本信息
   * @param rules 规则数组
   */
  private async updateRuleVersions(rules: IRule[]): Promise<void> {
    if (!this.ruleVersionManager) return;

    try {
      // 更新规则版本
      const updates = this.ruleVersionManager.updateRulesVersions(rules);

      // 保存注册表
      await this.ruleVersionManager.saveRegistry();

      // 如果有修改，保存更新日志
      if (updates.some((u) => u.type !== 'unchanged')) {
        const changelogPath = path.join(
          path.dirname(this.config.rulesVersionRegistryPath || ''),
          'CHANGELOG.md'
        );
        await this.ruleVersionManager.saveChangelog(updates, changelogPath);
      }
    } catch (error) {
      console.error('更新规则版本失败:', error);
    }
  }

  /**
   * 简单的AST遍历器
   * @param node 节点
   * @param visitor 访问器函数
   */
  private traverseAST(node: SWCNode, visitor: (node: SWCNode) => void): void {
    if (!node) return;

    // 调用访问器
    visitor(node);

    // 遍历子节点
    if (Array.isArray(node.body)) {
      node.body.forEach((child: SWCNode) => this.traverseAST(child, visitor));
    } else if (node.body) {
      this.traverseAST(node.body as SWCNode, visitor);
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
      const child = node[key];

      if (Array.isArray(child)) {
        child.forEach((c: SWCNode | null) => c && this.traverseAST(c, visitor));
      } else if (child && typeof child === 'object') {
        this.traverseAST(child as SWCNode, visitor);
      }
    }
  }

  /**
   * 计算文件内容哈希值
   * @param content 文件内容
   * @returns 哈希值
   */
  private hashContent(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 生成规则结果缓存键
   * @param filePath 文件路径
   * @param rules 规则列表
   * @returns 缓存键
   */
  private getCacheKey(filePath: string, rules: IRule[]): string {
    // 结合文件路径和规则ID生成唯一键
    const ruleIds = rules
      .map((rule) => rule.id)
      .sort()
      .join(',');
    return `${filePath}:${ruleIds}`;
  }

  /**
   * 检查文件是否被排除
   * @param filePath 文件路径
   * @returns 是否排除
   */
  private isExcluded(filePath: string): boolean {
    if (!this.config.exclude || this.config.exclude.length === 0) {
      return false;
    }

    const normalizedPath = path.normalize(filePath).replace(/\\/g, '/');

    return this.config.exclude.some((pattern) => {
      // 简单的通配符匹配
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
        return regex.test(normalizedPath);
      }

      // 简单的路径包含匹配
      return normalizedPath.includes(pattern);
    });
  }
}

/**
 * 创建增量扫描器
 * @param config 配置选项
 * @returns 增量扫描器实例
 */
export function createIncrementalScanner(config?: IncrementalScannerConfig): IncrementalScanner {
  return new IncrementalScanner(config);
}
