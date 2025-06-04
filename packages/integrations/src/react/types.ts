/**
 * SafeScan React集成类型定义
 */

// React集成选项
export interface SafeScanReactOptions {
  // 是否启用DevTools集成
  enableDevTools?: boolean;
  // 钩子分析选项
  hooksOptions?: HooksAnalyzerOptions;
  // 生命周期监控选项
  lifecycleOptions?: LifecycleMonitorOptions;
  // DevTools集成选项
  devToolsOptions?: DevToolsIntegrationOptions;
  // 是否在开发模式下启用
  enabledInDevelopment?: boolean;
  // 是否追踪组件渲染
  trackRenders?: boolean;
  // 是否检查props变化
  checkPropChanges?: boolean;
  // 规则配置
  rules?: {
    // 是否禁用特定规则
    disabledRules?: string[];
    // 规则严重性配置
    severityOverrides?: Record<string, 'error' | 'warning' | 'info'>;
  };
  // 安全日志选项
  logging?: {
    // 日志级别
    level?: 'debug' | 'info' | 'warning' | 'error';
    // 是否在控制台输出
    console?: boolean;
    // 是否发送到远程服务
    remote?: boolean;
    // 远程服务URL
    remoteUrl?: string;
  };
}

/**
 * SafeScan React集成实例
 */
export interface SafeScanReactInstance {
  // React检测器
  inspector: ReactInspector;
  // Hooks分析器
  hooksAnalyzer: HooksAnalyzer;
  // 生命周期监控
  lifecycleMonitor: LifecycleMonitor;
  // DevTools集成
  devTools: DevToolsIntegration | null;
  // 清理方法
  cleanup: () => void;
}

// React检测器选项和返回值
export interface ReactInspectorOptions {
  // 是否在开发模式下启用
  enabledInDevelopment?: boolean;
  // 是否追踪组件渲染
  trackRenders?: boolean;
  // 是否检查props变化
  checkPropChanges?: boolean;
}

export interface ReactInspector {
  // 检查组件是否有安全问题
  inspectComponent: (component: any) => void;
  // 注册自定义检测器
  registerCustomInspector: (inspector: (component: any) => void) => void;
  // 清理资源
  cleanup: () => void;
}

// Hooks分析工具选项和返回值
export interface HooksAnalyzerOptions {
  // 是否检测useEffect依赖项
  checkEffectDependencies?: boolean;
  // 是否检测useMemo依赖项
  checkMemoDependencies?: boolean;
  // 是否检测useCallback依赖项
  checkCallbackDependencies?: boolean;
  // 是否检测useState初始化
  checkStateInitialization?: boolean;
  // 检测深度
  analysisDepth?: number;
}

export interface HooksAnalyzer {
  // 分析单个钩子使用情况
  analyzeHook: (hookType: string, args: any[], component: any) => void;
  // 获取钩子使用统计
  getHookUsageStats: () => HookUsageStats;
  // 清理资源
  cleanup: () => void;
}

export interface HookUsageStats {
  // 每种钩子类型的使用计数
  usageCount: Record<string, number>;
  // 检测到的问题
  issues: Array<{
    hookType: string;
    component: string;
    issueType: string;
    message: string;
    severity: 'error' | 'warning' | 'info';
    location?: {
      fileName: string;
      lineNumber: number;
    };
  }>;
}

// 生命周期监控选项和返回值
export interface LifecycleMonitorOptions {
  // 是否检测组件挂载
  trackMount?: boolean;
  // 是否检测组件更新
  trackUpdate?: boolean;
  // 是否检测组件卸载
  trackUnmount?: boolean;
  // 是否检测组件错误边界
  trackErrorBoundary?: boolean;
  // 是否记录生命周期持续时间
  measureDuration?: boolean;
}

export interface LifecycleMonitor {
  // 获取组件生命周期事件
  getLifecycleEvents: () => LifecycleEvent[];
  // 获取组件性能指标
  getPerformanceMetrics: () => ComponentPerformanceMetrics;
  // 注册生命周期回调
  onLifecycleEvent: (callback: (event: LifecycleEvent) => void) => void;
  // 清理资源
  cleanup: () => void;
}

export interface LifecycleEvent {
  // 组件ID
  componentId: string;
  // 组件名称
  componentName: string;
  // 事件类型
  eventType: 'mount' | 'update' | 'unmount' | 'error';
  // 事件时间戳
  timestamp: number;
  // 事件持续时间（如果有）
  duration?: number;
  // 相关数据
  data?: any;
}

export interface ComponentPerformanceMetrics {
  // 按组件ID分组的性能指标
  byComponent: Record<
    string,
    {
      // 组件名称
      name: string;
      // 渲染次数
      renderCount: number;
      // 平均渲染时间
      averageRenderTime: number;
      // 最大渲染时间
      maxRenderTime: number;
      // 更新历史
      updateHistory: Array<{
        timestamp: number;
        duration: number;
        reason?: string;
      }>;
    }
  >;
}

// DevTools集成选项和返回值
export interface DevToolsIntegrationOptions {
  // 是否在控制台显示安全问题
  showIssuesInConsole?: boolean;
  // 是否在组件上显示标记
  addComponentMarkers?: boolean;
  // 是否启用交互式修复
  enableInteractiveFixes?: boolean;
  // 自定义面板配置
  customPanel?: {
    enabled?: boolean;
    title?: string;
  };
}

export interface DevToolsIntegration {
  // 注册到DevTools
  register: () => void;
  // 显示安全问题
  showIssue: (issue: SecurityIssue) => void;
  // 清理资源
  cleanup: () => void;
}

export interface SecurityIssue {
  // 问题ID
  id: string;
  // 问题标题
  title: string;
  // 问题描述
  description: string;
  // 严重程度
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  // 问题类型
  type: 'xss' | 'memory-leak' | 'unsafe-resource' | 'prop-validation' | 'hook-misuse' | 'other';
  // 相关组件
  component?: string;
  // 问题位置
  location?: {
    fileName: string;
    lineNumber: number;
    columnNumber?: number;
  };
  // 修复建议
  remediation?: string;
  // 代码片段
  codeSnippet?: string;
}
