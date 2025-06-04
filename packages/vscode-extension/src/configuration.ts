import * as vscode from 'vscode';

export interface AnalysisConfig {
  enableRealTimeAnalysis: boolean;
  severityLevel: 'error' | 'warning' | 'info' | 'hint';
  // 其他配置项...
}

export class ConfigManager {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * 获取是否启用实时分析
   */
  isRealTimeAnalysisEnabled(): boolean {
    return vscode.workspace
      .getConfiguration('safescan')
      .get<boolean>('enableRealTimeAnalysis', true);
  }

  /**
   * 获取严重性级别
   */
  getSeverityLevel(): 'error' | 'warning' | 'info' | 'hint' {
    return vscode.workspace
      .getConfiguration('safescan')
      .get<'error' | 'warning' | 'info' | 'hint'>('severityLevel', 'warning');
  }

  /**
   * 获取完整的分析配置
   */
  getAnalysisConfig(): AnalysisConfig {
    return {
      enableRealTimeAnalysis: this.isRealTimeAnalysisEnabled(),
      severityLevel: this.getSeverityLevel(),
      // 从配置中获取其他设置...
    };
  }

  /**
   * 监听配置变化
   * @param callback 配置变化时的回调函数
   */
  onConfigChange(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
      const affected = event.affectsConfiguration('safescan');
      if (affected) {
        callback();
      }
    });
  }
}
