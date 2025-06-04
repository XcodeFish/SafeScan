import * as vscode from 'vscode';
import { DiagnosticsManager } from './diagnostics';

// 模拟从SafeScan核心获取修复建议的接口
interface FixSuggestion {
  description: string;
  fix: {
    range: {
      start: { line: number; column: number };
      end: { line: number; column: number };
    };
    text: string;
  };
}

// 这个函数应该从@safescan/core中导入
// 这里临时模拟实现
async function getFixSuggestions(params: {
  ruleId: string;
  document: string;
  position: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  filePath: string;
  fileType: string;
}): Promise<FixSuggestion[]> {
  // 模拟实现，实际应该调用SafeScan核心模块的功能
  if (params.ruleId.includes('xss')) {
    return [
      {
        description: '转义HTML特殊字符',
        fix: {
          range: params.position,
          text: 'escapeHtml(userInput)',
        },
      },
    ];
  }

  if (params.ruleId.includes('memory')) {
    return [
      {
        description: '组件卸载时移除监听器',
        fix: {
          range: params.position,
          text: 'useEffect(() => {\n  window.addEventListener("resize", handleResize);\n  return () => window.removeEventListener("resize", handleResize);\n}, []);',
        },
      },
    ];
  }

  return [];
}

export class CodeActionsProvider implements vscode.CodeActionProvider {
  private diagnosticsManager: DiagnosticsManager;

  constructor(diagnosticsManager: DiagnosticsManager) {
    this.diagnosticsManager = diagnosticsManager;
  }

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken
  ): Promise<vscode.CodeAction[]> {
    const codeActions: vscode.CodeAction[] = [];

    // 遍历当前上下文中的诊断信息
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'SafeScan') {
        continue;
      }

      try {
        // 获取修复建议
        const fixSuggestions = await getFixSuggestions({
          ruleId: diagnostic.code as string,
          document: document.getText(),
          position: {
            start: {
              line: diagnostic.range.start.line + 1,
              column: diagnostic.range.start.character + 1,
            },
            end: {
              line: diagnostic.range.end.line + 1,
              column: diagnostic.range.end.character + 1,
            },
          },
          filePath: document.uri.fsPath,
          fileType: document.languageId,
        });

        // 为每个修复建议创建代码操作
        fixSuggestions.forEach((suggestion, index) => {
          const title = `${index === 0 ? '[SafeScan] ' : ''}${suggestion.description}`;
          const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
          action.diagnostics = [diagnostic];

          // 创建工作区编辑
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            new vscode.Range(
              new vscode.Position(
                suggestion.fix.range.start.line - 1,
                suggestion.fix.range.start.column - 1
              ),
              new vscode.Position(
                suggestion.fix.range.end.line - 1,
                suggestion.fix.range.end.column - 1
              )
            ),
            suggestion.fix.text
          );

          action.edit = edit;
          action.isPreferred = index === 0; // 将第一个修复设为首选
          codeActions.push(action);
        });
      } catch (error) {
        console.error('获取修复建议失败:', error);
      }
    }

    return codeActions;
  }
}
