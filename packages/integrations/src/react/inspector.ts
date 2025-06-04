/**
 * React组件检测器
 * 负责扫描React组件是否存在安全问题
 */
import { getRuleManager } from '../../../rules/src/react';
import type { ReactInspector, ReactInspectorOptions, SecurityIssue } from './types';

// 自定义检测器类型
type CustomInspector = (component: any) => void;

/**
 * 初始化React检测器
 */
export function initReactInspector(options: ReactInspectorOptions = {}): ReactInspector {
  // 获取React规则管理器
  const ruleManager = getRuleManager();

  // 存储自定义检测器
  const customInspectors: CustomInspector[] = [];

  // 检测到的安全问题
  const securityIssues: SecurityIssue[] = [];

  // 已检测的组件集合
  const inspectedComponents = new WeakSet();

  // 原始React创建元素方法
  // 原始React创建元素方法
  let originalCreateElement: ((type: any, props: any, ...children: any[]) => any) | null = null;

  // 检测单个组件
  const inspectComponent = (component: any) => {
    if (!component || inspectedComponents.has(component)) {
      return;
    }

    try {
      // 标记组件已检测
      inspectedComponents.add(component);

      // 获取组件名称
      const componentName = component.displayName || component.name || 'AnonymousComponent';

      // 执行内置规则检测
      const issues = ruleManager.checkComponent(component);

      // 添加检测到的问题
      if (issues && issues.length > 0) {
        securityIssues.push(...issues);

        // 在开发环境中输出警告
        if (process.env.NODE_ENV !== 'production') {
          issues.forEach((issue) => {
            const prefix = `[SafeScan] 检测到组件 "${componentName}" 存在安全问题:`;
            const message = `${issue.title} - ${issue.description}`;

            switch (issue.severity) {
              case 'critical':
              case 'high':
                console.error(prefix, message);
                break;
              case 'medium':
                console.warn(prefix, message);
                break;
              default:
                console.info(prefix, message);
            }
          });
        }
      }

      // 执行自定义检测器
      customInspectors.forEach((inspector) => {
        try {
          inspector(component);
        } catch (err) {
          console.error('[SafeScan] 自定义检测器执行失败:', err);
        }
      });
    } catch (err) {
      console.error('[SafeScan] 组件检测失败:', err);
    }
  };

  // 启动React元素钩子
  const setupReactHook = () => {
    try {
      // 尝试获取React
      const React = (window as any).React || require('react');
      if (React && React.createElement && !originalCreateElement) {
        // 保存原始方法
        originalCreateElement = React.createElement;

        // 重写createElement方法以捕获组件创建
        React.createElement = function (type: any, props: any, ...children: any[]) {
          // 调用原始方法创建元素
          const element = originalCreateElement.apply(this, [type, props, ...children]);

          // 如果是函数组件或类组件，进行检测
          if (typeof type === 'function') {
            setTimeout(() => inspectComponent(type), 0);
          }

          return element;
        };
      }
    } catch (err) {
      console.error('[SafeScan] 无法设置React钩子:', err);
    }
  };

  // 在开发环境中设置钩子
  if (options.enabledInDevelopment !== false && process.env.NODE_ENV !== 'production') {
    setupReactHook();
  }

  // 返回React检测器接口
  return {
    inspectComponent,

    registerCustomInspector: (inspector: CustomInspector) => {
      if (typeof inspector === 'function' && !customInspectors.includes(inspector)) {
        customInspectors.push(inspector);
      }
    },

    cleanup: () => {
      // 恢复原始React createElement方法
      if (originalCreateElement) {
        try {
          const React = (window as any).React || require('react');
          if (React && React.createElement !== originalCreateElement) {
            React.createElement = originalCreateElement;
          }
        } catch (err) {
          console.error('[SafeScan] 无法恢复React钩子:', err);
        }
        originalCreateElement = null;
      }

      // 清空自定义检测器
      customInspectors.length = 0;
    },
  };
}
