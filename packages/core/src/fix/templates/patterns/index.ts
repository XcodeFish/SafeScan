import { IFixTemplate } from '../../types';

/**
 * 加载代码模式修复模板
 * @returns 模板列表
 */
export function loadPatternTemplates(): IFixTemplate[] {
  return [
    // React Hooks依赖数组修复
    {
      id: 'pattern-react-hooks-deps',
      name: 'React Hooks-依赖数组修复',
      supportedRules: ['react-hooks/exhaustive-deps', 'dependency-array'],
      description: '修复React Hooks依赖数组缺失问题',
      tags: ['pattern', 'react', 'hooks'],
      fix: () => ({
        fixed: false,
        description: '需要实现依赖数组修复',
        changedLocations: [],
      }),
    },

    // 无限循环修复
    {
      id: 'pattern-infinite-loop',
      name: '无限循环修复',
      supportedRules: ['infinite-loop', 'no-unreachable-loop'],
      description: '修复潜在的无限循环问题',
      tags: ['pattern', 'critical', 'loop'],
      fix: () => ({
        fixed: false,
        description: '需要实现无限循环修复',
        changedLocations: [],
      }),
    },
  ];
}

export default loadPatternTemplates;
