/**
 * React Hooks分析工具
 * 负责分析React Hooks的使用情况，检测潜在问题
 */
import { SecurityIssue } from '../../../core/types/security';
import type { HooksAnalyzer, HooksAnalyzerOptions, HookUsageStats } from './types';

// 钩子使用信息
interface HookUsage {
  hookType: string;
  component: string;
  componentId: string;
  args: any[];
  calledAt: number;
  location?: {
    fileName: string;
    lineNumber: number;
  };
}

/**
 * 设置Hooks分析工具
 */
export function setupHooksAnalyzer(options: HooksAnalyzerOptions = {}): HooksAnalyzer {
  // 存储钩子使用记录
  const hookUsages: HookUsage[] = [];

  // 存储检测到的问题
  const hookIssues: Array<SecurityIssue & { hookType: string; component: string }> = [];

  // 已处理的组件
  let processedComponents = new WeakMap<object, Record<string, number>>();

  // 钩子使用计数
  const usageCount: Record<string, number> = {};

  // 原始React Hooks方法
  const originalHooks: Record<string, (...args: any[]) => any> = {};

  // 检测钩子依赖项
  const checkDependencies = (hookType: string, dependencies: any[] | undefined, component: any) => {
    if (!dependencies) return;

    const componentName = component.displayName || component.name || 'AnonymousComponent';

    // 检查空数组依赖
    if (dependencies.length === 0 && hookType === 'useEffect') {
      hookIssues.push({
        id: `hooks-empty-deps-${Date.now()}`,
        hookType,
        component: componentName,
        title: '使用空依赖数组的useEffect',
        description: '仅在组件挂载和卸载时执行的useEffect应考虑移至更适合的生命周期方法',
        severity: 'info',
        type: 'hook-misuse',
        remediation: '确认是否需要在组件挂载/卸载时执行此效果，或考虑使用React.useLayoutEffect',
      });
    }

    // 检查缺失依赖
    const potentialMissingDeps: string[] = [];

    // 简单的静态分析检测潜在的缺失依赖
    // 实际实现应该更复杂，这里只是示例
    dependencies.forEach((dep) => {
      if (typeof dep === 'function' && !dep.name) {
        potentialMissingDeps.push('匿名函数');
      }
    });

    if (potentialMissingDeps.length > 0) {
      hookIssues.push({
        id: `hooks-missing-deps-${Date.now()}`,
        hookType,
        component: componentName,
        title: `${hookType} 可能存在缺失依赖`,
        description: `检测到可能缺失的依赖项: ${potentialMissingDeps.join(', ')}`,
        severity: 'medium',
        type: 'hook-misuse',
        remediation: '添加所有使用的变量到依赖数组中，或使用useCallback/useMemo包装函数和对象',
      });
    }
  };

  // 检测React钩子问题
  const analyzeHook = (hookType: string, args: any[], component: any) => {
    // 记录使用情况
    usageCount[hookType] = (usageCount[hookType] || 0) + 1;

    const componentName = component.displayName || component.name || 'AnonymousComponent';
    const componentId = component.toString();

    // 保存钩子使用记录
    hookUsages.push({
      hookType,
      component: componentName,
      componentId,
      args,
      calledAt: Date.now(),
    });

    // 根据钩子类型进行特定检查
    switch (hookType) {
      case 'useState': {
        // 检查useState初始化
        if (options.checkStateInitialization !== false) {
          const initialState = args[0];
          if (typeof initialState === 'function' && !initialState.name) {
            hookIssues.push({
              id: `hooks-anon-init-${Date.now()}`,
              hookType,
              component: componentName,
              title: 'useState使用匿名初始化函数',
              description: '使用匿名函数初始化状态可能导致每次渲染都创建新函数',
              severity: 'info',
              type: 'hook-misuse',
              remediation: '命名初始化函数或使用useCallback包装',
            });
          }
        }
        break;
      }

      case 'useEffect':
      case 'useMemo':
      case 'useCallback': {
        // 检查依赖项
        const dependencies = args[1];

        if (
          (hookType === 'useEffect' && options.checkEffectDependencies !== false) ||
          (hookType === 'useMemo' && options.checkMemoDependencies !== false) ||
          (hookType === 'useCallback' && options.checkCallbackDependencies !== false)
        ) {
          checkDependencies(hookType, dependencies, component);
        }

        break;
      }

      case 'useRef': {
        // 检查useRef初始值是否为复杂对象
        const initialValue = args[0];
        if (initialValue && typeof initialValue === 'object' && !Array.isArray(initialValue)) {
          hookIssues.push({
            id: `hooks-complex-ref-${Date.now()}`,
            hookType,
            component: componentName,
            title: 'useRef使用复杂对象作为初始值',
            description: '使用复杂对象作为useRef初始值可能导致不必要的内存消耗',
            severity: 'info',
            type: 'memory-leak',
            remediation: '考虑使用useState存储复杂对象，或在useRef后设置复杂对象值',
          });
        }
        break;
      }
    }

    // 监视组件是否有异常钩子使用模式
    if (!processedComponents.has(component)) {
      const hookTypesInComponent = hookUsages
        .filter((usage) => usage.componentId === componentId)
        .map((usage) => usage.hookType);

      // 检查条件钩子使用
      // 在实际实现中需要更复杂的分析，这里仅作示例
      const hookCounts: Record<string, number> = {};
      hookTypesInComponent.forEach((type) => {
        hookCounts[type] = (hookCounts[type] || 0) + 1;
      });

      processedComponents.set(component, hookCounts);
    }
  };

  // 设置React钩子监控
  const setupHooksMonitoring = () => {
    try {
      // 尝试获取React
      const React = (window as any).React || require('react');

      if (React) {
        // 保存原始钩子方法
        const hookTypes = [
          'useState',
          'useEffect',
          'useContext',
          'useReducer',
          'useCallback',
          'useMemo',
          'useRef',
          'useImperativeHandle',
          'useLayoutEffect',
          'useDebugValue',
        ];

        hookTypes.forEach((hookType) => {
          if (React[hookType] && typeof React[hookType] === 'function') {
            originalHooks[hookType] = React[hookType];

            // 重写钩子方法
            React[hookType] = function (...args: any[]) {
              // 获取调用组件
              let component = null;

              // 尝试从调用栈获取组件信息
              // 实际实现需要更复杂的逻辑
              const err = new Error();
              const stack = err.stack || '';
              const stackLines = stack.split('\n');

              for (const line of stackLines) {
                if (line.includes('Component') || line.includes('component')) {
                  component = { name: line.trim() };
                  break;
                }
              }

              // 如果找不到组件信息，使用通用名称
              if (!component) {
                component = { name: 'UnknownComponent' };
              }

              // 分析钩子使用
              setTimeout(() => analyzeHook(hookType, args, component), 0);

              // 调用原始钩子方法
              return originalHooks[hookType].apply(this, args);
            };
          }
        });
      }
    } catch (err) {
      console.error('[SafeScan] 无法设置Hooks监控:', err);
    }
  };

  // 在开发环境中设置钩子监控
  if (process.env.NODE_ENV !== 'production') {
    setupHooksMonitoring();
  }

  // 获取钩子使用统计
  const getHookUsageStats = (): HookUsageStats => {
    return {
      usageCount,
      issues: hookIssues.map((issue) => ({
        hookType: issue.hookType,
        component: issue.component,
        issueType: issue.type,
        message: `${issue.title}: ${issue.description}`,
        severity:
          issue.severity === 'critical' || issue.severity === 'high'
            ? 'error'
            : issue.severity === 'medium'
              ? 'warning'
              : 'info',
        location: issue.location,
      })),
    };
  };

  // 清理资源
  const cleanup = () => {
    // 恢复原始钩子方法
    try {
      const React = (window as any).React || require('react');

      if (React) {
        Object.keys(originalHooks).forEach((hookType) => {
          if (React[hookType] !== originalHooks[hookType]) {
            React[hookType] = originalHooks[hookType];
          }
        });
      }
    } catch (err) {
      console.error('[SafeScan] 无法恢复Hooks方法:', err);
    }

    // 清空记录
    hookUsages.length = 0;
    hookIssues.length = 0;

    // 重置WeakMap(无clear方法)
    processedComponents = new WeakMap<object, Record<string, number>>();

    // 重置使用计数
    Object.keys(usageCount).forEach((key) => {
      usageCount[key] = 0;
    });
  };

  // 返回钩子分析工具接口
  return {
    analyzeHook,
    getHookUsageStats,
    cleanup,
  };
}
