import * as vscode from 'vscode';
import { ConfigManager } from './configuration';
import { AnalysisResult, IssueSeverity } from './diagnostics';
import { debounce } from './utils/debounce';

// 模拟从SafeScan核心获取分析功能的接口
// 实际应从@safescan/core导入
const analyze = {
  // 分析单个文件
  async analyzeContent(
    content: string,
    options: {
      filePath: string;
      fileType: string;
      config?: any;
    }
  ): Promise<AnalysisResult[]> {
    // 模拟实现，实际应该调用SafeScan核心模块的功能
    const results: AnalysisResult[] = [];

    // 简单XSS检测示例
    if (content.includes('dangerouslySetInnerHTML') || content.includes('innerHTML')) {
      results.push({
        ruleId: 'security/xss',
        message: '潜在的XSS风险: 直接设置HTML可能导致跨站脚本攻击',
        severity: IssueSeverity.Error,
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 20 },
        },
      });
    }

    // 内存泄漏检测示例
    if (
      (options.fileType.includes('react') || content.includes('React')) &&
      content.includes('addEventListener') &&
      !content.includes('removeEventListener')
    ) {
      results.push({
        ruleId: 'memory/event-listener-leak',
        message: '可能的内存泄漏: 添加事件监听器但未移除',
        severity: IssueSeverity.Warning,
        location: {
          start: { line: 10, column: 1 },
          end: { line: 10, column: 30 },
        },
      });
    }

    return results;
  },

  // 扫描整个工作区
  async scanWorkspace(
    workspacePath: string,
    options: {
      config?: any;
      onProgress?: (scanned: number, total: number) => void;
      token?: { isCancellationRequested: boolean; onCancellationRequested: vscode.Event<any> };
    }
  ): Promise<Map<string, AnalysisResult[]>> {
    const results = new Map<string, AnalysisResult[]>();

    // 模拟实现
    // 实际实现应该扫描工作区文件，并逐个分析

    // 模拟一些测试结果
    results.set(`${workspacePath}/src/App.jsx`, [
      {
        ruleId: 'security/xss',
        message: '潜在的XSS风险: 直接设置HTML可能导致跨站脚本攻击',
        severity: IssueSeverity.Error,
        location: {
          start: { line: 15, column: 3 },
          end: { line: 15, column: 45 },
        },
      },
    ]);

    results.set(`${workspacePath}/src/components/UserProfile.tsx`, [
      {
        ruleId: 'memory/event-listener-leak',
        message: '可能的内存泄漏: 添加事件监听器但未移除',
        severity: IssueSeverity.Warning,
        location: {
          start: { line: 32, column: 5 },
          end: { line: 32, column: 55 },
        },
      },
    ]);

    // 模拟进度报告
    if (options.onProgress) {
      for (let i = 1; i <= 10; i++) {
        if (options.token?.isCancellationRequested) {
          break;
        }
        options.onProgress(i, 10);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  },
};

export class ScanAnalyzer {
  private cache = new Map<string, AnalysisResult[]>();
  private configManager: ConfigManager;
  analyzeDocumentDebounced: (document: vscode.TextDocument) => Promise<void>;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.analyzeDocumentDebounced = debounce(this.analyzeDocument.bind(this), 500);
  }

  /**
   * 分析单个文件
   */
  async analyzeFile(document: vscode.TextDocument): Promise<AnalysisResult[]> {
    try {
      const content = document.getText();
      const filePath = document.uri.fsPath;
      const results = await analyze.analyzeContent(content, {
        filePath,
        fileType: document.languageId,
        config: this.configManager.getAnalysisConfig(),
      });

      this.cache.set(filePath, results);
      return results;
    } catch (error) {
      console.error('分析文件失败:', error);
      vscode.window.showErrorMessage(`SafeScan分析失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 分析文档（用于实时分析）
   */
  async analyzeDocument(document: vscode.TextDocument): Promise<void> {
    await this.analyzeFile(document);
  }

  /**
   * 分析整个工作区
   */
  async analyzeWorkspace(workspacePath: string): Promise<Map<string, AnalysisResult[]>> {
    const workspaceResults = new Map<string, AnalysisResult[]>();
    const progressOptions = {
      location: vscode.ProgressLocation.Notification,
      title: '正在扫描工作区...',
      cancellable: true,
    };

    await vscode.window.withProgress(
      progressOptions,
      async (
        progress: vscode.Progress<{ message?: string; increment?: number }>,
        token: vscode.CancellationToken
      ) => {
        try {
          // 使用SafeScan核心模块扫描工作区
          const results = await analyze.scanWorkspace(workspacePath, {
            config: this.configManager.getAnalysisConfig(),
            onProgress: (scanned, total) => {
              progress.report({
                message: `已扫描 ${scanned}/${total} 个文件`,
                increment: (scanned / total) * 100,
              });
            },
            token: {
              isCancellationRequested: token.isCancellationRequested,
              onCancellationRequested: token.onCancellationRequested,
            },
          });

          // 将结果保存到缓存
          results.forEach((fileResults, filePath) => {
            this.cache.set(filePath, fileResults);
            workspaceResults.set(filePath, fileResults);
          });
        } catch (error) {
          console.error('扫描工作区失败:', error);
          vscode.window.showErrorMessage(`SafeScan工作区扫描失败: ${(error as Error).message}`);
        }
      }
    );

    return workspaceResults;
  }

  /**
   * 获取已缓存的分析结果
   */
  getAnalysisResult(filePath: string): AnalysisResult[] {
    return this.cache.get(filePath) || [];
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}
