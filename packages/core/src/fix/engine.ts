/**
 * 自动修复引擎
 * 负责根据规则匹配结果应用修复
 */
import fs from 'fs/promises';
import path from 'path';
import type { TRuleResult } from '../types';
import { generateSuggestion } from './suggestion';
import { getAllTemplates } from './templates';
import { transformCode } from './transformer';
import { IFixContext, IFixResult, IFixTemplate, IIssue, IValidationResult } from './types';
import { validateFix } from './validator';

/**
 * 修复操作类型
 */
export enum FixOperationType {
  REPLACE = 'replace',
  INSERT = 'insert',
  DELETE = 'delete',
}

/**
 * 修复操作
 */
export interface IFixOperation {
  /** 操作类型 */
  type: FixOperationType;
  /** 起始位置 */
  start: number;
  /** 结束位置 */
  end: number;
  /** 替换内容 */
  content?: string;
  /** 修复描述 */
  description: string;
}

/**
 * 修复候选项
 */
export interface IFixCandidate {
  /** 修复方案ID */
  id: string;
  /** 修复方案名称 */
  name: string;
  /** 修复描述 */
  description: string;
  /** 修复操作 */
  operations: IFixOperation[];
  /** 预计置信度(0-100) */
  confidence: number;
}

/**
 * 修复结果
 */
export interface IFixApplyResult {
  /** 是否成功应用 */
  success: boolean;
  /** 修复后的代码 */
  fixedCode?: string;
  /** 文件路径 */
  filePath: string;
  /** 应用的修复候选项ID */
  candidateId?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 修复引擎配置
 */
export interface IFixEngineConfig {
  /** 是否先备份原文件 */
  backup?: boolean;
  /** 备份目录 */
  backupDir?: string;
  /** 是否自动应用修复 */
  autoApply?: boolean;
  /** 最小置信度要求 */
  minConfidence?: number;
}

/**
 * 修复引擎类
 */
export class FixEngine {
  private config: IFixEngineConfig;
  private templates: Map<string, IFixTemplate>;
  private templatesByRule: Map<string, IFixTemplate[]>;

  /**
   * 构造函数
   */
  constructor(config: IFixEngineConfig = {}) {
    this.config = {
      backup: true,
      backupDir: '.safescan-backup',
      autoApply: false,
      minConfidence: 80,
      ...config,
    };
    this.templates = new Map();
    this.templatesByRule = new Map();
    this.initializeTemplates();
  }

  /**
   * 初始化模板库
   */
  private initializeTemplates(): void {
    const templates = getAllTemplates();

    // 注册所有模板
    templates.forEach((template) => {
      this.templates.set(template.id, template);

      // 按规则ID索引模板
      template.supportedRules.forEach((ruleId) => {
        if (!this.templatesByRule.has(ruleId)) {
          this.templatesByRule.set(ruleId, []);
        }
        this.templatesByRule.get(ruleId)?.push(template);
      });
    });
  }

  /**
   * 根据问题查找适用的修复模板
   * @param issue 问题
   * @returns 匹配的模板列表
   */
  public findTemplatesForIssue(issue: IIssue): IFixTemplate[] {
    const templates = this.templatesByRule.get(issue.ruleId) || [];
    return templates;
  }

  /**
   * 修复单个问题
   * @param sourceCode 源代码
   * @param filePath 文件路径
   * @param issue 问题
   * @param options 选项
   * @returns 修复结果
   */
  public async fixIssue(
    sourceCode: string,
    filePath: string,
    issue: IIssue,
    options: { validateAfterFix?: boolean } = {}
  ): Promise<IFixResult> {
    const templates = this.findTemplatesForIssue(issue);

    if (templates.length === 0) {
      return {
        fixed: false,
        failReason: `没有找到适用于规则 ${issue.ruleId} 的修复模板`,
        description: '无法自动修复',
        changedLocations: [],
        suggestion: await this.generateManualFixSuggestion(issue),
      };
    }

    // 尝试每一个匹配的模板进行修复
    for (const template of templates) {
      const context: IFixContext = {
        sourceCode,
        filePath,
        node: issue.metadata?.node,
        ruleId: issue.ruleId,
        location: issue.location,
        issue,
      };

      try {
        const result = template.fix(context);

        // 如果修复成功且需要验证
        if (result.fixed && options.validateAfterFix && result.fixedCode) {
          const validationResult = await this.validateFix({
            originalCode: sourceCode,
            fixedCode: result.fixedCode,
            filePath,
            issue,
          });

          if (!validationResult.valid) {
            result.fixed = false;
            result.failReason = `修复验证失败: ${validationResult.errors?.join(', ')}`;
          }
        }

        if (result.fixed) {
          return result;
        }
      } catch (error) {
        console.error(`模板 ${template.id} 修复出错:`, error);
      }
    }

    // 所有模板都无法修复,生成手动修复建议
    return {
      fixed: false,
      failReason: '所有适用模板均无法修复此问题',
      description: '无法自动修复',
      changedLocations: [],
      suggestion: await this.generateManualFixSuggestion(issue),
    };
  }

  /**
   * 批量修复多个问题
   * @param sourceCode 源代码
   * @param filePath 文件路径
   * @param issues 问题列表
   * @param options 选项
   * @returns 修复结果
   */
  public async fixMultipleIssues(
    sourceCode: string,
    filePath: string,
    issues: IIssue[],
    options: { validateAfterFix?: boolean } = {}
  ): Promise<{ fixedCode: string; results: IFixResult[] }> {
    let currentCode = sourceCode;
    const results: IFixResult[] = [];

    // 按位置从后向前排序,避免位置偏移问题
    const sortedIssues = [...issues].sort(
      (a, b) =>
        b.location.startLine - a.location.startLine ||
        b.location.startColumn - a.location.startColumn
    );

    for (const issue of sortedIssues) {
      const result = await this.fixIssue(currentCode, filePath, issue, options);
      results.push(result);

      if (result.fixed && result.fixedCode) {
        currentCode = result.fixedCode;
      }
    }

    return {
      fixedCode: currentCode,
      results,
    };
  }

  /**
   * 验证修复结果
   * @param params 验证参数
   * @returns 验证结果
   */
  public async validateFix(params: {
    originalCode: string;
    fixedCode: string;
    filePath: string;
    issue: IIssue;
  }): Promise<IValidationResult> {
    return validateFix(params);
  }

  /**
   * 生成手动修复建议
   * @param issue 问题
   * @returns 修复建议
   */
  private async generateManualFixSuggestion(issue: IIssue): Promise<string> {
    const suggestion = await generateSuggestion(issue);
    return suggestion?.description || '无法提供修复建议';
  }

  /**
   * 应用转换器转换代码
   * @param sourceCode 源代码
   * @param transformations 转换配置
   * @returns 转换后代码
   */
  public async transformCode(sourceCode: string, transformations: any[]): Promise<string> {
    return transformCode(sourceCode, transformations);
  }

  /**
   * 生成修复候选项
   * @param results 规则检查结果
   * @returns 修复候选项列表
   */
  async generateFixCandidates(results: TRuleResult[]): Promise<Map<string, IFixCandidate[]>> {
    // 按文件分组规则结果
    const fileResults = new Map<string, TRuleResult[]>();

    for (const result of results) {
      if (!result.fixable) continue;

      const filePath = result.location.filePath;
      if (!fileResults.has(filePath)) {
        fileResults.set(filePath, []);
      }
      fileResults.get(filePath)!.push(result);
    }

    // 生成候选项
    const candidatesByFile = new Map<string, IFixCandidate[]>();

    for (const [filePath, fileResultsList] of fileResults.entries()) {
      // 读取文件内容
      let sourceCode: string;
      try {
        sourceCode = await fs.readFile(filePath, 'utf-8');
      } catch (error) {
        console.error(`无法读取文件 ${filePath}:`, error);
        continue;
      }

      const candidates: IFixCandidate[] = [];

      // 为每个结果生成修复候选项
      for (const result of fileResultsList) {
        if (result.fixSuggestion) {
          const fixId = `${result.ruleId}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

          candidates.push({
            id: fixId,
            name: `修复 ${result.ruleId} 问题`,
            description: result.fixSuggestion,
            operations: [
              {
                type: FixOperationType.REPLACE,
                start: this.getPositionOffset(
                  sourceCode,
                  result.location.start.line,
                  result.location.start.column
                ),
                end: this.getPositionOffset(
                  sourceCode,
                  result.location.end.line,
                  result.location.end.column
                ),
                content: result.fixSuggestion,
                description: `替换代码以修复 ${result.ruleId} 问题`,
              },
            ],
            confidence: 90, // 基础置信度
          });
        } else {
          // 如果没有明确的修复建议，尝试根据规则类型生成
          const generatedCandidates = this.generateRuleBasedFixCandidates(result, sourceCode);
          if (generatedCandidates.length > 0) {
            candidates.push(...generatedCandidates);
          }
        }
      }

      if (candidates.length > 0) {
        candidatesByFile.set(filePath, candidates);
      }
    }

    return candidatesByFile;
  }

  /**
   * 根据规则类型生成修复候选项
   * @param result 规则结果
   * @param sourceCode 源代码
   * @returns 修复候选项列表
   */
  private generateRuleBasedFixCandidates(result: TRuleResult, sourceCode: string): IFixCandidate[] {
    const candidates: IFixCandidate[] = [];
    const fixId = `${result.ruleId}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const startOffset = this.getPositionOffset(
      sourceCode,
      result.location.start.line,
      result.location.start.column
    );
    const endOffset = this.getPositionOffset(
      sourceCode,
      result.location.end.line,
      result.location.end.column
    );
    const problematicCode = sourceCode.substring(startOffset, endOffset);

    // 根据规则ID前缀判断规则类型
    if (result.ruleId.startsWith('security/xss')) {
      // XSS相关修复
      if (problematicCode.includes('dangerouslySetInnerHTML')) {
        // 修复dangerouslySetInnerHTML
        const fixedCode = problematicCode.replace(
          /\{\s*__html:\s*([^}]+)\}/,
          '{ __html: DOMPurify.sanitize($1) }'
        );

        candidates.push({
          id: fixId,
          name: '安全处理HTML内容',
          description: '使用DOMPurify库对HTML内容进行安全过滤',
          operations: [
            {
              type: FixOperationType.REPLACE,
              start: startOffset,
              end: endOffset,
              content: fixedCode,
              description: '添加DOMPurify.sanitize()处理',
            },
            {
              type: FixOperationType.INSERT,
              start: this.findImportInsertPosition(sourceCode),
              end: this.findImportInsertPosition(sourceCode),
              content: "import DOMPurify from 'dompurify';\n",
              description: '添加DOMPurify导入',
            },
          ],
          confidence: 85,
        });
      }
    } else if (result.ruleId.startsWith('security/csrf')) {
      // CSRF相关修复
      if (problematicCode.includes('<form')) {
        // 在表单中添加CSRF令牌
        const fixedCode = problematicCode.replace(
          /(<form[^>]*>)/,
          '$1\n  <input type="hidden" name="csrf_token" value={getCsrfToken()} />'
        );

        candidates.push({
          id: fixId,
          name: '添加CSRF令牌',
          description: '向表单添加CSRF令牌输入字段',
          operations: [
            {
              type: FixOperationType.REPLACE,
              start: startOffset,
              end: endOffset,
              content: fixedCode,
              description: '添加CSRF令牌输入字段',
            },
          ],
          confidence: 80,
        });
      }
    } else if (result.ruleId.startsWith('memory/leak')) {
      // 内存泄漏相关修复
      if (problematicCode.includes('useEffect')) {
        // 添加清理函数
        if (problematicCode.includes('addEventListener')) {
          const listenerType =
            problematicCode.match(/addEventListener\(['"](.*?)['"]/)?.[1] || 'event';
          const handlerName =
            problematicCode.match(/addEventListener\(['"](.*?)['"],\s*([^),]+)/)?.[2] || 'handler';

          const fixedCode = problematicCode.replace(
            /(\s*)\}\s*,\s*(\[[^\]]*\])\s*\)/,
            `$1  return () => {\n$1    document.removeEventListener('${listenerType}', ${handlerName});\n$1  };\n$1}, $2)`
          );

          candidates.push({
            id: fixId,
            name: '添加事件清理函数',
            description: '在useEffect中添加返回清理函数，移除事件监听器',
            operations: [
              {
                type: FixOperationType.REPLACE,
                start: startOffset,
                end: endOffset,
                content: fixedCode,
                description: '添加事件清理函数',
              },
            ],
            confidence: 90,
          });
        }
      }
    }

    return candidates;
  }

  /**
   * 应用修复
   * @param filePath 文件路径
   * @param candidate 修复候选项
   * @returns 修复结果
   */
  async applyFix(filePath: string, candidate: IFixCandidate): Promise<IFixApplyResult> {
    try {
      // 读取文件内容
      const sourceCode = await fs.readFile(filePath, 'utf-8');

      // 如果配置了备份，则先备份原文件
      if (this.config.backup) {
        await this.backupFile(filePath);
      }

      // 应用修复操作
      let fixedCode = sourceCode;
      const sortedOperations = [...candidate.operations].sort((a, b) => b.start - a.start);

      for (const operation of sortedOperations) {
        switch (operation.type) {
          case FixOperationType.REPLACE:
            fixedCode =
              fixedCode.substring(0, operation.start) +
              (operation.content || '') +
              fixedCode.substring(operation.end);
            break;
          case FixOperationType.INSERT:
            fixedCode =
              fixedCode.substring(0, operation.start) +
              (operation.content || '') +
              fixedCode.substring(operation.start);
            break;
          case FixOperationType.DELETE:
            fixedCode =
              fixedCode.substring(0, operation.start) + fixedCode.substring(operation.end);
            break;
        }
      }

      // 如果配置了自动应用，则写入文件
      if (this.config.autoApply) {
        await fs.writeFile(filePath, fixedCode, 'utf-8');
      }

      return {
        success: true,
        fixedCode,
        filePath,
        candidateId: candidate.id,
      };
    } catch (error) {
      console.error(`应用修复失败 (${filePath}):`, error);
      return {
        success: false,
        filePath,
        error: `应用修复失败: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * 备份文件
   * @param filePath 文件路径
   * @returns 备份路径
   */
  private async backupFile(filePath: string): Promise<string> {
    // 创建备份目录
    const backupDir = path.join(path.dirname(filePath), this.config.backupDir!);
    await fs.mkdir(backupDir, { recursive: true });

    // 生成备份文件名
    const fileName = path.basename(filePath);
    const timestamp = new Date().toISOString().replace(/[:T]/g, '-').replace(/\..+/, '');
    const backupPath = path.join(backupDir, `${fileName}.${timestamp}.bak`);

    // 复制文件
    await fs.copyFile(filePath, backupPath);
    return backupPath;
  }

  /**
   * 获取行列位置对应的字符偏移量
   * @param text 文本
   * @param line 行号(1-based)
   * @param column 列号(1-based)
   * @returns 字符偏移量
   */
  private getPositionOffset(text: string, line: number, column: number): number {
    const lines = text.split('\n');
    let offset = 0;

    // 计算前面行的总长度
    for (let i = 0; i < line - 1; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }

    // 加上当前行的列偏移
    offset += column - 1;

    return offset;
  }

  /**
   * 查找适合插入导入语句的位置
   * @param sourceCode 源代码
   * @returns 插入位置
   */
  private findImportInsertPosition(sourceCode: string): number {
    // 查找最后一个import语句
    const importRegex = /^import\s+.+?;?\s*$/gm;
    let lastImport = null;
    let match;

    while ((match = importRegex.exec(sourceCode)) !== null) {
      lastImport = match;
    }

    if (lastImport) {
      // 在最后一个import语句后插入
      return lastImport.index + lastImport[0].length + 1;
    } else {
      // 在文件开头插入
      return 0;
    }
  }
}

/**
 * 创建修复引擎实例
 * @param config 配置
 * @returns 修复引擎实例
 */
export function createFixEngine(config?: IFixEngineConfig): FixEngine {
  return new FixEngine(config);
}

/**
 * 修复请求接口
 */
interface FixRequest {
  file: string;
  issueId: string;
  fix: string | FixFunction;
}

/**
 * 修复函数类型
 */
type FixFunction = (fileContent: string) => string;

/**
 * 修复结果接口
 */
interface FixResult {
  successCount: number;
  failureCount: number;
  failures: {
    file: string;
    issueId: string;
    error: string;
  }[];
}

/**
 * 应用自动修复
 *
 * @param fixes 修复请求数组
 * @returns 修复结果
 */
export async function applyFixes(fixes: FixRequest[]): Promise<FixResult> {
  const result: FixResult = {
    successCount: 0,
    failureCount: 0,
    failures: [],
  };

  // 按文件分组修复请求，避免多次读写同一文件
  const fileFixMap: Map<string, FixRequest[]> = new Map();

  for (const fix of fixes) {
    if (!fileFixMap.has(fix.file)) {
      fileFixMap.set(fix.file, []);
    }
    fileFixMap.get(fix.file)?.push(fix);
  }

  // 处理每个文件
  for (const [file, fileFixes] of fileFixMap.entries()) {
    try {
      // 读取文件内容
      const fileContent = await fs.readFile(file, 'utf8');

      // 应用所有修复
      let updatedContent = fileContent;

      for (const fixRequest of fileFixes) {
        try {
          if (typeof fixRequest.fix === 'string') {
            // 字符串修复是直接替换的模板
            updatedContent = updatedContent.replace(/\/\/ AUTO-FIX: .+/g, '');
            updatedContent =
              updatedContent + `\n// AUTO-FIX: ${fixRequest.issueId}\n${fixRequest.fix}\n`;
          } else if (typeof fixRequest.fix === 'function') {
            // 函数修复需要调用函数处理
            updatedContent = fixRequest.fix(updatedContent);
          }

          result.successCount++;
        } catch (error: unknown) {
          result.failureCount++;
          result.failures.push({
            file: fixRequest.file,
            issueId: fixRequest.issueId,
            error: (error as Error).message || '未知错误',
          });
        }
      }

      // 仅在内容变更时写入文件
      if (updatedContent !== fileContent) {
        await fs.writeFile(file, updatedContent, 'utf8');
      }
    } catch (error: unknown) {
      // 处理文件读写错误
      for (const fixRequest of fileFixes) {
        result.failureCount++;
        result.failures.push({
          file: fixRequest.file,
          issueId: fixRequest.issueId,
          error: `文件操作失败: ${(error as Error).message || '未知错误'}`,
        });
      }
    }
  }

  return result;
}
