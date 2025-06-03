import { IFixTemplate } from '../../types';

/**
 * 加载性能相关修复模板
 * @returns 模板列表
 */
export function loadPerformanceTemplates(): IFixTemplate[] {
  return [
    // React Hooks内存泄漏修复
    {
      id: 'performance-memoryleak-cleanup',
      name: '内存泄漏-资源清理',
      supportedRules: [
        'memory-leak',
        'performance/no-uncleared-timers',
        'react-hooks/exhaustive-deps',
      ],
      description: '修复React组件中的内存泄漏问题',
      tags: ['performance', 'memory-leak', 'react'],
      fix: () => ({
        fixed: false,
        description: '需要实现内存泄漏修复',
        changedLocations: [],
      }),
    },

    // React组件优化修复
    {
      id: 'performance-react-memo',
      name: 'React性能-组件缓存',
      supportedRules: ['performance/unnecessary-rerender', 'react/no-unstable-nested-components'],
      description: '使用React.memo优化组件重渲染',
      tags: ['performance', 'react', 'optimization'],
      fix: () => ({
        fixed: false,
        description: '需要实现React.memo优化',
        changedLocations: [],
      }),
    },
  ];
}

export default loadPerformanceTemplates;
