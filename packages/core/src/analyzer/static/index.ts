import fs from 'fs/promises';
import { glob } from 'glob';
import { MemoryCache } from '../../cache/memory';
import { Severity } from '../../types';

/**
 * 静态分析选项接口
 */
interface StaticAnalyzerOptions {
  rootDir: string;
  ignorePatterns?: string[];
  cache?: MemoryCache;
  ruleSet?: 'default' | 'quickscan' | 'full';
  maxWorkers?: number;
}

/**
 * 分析结果接口
 */
interface AnalysisResult {
  file: string;
  issues: Array<{
    id: string;
    ruleId: string;
    message: string;
    severity: Severity;
    line: number;
    column: number;
    code?: string;
    pointer?: string;
    fixable: boolean;
    fix?: string | ((content: string) => string);
  }>;
}

/**
 * 静态分析器
 * 对项目进行静态代码分析，检测安全问题
 *
 * @param options 静态分析选项
 * @returns 分析结果数组
 */
export async function staticAnalyzer(options: StaticAnalyzerOptions): Promise<AnalysisResult[]> {
  const { rootDir, ignorePatterns = [], cache, ruleSet = 'default' } = options;

  // 构建文件匹配模式
  const patterns = ['**/*.{js,jsx,ts,tsx,vue,svelte}'];

  // 查找所有匹配的文件
  const matchedFiles = await glob(patterns, {
    cwd: rootDir,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', ...(ignorePatterns || [])],
    absolute: true,
  });

  // 模拟分析结果
  const results: AnalysisResult[] = [];

  // 为每个文件生成模拟结果
  for (const file of matchedFiles) {
    try {
      // 检查缓存
      const cacheKey = `${file}-${ruleSet}`;
      if (cache && cache.has(cacheKey)) {
        const cachedResult = cache.get(cacheKey);
        if (cachedResult) {
          results.push(cachedResult as AnalysisResult);
          continue;
        }
      }

      // 读取文件内容
      const content = await fs.readFile(file, 'utf8');

      // 模拟分析过程
      const fileResult: AnalysisResult = {
        file,
        issues: [],
      };

      // 模拟一些常见安全问题
      if (content.includes('innerHTML') || content.includes('dangerouslySetInnerHTML')) {
        fileResult.issues.push({
          id: `issue-${Math.random().toString(36).substr(2, 9)}`,
          ruleId: 'security/no-unsafe-innerHTML',
          message: '避免使用innerHTML或dangerouslySetInnerHTML，可能导致XSS攻击',
          severity: Severity.CRITICAL,
          line: getLineNumber(content, 'innerHTML') || 1,
          column: getColumnNumber(content, 'innerHTML') || 1,
          code: extractCode(content, 'innerHTML'),
          pointer: '^^^^^^^^^^^^',
          fixable: false,
        });
      }

      if (content.includes('eval(') || content.includes('new Function(')) {
        fileResult.issues.push({
          id: `issue-${Math.random().toString(36).substr(2, 9)}`,
          ruleId: 'security/no-eval',
          message: '避免使用eval()或new Function()，可能导致代码注入攻击',
          severity: Severity.CRITICAL,
          line: getLineNumber(content, 'eval(') || 1,
          column: getColumnNumber(content, 'eval(') || 1,
          code: extractCode(content, 'eval('),
          pointer: '^^^^',
          fixable: false,
        });
      }

      if (content.includes('addEventListener') && !content.includes('removeEventListener')) {
        fileResult.issues.push({
          id: `issue-${Math.random().toString(36).substr(2, 9)}`,
          ruleId: 'memory/no-forgotten-listeners',
          message: '添加事件监听器后没有相应的删除操作，可能导致内存泄漏',
          severity: Severity.ERROR,
          line: getLineNumber(content, 'addEventListener') || 1,
          column: getColumnNumber(content, 'addEventListener') || 1,
          code: extractCode(content, 'addEventListener'),
          pointer: '^^^^^^^^^^^^^^^^',
          fixable: true,
          fix: (content) => {
            // 这里是一个简单的修复模板，实际项目中应该有更智能的修复
            return content.replace(
              /(addEventListener\([^)]+\))/g,
              '$1; /* TODO: 在组件销毁时添加相应的removeEventListener */'
            );
          },
        });
      }

      // 如果有问题，添加到结果中
      if (fileResult.issues.length > 0) {
        results.push(fileResult);

        // 存入缓存
        if (cache) {
          cache.set(cacheKey, fileResult);
        }
      }
    } catch (error) {
      console.error(`分析文件 ${file} 时出错:`, error);
    }
  }

  return results;
}

/**
 * 获取关键词在内容中的行号
 */
function getLineNumber(content: string, keyword: string): number | null {
  const index = content.indexOf(keyword);
  if (index === -1) return null;

  const lines = content.substring(0, index).split('\n');
  return lines.length;
}

/**
 * 获取关键词在内容中的列号
 */
function getColumnNumber(content: string, keyword: string): number | null {
  const index = content.indexOf(keyword);
  if (index === -1) return null;

  const lines = content.substring(0, index).split('\n');
  const lastLine = lines[lines.length - 1];
  return lastLine.length + 1;
}

/**
 * 从内容中提取关键词所在的代码片段
 */
function extractCode(content: string, keyword: string): string {
  const index = content.indexOf(keyword);
  if (index === -1) return '';

  const start = Math.max(0, index - 20);
  const end = Math.min(content.length, index + keyword.length + 20);

  return content.substring(start, end).trim();
}
