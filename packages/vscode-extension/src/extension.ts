import * as vscode from 'vscode';
import { ScanAnalyzer } from './analyzer';
import { CodeActionsProvider } from './codeActions';
import { ConfigManager } from './configuration';
import { DiagnosticsManager } from './diagnostics';
import { StatusBarManager } from './statusBar';

// 激活扩展
export function activate(context: vscode.ExtensionContext) {
  console.log('SafeScan扩展已激活');

  // 初始化各模块
  const configManager = new ConfigManager(context);
  const analyzer = new ScanAnalyzer(configManager);
  const diagnosticsManager = new DiagnosticsManager(context);
  const statusBarManager = new StatusBarManager(context);

  // 注册代码操作提供器
  const supportedLanguages = [
    'javascript',
    'typescript',
    'javascriptreact',
    'typescriptreact',
    'vue',
  ];
  const codeActionsProvider = new CodeActionsProvider(diagnosticsManager);

  supportedLanguages.forEach((language) => {
    context.subscriptions.push(
      vscode.languages.registerCodeActionsProvider(
        { scheme: 'file', language },
        codeActionsProvider
      )
    );
  });

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('safescan.scanActiveFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        statusBarManager.showScanning();
        const issues = await analyzer.analyzeFile(editor.document);
        diagnosticsManager.updateDiagnostics(editor.document.uri, issues);
        statusBarManager.showResult(issues.length);
      }
    }),

    vscode.commands.registerCommand('safescan.scanWorkspace', async () => {
      statusBarManager.showScanning();
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders) {
        const issues = await analyzer.analyzeWorkspace(workspaceFolders[0].uri.fsPath);
        diagnosticsManager.updateWorkspaceDiagnostics(issues);
        statusBarManager.showResult(
          [...issues.values()].reduce((acc, curr) => acc + curr.length, 0)
        );
      }
    }),

    vscode.commands.registerCommand('safescan.showIssuePanel', () => {
      // 实现问题面板展示，这部分可以在后续扩展
      vscode.window.showInformationMessage('SafeScan问题面板功能正在开发中...');
    })
  );

  // 监听文档变化，实时分析
  if (configManager.isRealTimeAnalysisEnabled()) {
    const changeTextDocumentHandler = async (event: vscode.TextDocumentChangeEvent) => {
      if (supportedLanguages.includes(event.document.languageId)) {
        // 使用防抖动函数避免频繁分析
        await analyzer.analyzeDocumentDebounced(event.document);
        const issues = analyzer.getAnalysisResult(event.document.uri.fsPath);
        diagnosticsManager.updateDiagnostics(event.document.uri, issues);
        statusBarManager.updateStatus(issues.length);
      }
    };

    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(changeTextDocumentHandler));
  }

  // 处理活动编辑器变化
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(async (editor: vscode.TextEditor | undefined) => {
      if (editor && supportedLanguages.includes(editor.document.languageId)) {
        const issues = analyzer.getAnalysisResult(editor.document.uri.fsPath);
        diagnosticsManager.updateDiagnostics(editor.document.uri, issues);
        statusBarManager.updateStatus(issues.length);
      }
    })
  );

  // 监听配置变化
  context.subscriptions.push(
    configManager.onConfigChange(() => {
      vscode.window.showInformationMessage('SafeScan配置已更新，重新扫描工作区...');
      vscode.commands.executeCommand('safescan.scanWorkspace');
    })
  );
}

// 停用扩展
export function deactivate() {
  console.log('SafeScan扩展已停用');
}
