import * as vscode from 'vscode';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.statusBarItem.command = 'safescan.showIssuePanel';
    this.statusBarItem.show();
    context.subscriptions.push(this.statusBarItem);
    this.updateStatus(0);
  }

  /**
   * 显示正在扫描状态
   */
  showScanning(): void {
    this.statusBarItem.text = `$(sync~spin) SafeScan: 正在扫描...`;
    this.statusBarItem.tooltip = '正在进行安全扫描';
  }

  /**
   * 显示扫描结果
   * @param issuesCount 发现的问题数量
   */
  showResult(issuesCount: number): void {
    if (issuesCount === 0) {
      this.statusBarItem.text = `$(shield) SafeScan: 无问题`;
      this.statusBarItem.tooltip = '未发现安全问题';
    } else {
      this.statusBarItem.text = `$(alert) SafeScan: ${issuesCount} 个问题`;
      this.statusBarItem.tooltip = `发现 ${issuesCount} 个安全问题，点击查看详情`;
    }
  }

  /**
   * 更新状态栏状态
   * @param issuesCount 问题数量
   */
  updateStatus(issuesCount: number): void {
    this.showResult(issuesCount);
  }

  /**
   * 释放资源
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
