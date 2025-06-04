/**
 * React DevTools集成
 * 提供与React DevTools的集成，显示安全问题和性能建议
 */
import type { SecurityIssue } from '../../../core/types/security';
import type { DevToolsIntegration, DevToolsIntegrationOptions } from './types';

// 面板ID
const PANEL_ID = 'safescan-security-panel';

// 自定义样式
const PANEL_STYLES = `
.safescan-panel {
  padding: 12px;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}
.safescan-issue {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 4px;
  border-left: 4px solid #666;
}
.safescan-issue-critical {
  border-left-color: #e53935;
  background-color: rgba(229, 57, 53, 0.1);
}
.safescan-issue-high {
  border-left-color: #f57c00;
  background-color: rgba(245, 124, 0, 0.1);
}
.safescan-issue-medium {
  border-left-color: #fbc02d;
  background-color: rgba(251, 192, 45, 0.1);
}
.safescan-issue-low, .safescan-issue-info {
  border-left-color: #2196f3;
  background-color: rgba(33, 150, 243, 0.1);
}
.safescan-issue-title {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 8px;
}
.safescan-issue-description {
  font-size: 13px;
  margin-bottom: 8px;
}
.safescan-issue-component {
  font-size: 12px;
  margin-bottom: 8px;
  font-family: monospace;
}
.safescan-issue-remediation {
  font-size: 13px;
  background-color: rgba(255, 255, 255, 0.5);
  padding: 8px;
  border-radius: 4px;
  margin-top: 8px;
}
.safescan-code {
  background-color: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  overflow-x: auto;
  margin: 8px 0;
}
.safescan-button {
  background-color: #2196f3;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  margin-top: 8px;
}
.safescan-button:hover {
  background-color: #1976d2;
}
`;

/**
 * 设置DevTools集成
 */
export function setupDevToolsIntegration(
  options: DevToolsIntegrationOptions = {}
): DevToolsIntegration {
  // 存储安全问题
  const issues: SecurityIssue[] = [];

  // 是否已注册
  let isRegistered = false;

  // DevTools钩子
  let devToolsHook: any = null;

  // 自定义面板元素
  let panelElement: HTMLElement | null = null;

  // 获取DevTools钩子
  const getDevToolsHook = (): any => {
    if (typeof window !== 'undefined') {
      return (window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    }
    return null;
  };

  // 创建面板内容
  const createPanelContent = () => {
    if (!panelElement) return;

    // 清空面板
    panelElement.innerHTML = '';

    // 添加样式
    const styleElement = document.createElement('style');
    styleElement.textContent = PANEL_STYLES;
    panelElement.appendChild(styleElement);

    // 创建面板容器
    const container = document.createElement('div');
    container.className = 'safescan-panel';

    // 添加标题
    const title = document.createElement('h1');
    title.textContent = '安全扫描结果';
    title.style.fontSize = '16px';
    title.style.marginBottom = '16px';
    container.appendChild(title);

    if (issues.length === 0) {
      // 无安全问题
      const noIssues = document.createElement('p');
      noIssues.textContent = '未检测到安全问题 ✅';
      noIssues.style.color = '#43a047';
      container.appendChild(noIssues);
    } else {
      // 显示问题数量
      const summary = document.createElement('p');
      summary.textContent = `共检测到 ${issues.length} 个安全问题`;
      summary.style.marginBottom = '16px';
      container.appendChild(summary);

      // 添加每个问题
      issues.forEach((issue) => {
        const issueElement = document.createElement('div');
        issueElement.className = `safescan-issue safescan-issue-${issue.severity}`;

        // 标题
        const titleElement = document.createElement('div');
        titleElement.className = 'safescan-issue-title';
        titleElement.textContent = issue.title;
        issueElement.appendChild(titleElement);

        // 描述
        const descElement = document.createElement('div');
        descElement.className = 'safescan-issue-description';
        descElement.textContent = issue.description;
        issueElement.appendChild(descElement);

        // 组件
        if (issue.component) {
          const componentElement = document.createElement('div');
          componentElement.className = 'safescan-issue-component';
          componentElement.textContent = `组件: ${issue.component}`;
          issueElement.appendChild(componentElement);
        }

        // 代码片段
        if (issue.codeSnippet) {
          const codeElement = document.createElement('pre');
          codeElement.className = 'safescan-code';
          codeElement.textContent = issue.codeSnippet;
          issueElement.appendChild(codeElement);
        }

        // 修复建议
        if (issue.remediation) {
          const fixElement = document.createElement('div');
          fixElement.className = 'safescan-issue-remediation';
          fixElement.textContent = `修复建议: ${issue.remediation}`;
          issueElement.appendChild(fixElement);
        }

        // 交互式修复按钮
        if (options.enableInteractiveFixes && issue.remediation) {
          const fixButton = document.createElement('button');
          fixButton.className = 'safescan-button';
          fixButton.textContent = '应用修复';
          fixButton.onclick = () => {
            // 实际实现中应该调用自动修复功能
            console.log('应用修复:', issue.id);
            alert('自动修复功能正在开发中');
          };
          issueElement.appendChild(fixButton);
        }

        container.appendChild(issueElement);
      });
    }

    // 添加到面板
    panelElement.appendChild(container);
  };

  // 注册DevTools面板
  const registerPanel = () => {
    devToolsHook = getDevToolsHook();

    if (!devToolsHook || isRegistered) {
      return false;
    }

    // 创建面板元素
    panelElement = document.createElement('div');

    // 注册自定义面板
    if (devToolsHook.addPanel) {
      devToolsHook.addPanel({
        id: PANEL_ID,
        label: options.customPanel?.title || 'SafeScan安全',
        icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iIzYxREFGQiIgZD0iTTEyIDJBMTAgMTAgMCAwIDAgMiAxMmMwIDQuNDIgMi44NyA4LjE3IDYuODQgOS41LjUuMDguNjYtLjIzLjY2LS41di0xLjY5YzIuNzcuNiAzLjM3LTEuMSAzLjM3LTEuMS40My0uOTcuNzQtMS4xNy43NC0xLjE3Ljk3LS42Ni4wNy0uOTguMDctLjk4LTEuMDMtLjA3LS43MS0xLjA2LS43MS0xLjA2LjcyLTEuMiAxLjktLjg3IDEuOS0uODcuMjMuNjUuOTEgMS4wOC45MSAxLjA4LjggMS4zNyAyLjEgMS4wMiAyLjYxLjc4LjA4LS41OC4zMS0uOTcuNTctMS4xOS0yLS4yMi00LjEtMS0yLjczLTQuMzkgMC0uOTguMzMtMS40Mi43OC0xLjk3LS4wOS0uMTctLjM0LS45LjA3LTEuOSAwIDAgLjctLjIyIDIuMy44NSAxIDAtMiAuMTUtMyAuNS0uOTgtLjM1LTIuMDMtLjUyLTMuMDgtLjUycy0yLjEuMTctMy4wOC41MmMtMS42LTEuMDctMi4zLS44NS0yLjMtLjg1LS40MSAxLS4xNiAxLjczLS4wNyAxLjktLjQ1LjU1LS43OCAxLS43OCAxLjk3LTEuMzcgMy4zOC43MyA0LjE3IDIuNzMgNC4zOS0uMjYuMjItLjQ5LjYxLS41NyAxLjE5LS41Mi4xMi0xLjc2LjAzLTIuNTEtMS4wNiAwIDAtLjQ2LS43NC0xLjMyLS43OSAwIDAtLjg0LS4wMS0uMDYuNTMgMCAwIC41Ny4yNi45Ni42OSAwIDAgLjUyIDEuNTcgMi45NiAxLjA3di0xLjY5YzAtLjI4LjE2LS41OS42Ni0uNUMxOS4xNCAyMC4xNyAyMiAxNi40MiAyMiAxMkExMCAxMCAwIDAgMCAxMiAyeiIvPjwvc3ZnPg==',
        render: () => {
          return panelElement;
        },
      });

      // 初始化面板内容
      createPanelContent();

      isRegistered = true;
      return true;
    }

    return false;
  };

  // 在控制台显示问题
  const logIssueToConsole = (issue: SecurityIssue) => {
    if (!options.showIssuesInConsole) return;

    const prefix = '[SafeScan]';
    const message = `${issue.title}: ${issue.description}`;
    const component = issue.component ? `组件: ${issue.component}` : '';
    const location = issue.location
      ? `位置: ${issue.location.fileName}:${issue.location.lineNumber}`
      : '';
    const remediation = issue.remediation ? `修复建议: ${issue.remediation}` : '';

    switch (issue.severity) {
      case 'critical':
      case 'high':
        console.error(prefix, message, '\n', component, location, '\n', remediation);
        break;
      case 'medium':
        console.warn(prefix, message, '\n', component, location, '\n', remediation);
        break;
      default:
        console.info(prefix, message, '\n', component, location, '\n', remediation);
    }
  };

  // 添加组件标记
  const addComponentMarker = (issue: SecurityIssue) => {
    if (!options.addComponentMarkers || !issue.component || !devToolsHook) return;

    // 实际实现应该查找组件实例并添加标记
    // 这需要使用DevTools API，此处仅作示例
    console.log('为组件添加标记:', issue.component);
  };

  // 显示安全问题
  const showIssue = (issue: SecurityIssue) => {
    // 存储问题
    const existingIndex = issues.findIndex((i) => i.id === issue.id);
    if (existingIndex >= 0) {
      issues[existingIndex] = issue;
    } else {
      issues.push(issue);
    }

    // 在控制台显示
    logIssueToConsole(issue);

    // 添加组件标记
    addComponentMarker(issue);

    // 更新面板内容
    if (isRegistered && panelElement) {
      createPanelContent();
    }
  };

  // 注册到DevTools
  const register = () => {
    // 尝试注册面板
    if (!registerPanel()) {
      // 如果无法注册，设置轮询尝试
      let attempts = 0;
      const maxAttempts = 10;

      const attemptRegistration = () => {
        if (attempts < maxAttempts) {
          attempts++;

          if (!registerPanel()) {
            setTimeout(attemptRegistration, 1000);
          }
        }
      };

      // 开始尝试
      setTimeout(attemptRegistration, 1000);
    }
  };

  // 清理资源
  const cleanup = () => {
    // 移除面板
    if (isRegistered && devToolsHook && devToolsHook.removePanel) {
      devToolsHook.removePanel(PANEL_ID);
    }

    // 重置状态
    isRegistered = false;
    panelElement = null;
    issues.length = 0;
  };

  // 返回DevTools集成接口
  return {
    register,
    showIssue,
    cleanup,
  };
}
