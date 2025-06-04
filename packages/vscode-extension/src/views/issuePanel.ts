import * as vscode from 'vscode';
import { AnalysisResult } from '../diagnostics';

export class IssuePanel {
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * 显示安全问题面板
   * @param issues 安全问题列表
   */
  public show(issues: Map<string, AnalysisResult[]>): void {
    if (this.panel) {
      this.panel.reveal();
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'safescanIssues',
        'SafeScan 安全问题',
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }

    // 更新面板内容
    this.updateContent(issues);
  }

  /**
   * 更新面板内容
   */
  private updateContent(issues: Map<string, AnalysisResult[]>): void {
    if (!this.panel) return;

    // 处理问题数据，按严重性分类
    const errorCount = this.countIssuesBySeverity(issues, 'error');
    const warningCount = this.countIssuesBySeverity(issues, 'warning');
    const infoCount = this.countIssuesBySeverity(issues, 'info');
    const hintCount = this.countIssuesBySeverity(issues, 'hint');

    // 生成HTML
    this.panel.webview.html = this.generateHtml(issues, {
      error: errorCount,
      warning: warningCount,
      info: infoCount,
      hint: hintCount,
    });
  }

  /**
   * 计算特定严重级别的问题数量
   */
  private countIssuesBySeverity(issues: Map<string, AnalysisResult[]>, severity: string): number {
    let count = 0;
    issues.forEach((fileIssues) => {
      count += fileIssues.filter((issue) => issue.severity === severity).length;
    });
    return count;
  }

  /**
   * 生成面板HTML内容
   */
  private generateHtml(
    issues: Map<string, AnalysisResult[]>,
    counts: { error: number; warning: number; info: number; hint: number }
  ): string {
    let issueItems = '';

    issues.forEach((fileIssues, filePath) => {
      if (fileIssues.length === 0) return;

      const fileName = filePath.split('/').pop() || filePath;

      issueItems += `
        <div class="file-group">
          <div class="file-header">
            <span class="file-name">${this.escapeHtml(fileName)}</span>
            <span class="file-path">${this.escapeHtml(filePath)}</span>
            <span class="issue-count">${fileIssues.length}个问题</span>
          </div>
          <div class="issues">
      `;

      fileIssues.forEach((issue) => {
        issueItems += `
          <div class="issue issue-${issue.severity}">
            <div class="issue-header">
              <span class="issue-severity ${issue.severity}">${this.getSeverityLabel(issue.severity)}</span>
              <span class="issue-rule">${issue.ruleId}</span>
            </div>
            <div class="issue-message">${this.escapeHtml(issue.message)}</div>
            <div class="issue-location">行 ${issue.location.start.line}, 列 ${issue.location.start.column}</div>
            
            <div class="issue-actions">
              <button class="action-button fix-button" data-file="${this.escapeHtml(filePath)}" data-rule="${issue.ruleId}" data-line="${issue.location.start.line}">修复问题</button>
              <button class="action-button goto-button" data-file="${this.escapeHtml(filePath)}" data-line="${issue.location.start.line}" data-column="${issue.location.start.column}">查看代码</button>
            </div>
          </div>
        `;
      });

      issueItems += `
          </div>
        </div>
      `;
    });

    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SafeScan 安全问题</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', system-ui, 'Ubuntu', 'Droid Sans', sans-serif;
            padding: 0 20px;
            color: var(--vscode-foreground);
          }
          
          .summary {
            display: flex;
            margin-bottom: 20px;
            padding: 10px;
            background-color: var(--vscode-editor-background);
            border-radius: 4px;
          }
          
          .summary-item {
            margin-right: 20px;
            text-align: center;
          }
          
          .summary-count {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          
          .error { color: #f44336; }
          .warning { color: #ff9800; }
          .info { color: #2196f3; }
          .hint { color: #8bc34a; }
          
          .file-group {
            margin-bottom: 20px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
          }
          
          .file-header {
            padding: 10px;
            background-color: var(--vscode-panel-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
          }
          
          .file-name {
            font-weight: bold;
            margin-right: 10px;
          }
          
          .file-path {
            color: var(--vscode-descriptionForeground);
            flex: 1;
          }
          
          .issue-count {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 12px;
          }
          
          .issue {
            padding: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          
          .issue:last-child {
            border-bottom: none;
          }
          
          .issue-severity {
            display: inline-block;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 12px;
            margin-right: 10px;
          }
          
          .issue-rule {
            font-family: monospace;
            background-color: var(--vscode-textBlockQuote-background);
            padding: 2px 4px;
            border-radius: 3px;
          }
          
          .issue-message {
            margin: 10px 0;
            line-height: 1.5;
          }
          
          .issue-location {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
          }
          
          .issue-actions {
            display: flex;
            gap: 10px;
          }
          
          .action-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 8px;
            border-radius: 3px;
            cursor: pointer;
          }
          
          .action-button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          
          .no-issues {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
          }
        </style>
      </head>
      <body>
        <h1>SafeScan 安全扫描结果</h1>
        
        <div class="summary">
          <div class="summary-item">
            <div class="summary-count error">${counts.error}</div>
            <div class="summary-label">错误</div>
          </div>
          <div class="summary-item">
            <div class="summary-count warning">${counts.warning}</div>
            <div class="summary-label">警告</div>
          </div>
          <div class="summary-item">
            <div class="summary-count info">${counts.info}</div>
            <div class="summary-label">信息</div>
          </div>
          <div class="summary-item">
            <div class="summary-count hint">${counts.hint}</div>
            <div class="summary-label">提示</div>
          </div>
        </div>
        
        ${issues.size > 0 ? issueItems : '<div class="no-issues">没有发现安全问题，太棒了！</div>'}
        
        <script>
          (function() {
            // 实现面板交互功能
            const vscode = acquireVsCodeApi();
            
            document.addEventListener('click', function(event) {
              if (event.target.classList.contains('goto-button')) {
                vscode.postMessage({
                  command: 'gotoLocation',
                  file: event.target.getAttribute('data-file'),
                  line: parseInt(event.target.getAttribute('data-line')),
                  column: parseInt(event.target.getAttribute('data-column'))
                });
              }
              
              if (event.target.classList.contains('fix-button')) {
                vscode.postMessage({
                  command: 'fixIssue',
                  file: event.target.getAttribute('data-file'),
                  rule: event.target.getAttribute('data-rule'),
                  line: parseInt(event.target.getAttribute('data-line'))
                });
              }
            });
          })();
        </script>
      </body>
      </html>
    `;
  }

  /**
   * 获取严重性级别的显示标签
   */
  private getSeverityLabel(severity: string): string {
    switch (severity) {
      case 'error':
        return '错误';
      case 'warning':
        return '警告';
      case 'info':
        return '信息';
      case 'hint':
        return '提示';
      default:
        return severity;
    }
  }

  /**
   * HTML转义，防止XSS
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
