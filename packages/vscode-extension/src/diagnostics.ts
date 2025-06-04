import * as vscode from 'vscode';

// 导入核心模块类型定义
export interface AnalysisResult {
  ruleId: string;
  message: string;
  severity: IssueSeverity;
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  relatedInfo?: {
    message: string;
    filePath: string;
    location: {
      start: { line: number; column: number };
      end: { line: number; column: number };
    };
  }[];
}

export enum IssueSeverity {
  Error = 'error',
  Warning = 'warning',
  Info = 'info',
  Hint = 'hint',
}

export class DiagnosticsManager {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor(context: vscode.ExtensionContext) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('safescan');
    context.subscriptions.push(this.diagnosticCollection);
  }

  /**
   * 更新单个文件的诊断信息
   */
  updateDiagnostics(uri: vscode.Uri, issues: AnalysisResult[]): void {
    const diagnostics: vscode.Diagnostic[] = issues.map((issue) => {
      // 转换位置信息
      const range = new vscode.Range(
        issue.location.start.line - 1,
        issue.location.start.column - 1,
        issue.location.end.line - 1,
        issue.location.end.column - 1
      );

      // 创建诊断对象
      const diagnostic = new vscode.Diagnostic(
        range,
        issue.message,
        this.mapSeverityToDiagnosticSeverity(issue.severity)
      );

      // 添加额外信息
      diagnostic.code = issue.ruleId;
      diagnostic.source = 'SafeScan';

      // 添加关联信息
      if (issue.relatedInfo && issue.relatedInfo.length > 0) {
        diagnostic.relatedInformation = issue.relatedInfo.map((info) => {
          return new vscode.DiagnosticRelatedInformation(
            new vscode.Location(
              vscode.Uri.file(info.filePath),
              new vscode.Range(
                info.location.start.line - 1,
                info.location.start.column - 1,
                info.location.end.line - 1,
                info.location.end.column - 1
              )
            ),
            info.message
          );
        });
      }

      return diagnostic;
    });

    this.diagnosticCollection.set(uri, diagnostics);
  }

  /**
   * 更新工作区多个文件的诊断信息
   */
  updateWorkspaceDiagnostics(issuesByFile: Map<string, AnalysisResult[]>): void {
    this.diagnosticCollection.clear();
    issuesByFile.forEach((issues, filePath) => {
      this.updateDiagnostics(vscode.Uri.file(filePath), issues);
    });
  }

  /**
   * 清除所有诊断信息
   */
  clearDiagnostics(): void {
    this.diagnosticCollection.clear();
  }

  /**
   * 将SafeScan严重性级别映射到VSCode诊断严重性
   */
  private mapSeverityToDiagnosticSeverity(severity: IssueSeverity): vscode.DiagnosticSeverity {
    switch (severity) {
      case IssueSeverity.Error:
        return vscode.DiagnosticSeverity.Error;
      case IssueSeverity.Warning:
        return vscode.DiagnosticSeverity.Warning;
      case IssueSeverity.Info:
        return vscode.DiagnosticSeverity.Information;
      default:
        return vscode.DiagnosticSeverity.Hint;
    }
  }
}
