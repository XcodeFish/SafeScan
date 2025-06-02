/**
 * 增量扫描器
 * 只扫描自上次扫描后修改过的文件，提高性能
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getCache } from '../../cache/memory';
import type { TRuleResult, RuleSeverity } from '../../types';
import type { Rule } from '../../types/rule';
import { parse } from './parser';

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
}

/**
 * 增量扫描器
 */
export class IncrementalScanner {
  private config: IncrementalScannerConfig;

  /**
   * 创建增量扫描器实例
   * @param config 配置选项
   */
  constructor(config: IncrementalScannerConfig = {}) {
    this.config = {
      enableCache: true,
      forceRescan: false,
      cacheTTL: 3600000, // 1小时
      ...config,
    };
  }

  /**
   * 对文件执行增量规则检查
   * @param filePath 文件路径
   * @param rules 要检查的规则
   * @returns 规则检查结果
   */
  async scanFile(filePath: string, rules: Rule[]): Promise<TRuleResult[]> {
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
  async scanFiles(filePaths: string[], rules: Rule[]): Promise<TRuleResult[]> {
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
  private async fullScan(filePath: string, rules: Rule[]): Promise<TRuleResult[]> {
    try {
      // 读取文件内容
      const fileContent = await fs.readFile(filePath, 'utf-8');

      // 解析AST
      const ast = await parse(fileContent, filePath);
      if (!ast) {
        throw new Error(`解析AST失败: ${filePath}`);
      }

      const results: TRuleResult[] = [];

      // 遍历AST执行所有规则
      this.traverseAST(ast, (node) => {
        for (const rule of rules) {
          // 创建规则上下文
          const context = {
            fileContent,
            filePath,
            ast,
            getNodeText: (node: any) => {
              const startPos = node.span?.start;
              const endPos = node.span?.end;
              if (startPos !== undefined && endPos !== undefined) {
                return fileContent.substring(startPos, endPos);
              }
              return '';
            },
            getNodeLocation: (node: any) => {
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
            // 执行规则匹配
            const issue = rule.matcher(node, context);
            if (issue) {
              // 收集结果
              if (Array.isArray(issue)) {
                issue.forEach((i) => {
                  results.push({
                    ruleId: rule.id,
                    message: i.message,
                    severity: i.severity as unknown as RuleSeverity,
                    location: {
                      filePath,
                      start: i.location.start,
                      end: i.location.end,
                    },
                    codeSnippet: i.code || '',
                    fixSuggestion:
                      i.suggestions && i.suggestions.length > 0
                        ? i.suggestions[0].code || i.suggestions[0].description
                        : undefined,
                    fixable: i.suggestions && i.suggestions.length > 0 ? true : false,
                  });
                });
              } else {
                results.push({
                  ruleId: rule.id,
                  message: issue.message,
                  severity: issue.severity as unknown as RuleSeverity,
                  location: {
                    filePath,
                    start: issue.location.start,
                    end: issue.location.end,
                  },
                  codeSnippet: issue.code || '',
                  fixSuggestion:
                    issue.suggestions && issue.suggestions.length > 0
                      ? issue.suggestions[0].code || issue.suggestions[0].description
                      : undefined,
                  fixable: issue.suggestions && issue.suggestions.length > 0 ? true : false,
                });
              }
            }
          } catch (error) {
            console.error(`规则执行错误 (${rule.id}):`, error);
          }
        }
      });

      return results;
    } catch (error) {
      console.error(`完整扫描失败 (${filePath}):`, error);
      return [];
    }
  }

  /**
   * 简单的AST遍历器
   * @param node 节点
   * @param visitor 访问器函数
   */
  private traverseAST(node: any, visitor: (node: any) => void): void {
    if (!node) return;

    // 调用访问器
    visitor(node);

    // 遍历子节点
    if (Array.isArray(node.body)) {
      node.body.forEach((child: any) => this.traverseAST(child, visitor));
    } else if (node.body) {
      this.traverseAST(node.body, visitor);
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
        child.forEach((c: any) => c && this.traverseAST(c, visitor));
      } else if (child && typeof child === 'object') {
        this.traverseAST(child, visitor);
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
  private getCacheKey(filePath: string, rules: Rule[]): string {
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
