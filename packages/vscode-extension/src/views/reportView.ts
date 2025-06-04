import * as vscode from 'vscode';
import { AnalysisResult } from '../diagnostics';

/**
 * 安全报告视图
 * 用于展示项目安全分析总览报告
 */
export class ReportView {
  private panel: vscode.WebviewPanel | undefined;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * 显示安全报告视图
   */
  public show(data: {
    issuesByFile: Map<string, AnalysisResult[]>;
    scanDuration: number;
    timestamp: Date;
  }): void {
    if (this.panel) {
      this.panel.reveal();
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'safescanReport',
        'SafeScan 安全报告',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
        }
      );

      this.panel.onDidDispose(() => {
        this.panel = undefined;
      });
    }

    // 更新面板内容
    this.panel.webview.html = this.generateReportHtml(data);

    // 处理消息
    this.panel.webview.onDidReceiveMessage(
      (message: { command: string; [key: string]: any }) => {
        switch (message.command) {
          case 'exportPDF':
            this.exportReport('pdf');
            return;
          case 'exportHTML':
            this.exportReport('html');
            return;
        }
      },
      undefined,
      this.context.subscriptions
    );
  }

  /**
   * 导出报告
   */
  private async exportReport(format: 'pdf' | 'html'): Promise<void> {
    // 实现导出功能
    vscode.window.showInformationMessage(`导出${format === 'pdf' ? 'PDF' : 'HTML'}功能即将上线...`);
  }

  /**
   * 生成报告HTML
   */
  private generateReportHtml(data: {
    issuesByFile: Map<string, AnalysisResult[]>;
    scanDuration: number;
    timestamp: Date;
  }): string {
    // 计算统计信息
    const statistics = this.calculateStatistics(data.issuesByFile);

    // 生成图表数据
    const severityChartData = JSON.stringify({
      labels: ['错误', '警告', '信息', '提示'],
      datasets: [
        {
          data: [
            statistics.errorCount,
            statistics.warningCount,
            statistics.infoCount,
            statistics.hintCount,
          ],
          backgroundColor: ['#f44336', '#ff9800', '#2196f3', '#8bc34a'],
        },
      ],
    });

    // 生成每个文件的问题分布
    const fileDistribution: { fileName: string; issueCount: number }[] = [];
    data.issuesByFile.forEach((issues, file) => {
      if (issues.length > 0) {
        fileDistribution.push({
          fileName: file.split('/').pop() || file,
          issueCount: issues.length,
        });
      }
    });

    // 按问题数量排序
    fileDistribution.sort((a, b) => b.issueCount - a.issueCount);

    // 只取前10个
    const topFiles = fileDistribution.slice(0, 10);

    const fileChartData = JSON.stringify({
      labels: topFiles.map((f) => f.fileName),
      datasets: [
        {
          label: '问题数量',
          data: topFiles.map((f) => f.issueCount),
          backgroundColor: 'rgba(33, 150, 243, 0.7)',
        },
      ],
    });

    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>SafeScan 安全报告</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js"></script>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', system-ui, 'Ubuntu', 'Droid Sans', sans-serif;
            padding: 0 20px;
            color: var(--vscode-foreground);
          }
          
          .report-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          
          .report-title {
            margin: 0;
          }
          
          .report-actions {
            display: flex;
            gap: 10px;
          }
          
          .report-action {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
          }
          
          .report-action:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          
          .report-meta {
            margin-bottom: 20px;
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
          }
          
          .report-section {
            margin-bottom: 30px;
          }
          
          .report-section-title {
            font-size: 18px;
            margin-bottom: 15px;
          }
          
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
          }
          
          .stat-card {
            background-color: var(--vscode-editor-background);
            border-radius: 4px;
            padding: 15px;
            text-align: center;
          }
          
          .stat-value {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          
          .error-color { color: #f44336; }
          .warning-color { color: #ff9800; }
          .info-color { color: #2196f3; }
          .hint-color { color: #8bc34a; }
          
          .chart-container {
            position: relative;
            height: 300px;
            margin-bottom: 30px;
          }
          
          .chart-row {
            display: flex;
            gap: 20px;
            margin-bottom: 30px;
          }
          
          .chart-col {
            flex: 1;
          }
          
          @media (max-width: 768px) {
            .chart-row {
              flex-direction: column;
            }
          }
          
          .recommendations {
            background-color: var(--vscode-editor-background);
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 30px;
          }
          
          .recommendation {
            margin-bottom: 10px;
            line-height: 1.5;
          }
        </style>
      </head>
      <body>
        <div class="report-header">
          <h1 class="report-title">SafeScan 安全报告</h1>
          <div class="report-actions">
            <button class="report-action" id="exportPDF">导出PDF</button>
            <button class="report-action" id="exportHTML">导出HTML</button>
          </div>
        </div>
        
        <div class="report-meta">
          <div>扫描时间: ${data.timestamp.toLocaleString()}</div>
          <div>扫描耗时: ${data.scanDuration.toFixed(2)} 秒</div>
          <div>扫描文件数: ${data.issuesByFile.size}</div>
        </div>
        
        <div class="report-section">
          <h2 class="report-section-title">安全状况总览</h2>
          
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${statistics.totalIssueCount}</div>
              <div class="stat-label">总问题数</div>
            </div>
            <div class="stat-card">
              <div class="stat-value error-color">${statistics.errorCount}</div>
              <div class="stat-label">错误</div>
            </div>
            <div class="stat-card">
              <div class="stat-value warning-color">${statistics.warningCount}</div>
              <div class="stat-label">警告</div>
            </div>
            <div class="stat-card">
              <div class="stat-value info-color">${statistics.infoCount}</div>
              <div class="stat-label">信息</div>
            </div>
            <div class="stat-card">
              <div class="stat-value hint-color">${statistics.hintCount}</div>
              <div class="stat-label">提示</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${statistics.filesWithIssues}</div>
              <div class="stat-label">有问题的文件</div>
            </div>
          </div>
        </div>
        
        <div class="report-section">
          <h2 class="report-section-title">问题分布</h2>
          
          <div class="chart-row">
            <div class="chart-col">
              <h3>按严重级别划分</h3>
              <div class="chart-container">
                <canvas id="severityChart"></canvas>
              </div>
            </div>
            <div class="chart-col">
              <h3>问题最多的文件 (Top 10)</h3>
              <div class="chart-container">
                <canvas id="fileChart"></canvas>
              </div>
            </div>
          </div>
        </div>
        
        <div class="report-section">
          <h2 class="report-section-title">安全建议</h2>
          
          <div class="recommendations">
            ${this.generateRecommendations(statistics)}
          </div>
        </div>
        
        <script>
          (function() {
            const vscode = acquireVsCodeApi();
            
            // 初始化饼图
            const severityCtx = document.getElementById('severityChart').getContext('2d');
            new Chart(severityCtx, {
              type: 'pie',
              data: ${severityChartData},
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: {
                    position: 'right',
                    labels: {
                      color: getComputedStyle(document.body).color
                    }
                  }
                }
              }
            });
            
            // 初始化柱状图
            const fileCtx = document.getElementById('fileChart').getContext('2d');
            new Chart(fileCtx, {
              type: 'bar',
              data: ${fileChartData},
              options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                  legend: {
                    display: false
                  }
                },
                scales: {
                  x: {
                    ticks: {
                      color: getComputedStyle(document.body).color
                    },
                    grid: {
                      color: 'rgba(127, 127, 127, 0.1)'
                    }
                  },
                  y: {
                    ticks: {
                      color: getComputedStyle(document.body).color
                    },
                    grid: {
                      display: false
                    }
                  }
                }
              }
            });
            
            // 导出按钮事件
            document.getElementById('exportPDF').addEventListener('click', () => {
              vscode.postMessage({
                command: 'exportPDF'
              });
            });
            
            document.getElementById('exportHTML').addEventListener('click', () => {
              vscode.postMessage({
                command: 'exportHTML'
              });
            });
          })();
        </script>
      </body>
      </html>
    `;
  }

  /**
   * 计算统计信息
   */
  private calculateStatistics(issuesByFile: Map<string, AnalysisResult[]>): {
    totalIssueCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    hintCount: number;
    filesWithIssues: number;
  } {
    let totalIssueCount = 0;
    let errorCount = 0;
    let warningCount = 0;
    let infoCount = 0;
    let hintCount = 0;
    let filesWithIssues = 0;

    issuesByFile.forEach((issues) => {
      if (issues.length > 0) {
        filesWithIssues++;
        totalIssueCount += issues.length;

        issues.forEach((issue) => {
          switch (issue.severity) {
            case 'error':
              errorCount++;
              break;
            case 'warning':
              warningCount++;
              break;
            case 'info':
              infoCount++;
              break;
            case 'hint':
              hintCount++;
              break;
          }
        });
      }
    });

    return {
      totalIssueCount,
      errorCount,
      warningCount,
      infoCount,
      hintCount,
      filesWithIssues,
    };
  }

  /**
   * 生成安全建议
   */
  private generateRecommendations(stats: {
    totalIssueCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    hintCount: number;
    filesWithIssues: number;
  }): string {
    const recommendations = [];

    if (stats.errorCount > 0) {
      recommendations.push(`
        <div class="recommendation">
          <strong>优先修复严重安全问题:</strong> 您的项目有 ${stats.errorCount} 个严重安全问题，建议优先修复这些问题，它们可能导致XSS、注入等安全漏洞。
        </div>
      `);
    }

    if (stats.warningCount > 0) {
      recommendations.push(`
        <div class="recommendation">
          <strong>关注内存泄漏问题:</strong> 检测到 ${stats.warningCount} 个潜在的内存泄漏问题，这些问题在长期运行的应用中可能导致性能下降和崩溃。
        </div>
      `);
    }

    if (stats.filesWithIssues > 5) {
      recommendations.push(`
        <div class="recommendation">
          <strong>考虑代码审查:</strong> 有 ${stats.filesWithIssues} 个文件存在安全问题，建议组织代码评审，集中解决这些问题。
        </div>
      `);
    }

    recommendations.push(`
      <div class="recommendation">
        <strong>定期安全扫描:</strong> 建议将SafeScan集成到您的CI/CD流程中，每次提交代码时自动运行安全检测。
      </div>
    `);

    recommendations.push(`
      <div class="recommendation">
        <strong>团队安全培训:</strong> 考虑对团队进行前端安全培训，提高安全意识，减少常见安全问题的引入。
      </div>
    `);

    return recommendations.join('');
  }
}
