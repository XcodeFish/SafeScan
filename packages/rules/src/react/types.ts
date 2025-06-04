/**
 * React规则相关类型定义
 */

/**
 * React组件类型
 * 适用于函数组件和类组件
 */
export interface ReactComponent {
  displayName?: string;
  name?: string;
  prototype?: {
    isReactComponent?: boolean;
    isPureReactComponent?: boolean;
    render?: () => unknown;
    componentDidMount?: () => void;
    componentDidUpdate?: () => void;
    componentWillUnmount?: () => void;
    [key: string]: unknown;
  };
  // 函数组件
  [key: string]: unknown;
}
