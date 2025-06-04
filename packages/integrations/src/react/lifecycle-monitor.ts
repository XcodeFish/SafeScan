/**
 * React组件生命周期监控工具
 * 负责追踪React组件的生命周期事件和性能指标
 */
import type {
  LifecycleMonitor,
  LifecycleMonitorOptions,
  LifecycleEvent,
  ComponentPerformanceMetrics,
} from './types';

// 定义错误信息接口
interface ErrorInfo {
  componentStack: string;
}

// 生命周期事件回调函数
type LifecycleCallback = (event: LifecycleEvent) => void;

/**
 * 设置生命周期监控工具
 */
export function setupLifecycleMonitor(options: LifecycleMonitorOptions = {}): LifecycleMonitor {
  // 生命周期事件记录
  const lifecycleEvents: LifecycleEvent[] = [];

  // 注册的生命周期回调
  const lifecycleCallbacks: LifecycleCallback[] = [];

  // 组件性能数据
  const componentPerformance: Record<
    string,
    {
      name: string;
      renderCount: number;
      totalRenderTime: number;
      maxRenderTime: number;
      updateHistory: Array<{
        timestamp: number;
        duration: number;
        reason?: string;
      }>;
    }
  > = {};

  // 组件开始渲染时间记录
  const renderStartTimes = new Map<string, number>();

  // 原始React方法
  let originalCreateElement: ((...args: any[]) => any) | null = null;
  let originalComponent: any = null;

  // 记录生命周期事件
  const recordLifecycleEvent = (
    componentId: string,
    componentName: string,
    eventType: 'mount' | 'update' | 'unmount' | 'error',
    data?: any,
    duration?: number
  ) => {
    // 创建事件记录
    const event: LifecycleEvent = {
      componentId,
      componentName,
      eventType,
      timestamp: Date.now(),
      duration,
      data,
    };

    // 存储事件
    lifecycleEvents.push(event);

    // 调用回调
    lifecycleCallbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (err) {
        console.error('[SafeScan] 生命周期回调执行失败:', err);
      }
    });

    // 更新性能指标
    if (options.measureDuration !== false && (eventType === 'mount' || eventType === 'update')) {
      if (!componentPerformance[componentId]) {
        componentPerformance[componentId] = {
          name: componentName,
          renderCount: 0,
          totalRenderTime: 0,
          maxRenderTime: 0,
          updateHistory: [],
        };
      }

      const perfData = componentPerformance[componentId];

      // 更新计数和时间
      perfData.renderCount += 1;

      if (duration) {
        perfData.totalRenderTime += duration;
        perfData.maxRenderTime = Math.max(perfData.maxRenderTime, duration);

        // 记录更新历史
        perfData.updateHistory.push({
          timestamp: event.timestamp,
          duration,
          reason: data?.reason,
        });

        // 限制历史记录长度
        if (perfData.updateHistory.length > 100) {
          perfData.updateHistory = perfData.updateHistory.slice(-100);
        }
      }
    }
  };

  // 设置组件监控
  const setupComponentMonitoring = () => {
    try {
      // 尝试获取React
      const React = (window as any).React || require('react');

      if (React) {
        // 保存原始createElement方法
        if (React.createElement && !originalCreateElement) {
          originalCreateElement = React.createElement;

          // 重写createElement方法
          React.createElement = function (type: any, props: any, ...children: any[]) {
            // 调用原始方法
            const element = originalCreateElement.apply(this, [type, props, ...children]);

            // 如果是函数组件或类组件，添加监控
            if (typeof type === 'function' && element) {
              const componentName = type.displayName || type.name || 'AnonymousComponent';
              const componentId = type.toString();

              // 为元素添加ref以监控挂载/卸载
              if (
                (options.trackMount !== false || options.trackUnmount !== false) &&
                element.ref === undefined
              ) {
                const originalRef = props && props.ref;

                // 创建监控ref
                const monitorRef = (instance: any) => {
                  // 如果实例存在，表示组件已挂载
                  if (instance && options.trackMount !== false) {
                    recordLifecycleEvent(componentId, componentName, 'mount');
                  }
                  // 如果实例为null且之前存在，表示组件已卸载
                  else if (!instance && options.trackUnmount !== false) {
                    recordLifecycleEvent(componentId, componentName, 'unmount');
                  }

                  // 调用原始ref
                  if (originalRef) {
                    if (typeof originalRef === 'function') {
                      originalRef(instance);
                    } else if (Object.prototype.hasOwnProperty.call(originalRef, 'current')) {
                      originalRef.current = instance;
                    }
                  }
                };

                // 使用监控ref
                element.ref = monitorRef;
              }

              // 为类组件添加生命周期监控
              if (type.prototype && type.prototype.isReactComponent) {
                // 记录渲染时间
                if (options.measureDuration !== false) {
                  const originalRender = type.prototype.render;

                  if (originalRender && typeof originalRender === 'function') {
                    type.prototype.render = function (...args: any[]) {
                      // 记录开始时间
                      const startTime = performance.now();
                      renderStartTimes.set(componentId, startTime);

                      // 调用原始render方法
                      const result = originalRender.apply(this, args);

                      // 计算渲染时间
                      const endTime = performance.now();
                      const duration = endTime - startTime;

                      // 记录更新事件
                      if (options.trackUpdate !== false && this._reactInternalFiber) {
                        recordLifecycleEvent(
                          componentId,
                          componentName,
                          'update',
                          { updateType: 'render' },
                          duration
                        );
                      }

                      return result;
                    };
                  }
                }

                // 监控错误边界
                if (options.trackErrorBoundary !== false && type.prototype.componentDidCatch) {
                  const originalComponentDidCatch = type.prototype.componentDidCatch;

                  type.prototype.componentDidCatch = function (error: Error, info: ErrorInfo) {
                    // 记录错误事件
                    recordLifecycleEvent(componentId, componentName, 'error', {
                      error: error.message,
                      componentStack: info.componentStack,
                    });

                    // 调用原始方法
                    return originalComponentDidCatch.apply(this, [error, info]);
                  };
                }
              }
            }

            return element;
          };
        }

        // 监控React.Component
        if (React.Component && !originalComponent) {
          originalComponent = React.Component;

          // 创建代理Component类
          const MonitoredComponent = function (this: any, ...args: any[]) {
            originalComponent.apply(this, args);
          };

          // 复制原型和静态属性
          MonitoredComponent.prototype = originalComponent.prototype;
          Object.setPrototypeOf(MonitoredComponent, originalComponent);

          // 替换Component
          React.Component = MonitoredComponent;
        }
      }
    } catch (err) {
      console.error('[SafeScan] 无法设置组件生命周期监控:', err);
    }
  };

  // 在开发环境中设置组件监控
  if (process.env.NODE_ENV !== 'production') {
    setupComponentMonitoring();
  }

  // 获取所有生命周期事件
  const getLifecycleEvents = (): LifecycleEvent[] => {
    return [...lifecycleEvents];
  };

  // 获取组件性能指标
  const getPerformanceMetrics = (): ComponentPerformanceMetrics => {
    const metrics: ComponentPerformanceMetrics = {
      byComponent: {},
    };

    // 转换性能数据格式
    Object.keys(componentPerformance).forEach((componentId) => {
      const data = componentPerformance[componentId];

      metrics.byComponent[componentId] = {
        name: data.name,
        renderCount: data.renderCount,
        averageRenderTime: data.renderCount > 0 ? data.totalRenderTime / data.renderCount : 0,
        maxRenderTime: data.maxRenderTime,
        updateHistory: [...data.updateHistory],
      };
    });

    return metrics;
  };

  // 注册生命周期事件回调
  const onLifecycleEvent = (callback: LifecycleCallback) => {
    if (typeof callback === 'function' && !lifecycleCallbacks.includes(callback)) {
      lifecycleCallbacks.push(callback);
    }
  };

  // 清理资源
  const cleanup = () => {
    // 恢复原始React方法
    try {
      const React = (window as any).React || require('react');

      if (React) {
        // 恢复createElement
        if (originalCreateElement && React.createElement !== originalCreateElement) {
          React.createElement = originalCreateElement;
        }

        // 恢复Component
        if (originalComponent && React.Component !== originalComponent) {
          React.Component = originalComponent;
        }
      }
    } catch (err) {
      console.error('[SafeScan] 无法恢复React方法:', err);
    }

    // 清空事件记录
    lifecycleEvents.length = 0;

    // 清空回调
    lifecycleCallbacks.length = 0;

    // 清空性能数据
    Object.keys(componentPerformance).forEach((key) => {
      delete componentPerformance[key];
    });

    // 清空渲染时间记录
    renderStartTimes.clear();
  };

  // 返回生命周期监控接口
  return {
    getLifecycleEvents,
    getPerformanceMetrics,
    onLifecycleEvent,
    cleanup,
  };
}
