/**
 * 大型依赖检测规则
 * 检测代码中引入的大型依赖，这些依赖可能导致应用体积增大、加载时间变长
 */
import {
  IRule,
  RuleCategory,
  RuleSeverity,
  Framework,
  TAST,
  TRuleContext,
  TRuleResult,
  TCodeLocation,
} from '../../../core/src/types';

// 预定义的大型依赖列表及其替代方案
const LARGE_DEPENDENCIES = [
  {
    name: 'moment',
    size: '~300KB',
    alternative: 'date-fns (~20KB) 或 dayjs (~2KB)',
  },
  {
    name: 'lodash',
    size: '~70KB',
    alternative: '按需导入 lodash/xxx 或使用 lodash-es',
  },
  {
    name: 'jquery',
    size: '~85KB',
    alternative: '现代框架内置DOM操作或原生DOM API',
  },
  {
    name: 'chart.js',
    size: '~170KB',
    alternative: 'lightweight-charts 或按需构建',
  },
  {
    name: 'material-ui',
    size: '~300KB+',
    alternative: '按需导入组件',
  },
  {
    name: 'antd',
    size: '~500KB+',
    alternative: '按需导入组件',
  },
  {
    name: 'bootstrap',
    size: '~150KB',
    alternative: '仅导入必要的组件或样式',
  },
];

// 检测全量导入大型依赖
function checkLargeDependencyImports(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      traverseImportDeclarations(ast, (importDecl, location) => {
        const importSource = getImportSource(importDecl);

        if (!importSource) return;

        // 检查是否是直接导入大型依赖
        const largeDep = LARGE_DEPENDENCIES.find(
          (dep) => importSource === dep.name || importSource.startsWith(`${dep.name}/`)
        );

        if (largeDep) {
          // 检查是否是全量导入而非按需导入
          const isFullImport = isFullDependencyImport(importDecl, largeDep.name);

          if (isFullImport) {
            results.push({
              ruleId: 'performance/large-dependency-import',
              message: `检测到全量导入大型依赖 ${largeDep.name}（约${largeDep.size}），可能导致应用体积增大`,
              severity: RuleSeverity.HIGH,
              location,
              codeSnippet: context.fileContent.substring(
                Math.max(0, location.startColumn - 10),
                Math.min(context.fileContent.length, location.endColumn + 10)
              ),
              fixSuggestion: `考虑使用按需导入或替代方案: ${largeDep.alternative}`,
              fixable: false,
            });
          }
        }
      });
    }
  } catch (error) {
    console.error('检测大型依赖导入时出错:', error);
  }

  return results;
}

// 检测webpack bundle中的大型依赖
function checkBundleDependencies(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    // 检查webpack配置文件
    if (context.filePath.includes('webpack.config') && ast.type === 'Module') {
      traverseObjectProperties(ast, (prop, location) => {
        if (prop.key && (prop.key.name === 'externals' || prop.key.value === 'externals')) {
          const hasExternals = checkExternalsConfiguration(prop.value);

          if (!hasExternals) {
            // 注意：此检查仅适用于包含webpack配置的文件
            results.push({
              ruleId: 'performance/missing-externals',
              message: '未检测到webpack externals配置，大型依赖可能会被打包进bundle',
              severity: RuleSeverity.MEDIUM,
              location,
              codeSnippet: context.fileContent.substring(
                Math.max(0, location.startColumn - 10),
                Math.min(context.fileContent.length, location.endColumn + 10)
              ),
              fixSuggestion: '考虑使用externals配置将大型依赖排除在bundle外，通过CDN引入',
              fixable: false,
            });
          }
        }
      });
    }
  } catch (error) {
    console.error('检测bundle依赖时出错:', error);
  }

  return results;
}

// 检测重复依赖导入
function checkDuplicateDependencies(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];
  const importMap = new Map<string, { count: number; locations: TCodeLocation[] }>();

  try {
    if (ast.type === 'Module') {
      traverseImportDeclarations(ast, (importDecl, location) => {
        const importSource = getImportSource(importDecl);

        if (!importSource) return;

        // 记录每个依赖的导入次数和位置
        if (!importMap.has(importSource)) {
          importMap.set(importSource, { count: 1, locations: [location] });
        } else {
          const record = importMap.get(importSource)!;
          record.count++;
          record.locations.push(location);
        }
      });

      // 检查是否有重复导入
      // 修复：使用Array.from转换Map.entries()为数组以避免迭代器兼容性问题
      Array.from(importMap.entries()).forEach(([dependency, record]) => {
        if (record.count > 1) {
          results.push({
            ruleId: 'performance/duplicate-imports',
            message: `检测到对 ${dependency} 的多次导入（${record.count}次），可能导致代码体积增加`,
            severity: RuleSeverity.MEDIUM,
            location: record.locations[0],
            codeSnippet: context.fileContent.substring(
              Math.max(0, record.locations[0].startColumn - 10),
              Math.min(context.fileContent.length, record.locations[0].endColumn + 10)
            ),
            fixSuggestion: '合并多次导入为单个import语句',
            fixable: true,
          });
        }
      });
    }
  } catch (error) {
    console.error('检测重复依赖导入时出错:', error);
  }

  return results;
}

// 辅助函数：遍历导入声明
function traverseImportDeclarations(
  node: any,
  callback: (importDecl: any, location: TCodeLocation) => void
) {
  if (!node) return;

  if (node.type === 'ImportDeclaration' && node.span) {
    callback(node, {
      filePath: 'current-file', // 实际中应从context获取
      startLine: node.span.start.line,
      startColumn: node.span.start.column,
      endLine: node.span.end.line,
      endColumn: node.span.end.column,
    });
  }

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseImportDeclarations(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseImportDeclarations(item, callback);
        }
      }
    }
  }
}

// 辅助函数：遍历对象属性
function traverseObjectProperties(
  node: any,
  callback: (prop: any, location: TCodeLocation) => void
) {
  if (!node) return;

  if (node.type === 'ObjectProperty' && node.span) {
    callback(node, {
      filePath: 'current-file', // 实际中应从context获取
      startLine: node.span.start.line,
      startColumn: node.span.start.column,
      endLine: node.span.end.line,
      endColumn: node.span.end.column,
    });
  }

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseObjectProperties(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseObjectProperties(item, callback);
        }
      }
    }
  }
}

// 辅助函数：获取导入源
function getImportSource(importDecl: any): string {
  if (importDecl && importDecl.source && (importDecl.source.value || importDecl.source.raw)) {
    const source = importDecl.source.value || importDecl.source.raw;
    // 去除引号
    return source.replace(/['"]/g, '');
  }
  return '';
}

// 辅助函数：检查是否是全量导入
function isFullDependencyImport(importDecl: any, depName: string): boolean {
  // 检查是否是直接导入整个依赖
  const importSource = getImportSource(importDecl);
  if (importSource === depName) {
    return true;
  }

  // 检查是否是导入依赖的主模块
  if (importDecl.specifiers) {
    // 存在default导入且不是按路径导入子模块
    const hasDefaultImport = importDecl.specifiers.some(
      (spec: any) => spec.type === 'ImportDefaultSpecifier'
    );

    return hasDefaultImport && importSource === depName;
  }

  return false;
}

// 辅助函数：检查externals配置
function checkExternalsConfiguration(value: any): boolean {
  if (!value) return false;

  // 检查externals是否包含常见大型依赖
  if (value.type === 'ObjectExpression' && value.properties) {
    return value.properties.some((prop: any) => {
      const key = prop.key && (prop.key.name || prop.key.value);
      return key && LARGE_DEPENDENCIES.some((dep) => key.includes(dep.name));
    });
  } else if (value.type === 'ArrayExpression' && value.elements) {
    return value.elements.some((el: any) => {
      const val = el && (el.name || el.value);
      return val && LARGE_DEPENDENCIES.some((dep) => val.includes(dep.name));
    });
  }

  return false;
}

// 导出规则定义
const largeDependenciesRule: IRule = {
  id: 'performance/large-dependencies',
  name: '大型依赖检测',
  description: '检测代码中使用的大型依赖，提供优化建议以减小应用体积',
  category: RuleCategory.PERFORMANCE,
  severity: RuleSeverity.HIGH,
  frameworks: [Framework.REACT, Framework.VUE, Framework.ANGULAR, Framework.VANILLA],

  // 规则检测函数
  detect: (ast: TAST, context: TRuleContext): TRuleResult[] => {
    // 组合所有检测结果
    return [
      ...checkLargeDependencyImports(ast, context),
      ...checkBundleDependencies(ast, context),
      ...checkDuplicateDependencies(ast, context),
    ];
  },
};

export default largeDependenciesRule;
