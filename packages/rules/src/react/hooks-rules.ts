/**
 * React Hooks 规则检测
 * 检测React Hooks使用中的常见错误和最佳实践
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

// React Hooks名称列表
const REACT_HOOKS = [
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

// 检测Hooks调用顺序问题
function checkHooksCallOrder(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      // 检查条件Hook调用
      checkConditionalHookCalls(ast, context, results);

      // 检查循环中的Hook调用
      checkLoopHookCalls(ast, context, results);
    }
  } catch (error) {
    console.error('检测Hooks调用顺序时出错:', error);
  }

  return results;
}

// 检测依赖数组问题
function checkDependencyArray(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      // 查找useEffect, useCallback, useMemo等Hook调用
      traverseHookCalls(ast, (hookCall, hookName, location) => {
        if (['useEffect', 'useCallback', 'useMemo', 'useLayoutEffect'].includes(hookName)) {
          // 检查依赖数组
          if (hookCall.arguments && hookCall.arguments.length > 1) {
            const depsArg = hookCall.arguments[1];

            // 检查空数组依赖
            if (isEmptyDependencyArray(depsArg)) {
              // 确认回调中是否引用了外部变量
              const callbackArg = hookCall.arguments[0];
              const referencedVars = getReferencedVariables(callbackArg);

              if (referencedVars.length > 0) {
                results.push({
                  ruleId: 'react/hooks/incomplete-deps',
                  message: `${hookName}依赖数组为空，但回调中引用了外部变量(${referencedVars.join(', ')})，可能导致过期闭包问题`,
                  severity: RuleSeverity.HIGH,
                  location,
                  codeSnippet: context.fileContent.substring(
                    Math.max(0, location.startColumn - 10),
                    Math.min(context.fileContent.length, location.endColumn + 30)
                  ),
                  fixSuggestion: `添加回调中使用的外部变量到依赖数组: [${referencedVars.join(', ')}]`,
                  fixable: true,
                });
              }
            }

            // 检查依赖数组中是否有对象字面量
            if (hasObjectLiteralInDependencyArray(depsArg)) {
              results.push({
                ruleId: 'react/hooks/object-deps',
                message: `${hookName}依赖数组中包含对象字面量，每次渲染都会创建新引用导致无限重渲染`,
                severity: RuleSeverity.HIGH,
                location,
                codeSnippet: context.fileContent.substring(
                  Math.max(0, location.startColumn - 10),
                  Math.min(context.fileContent.length, location.endColumn + 30)
                ),
                fixSuggestion: '将对象提取到组件外部或使用useMemo缓存对象',
                fixable: false,
              });
            }

            // 检查缺失的依赖项
            const callbackArg = hookCall.arguments[0];
            const missingDeps = findMissingDependencies(callbackArg, depsArg);
            if (missingDeps.length > 0) {
              results.push({
                ruleId: 'react/hooks/missing-deps',
                message: `${hookName}依赖数组中缺少以下依赖项: ${missingDeps.join(', ')}`,
                severity: RuleSeverity.MEDIUM,
                location,
                codeSnippet: context.fileContent.substring(
                  Math.max(0, location.startColumn - 10),
                  Math.min(context.fileContent.length, location.endColumn + 30)
                ),
                fixSuggestion: `添加${missingDeps.join(', ')}到依赖数组中`,
                fixable: true,
              });
            }
          }
        }
      });
    }
  } catch (error) {
    console.error('检测依赖数组时出错:', error);
  }

  return results;
}

// 检测useState的初始化问题
function checkUseStateInitialization(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      traverseHookCalls(ast, (hookCall, hookName, location) => {
        if (hookName === 'useState') {
          // 检查是否使用函数初始化复杂计算
          if (hookCall.arguments && hookCall.arguments.length > 0) {
            const initialState = hookCall.arguments[0];

            // 检查是否直接传入复杂表达式而非函数形式
            if (isExpensiveInitialState(initialState)) {
              results.push({
                ruleId: 'react/hooks/expensive-init-state',
                message: 'useState直接使用复杂表达式初始化状态，而非惰性初始化函数形式',
                severity: RuleSeverity.MEDIUM,
                location,
                codeSnippet: context.fileContent.substring(
                  Math.max(0, location.startColumn - 10),
                  Math.min(context.fileContent.length, location.endColumn + 30)
                ),
                fixSuggestion: '使用函数形式初始化: useState(() => expensiveComputation())',
                fixable: true,
              });
            }
          }
        }
      });
    }
  } catch (error) {
    console.error('检测useState初始化时出错:', error);
  }

  return results;
}

// 检测自定义Hook命名规范
function checkCustomHookNaming(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      traverseFunctionDeclarations(ast, (func, location) => {
        // 检查函数名是否以use开头但不符合自定义Hook要求
        const funcName = func.id && (func.id.value || func.id.name);

        if (
          funcName &&
          funcName.startsWith('use') &&
          funcName[3] &&
          funcName[3] === funcName[3].toUpperCase()
        ) {
          // 检查函数内是否使用了React Hooks
          const usesHooks = checkIfFunctionUsesHooks(func);

          if (!usesHooks) {
            results.push({
              ruleId: 'react/hooks/invalid-hook-name',
              message: `函数${funcName}使用了Hook命名规范，但内部没有使用React Hooks`,
              severity: RuleSeverity.MEDIUM,
              location,
              codeSnippet: context.fileContent.substring(
                Math.max(0, location.startColumn - 10),
                Math.min(context.fileContent.length, location.endColumn + 30)
              ),
              fixSuggestion:
                '如果不是自定义Hook，函数名不应以"use"开头；如果是自定义Hook，应在内部使用至少一个React Hook',
              fixable: false,
            });
          }
        }
      });
    }
  } catch (error) {
    console.error('检测自定义Hook命名时出错:', error);
  }

  return results;
}

// 辅助函数：检查条件Hook调用
function checkConditionalHookCalls(ast: any, context: TRuleContext, results: TRuleResult[]) {
  traverseConditionalBlocks(ast, (block, location) => {
    // 在条件块中查找Hook调用
    const hookCalls = findHookCallsInBlock(block);

    if (hookCalls.length > 0) {
      for (const hookCall of hookCalls) {
        results.push({
          ruleId: 'react/hooks/conditional-hook',
          message: `${hookCall}在条件语句中调用，违反Hooks调用顺序规则`,
          severity: RuleSeverity.CRITICAL,
          location,
          codeSnippet: context.fileContent.substring(
            Math.max(0, location.startColumn - 10),
            Math.min(context.fileContent.length, location.endColumn + 30)
          ),
          fixSuggestion: '将Hook调用移出条件语句，使用条件语句控制Hook内部逻辑',
          fixable: false,
        });
      }
    }
  });
}

// 辅助函数：检查循环中的Hook调用
function checkLoopHookCalls(ast: any, context: TRuleContext, results: TRuleResult[]) {
  traverseLoopBlocks(ast, (block, location) => {
    // 在循环块中查找Hook调用
    const hookCalls = findHookCallsInBlock(block);

    if (hookCalls.length > 0) {
      for (const hookCall of hookCalls) {
        results.push({
          ruleId: 'react/hooks/loop-hook',
          message: `${hookCall}在循环语句中调用，违反Hooks调用顺序规则`,
          severity: RuleSeverity.CRITICAL,
          location,
          codeSnippet: context.fileContent.substring(
            Math.max(0, location.startColumn - 10),
            Math.min(context.fileContent.length, location.endColumn + 30)
          ),
          fixSuggestion: '将Hook调用移出循环语句，在组件顶层调用',
          fixable: false,
        });
      }
    }
  });
}

// 辅助函数：遍历Hook调用
function traverseHookCalls(
  node: any,
  callback: (call: any, hookName: string, location: TCodeLocation) => void
) {
  if (!node) return;

  // 检查函数调用表达式
  if (
    node.type === 'CallExpression' &&
    node.callee &&
    node.callee.type === 'Identifier' &&
    node.span
  ) {
    const hookName = node.callee.value || node.callee.name;

    // 检查是否是React Hook调用
    if (hookName && REACT_HOOKS.includes(hookName)) {
      callback(node, hookName, {
        filePath: 'current-file',
        startLine: node.span.start.line,
        startColumn: node.span.start.column,
        endLine: node.span.end.line,
        endColumn: node.span.end.column,
      });
    }
  }

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseHookCalls(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseHookCalls(item, callback);
        }
      }
    }
  }
}

// 辅助函数：遍历条件块
function traverseConditionalBlocks(
  node: any,
  callback: (block: any, location: TCodeLocation) => void
) {
  if (!node) return;

  // 检查if语句
  if (
    (node.type === 'IfStatement' ||
      node.type === 'ConditionalExpression' ||
      node.type === 'LogicalExpression') &&
    node.span
  ) {
    callback(node, {
      filePath: 'current-file',
      startLine: node.span.start.line,
      startColumn: node.span.start.column,
      endLine: node.span.end.line,
      endColumn: node.span.end.column,
    });
  }

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseConditionalBlocks(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseConditionalBlocks(item, callback);
        }
      }
    }
  }
}

// 辅助函数：遍历循环块
function traverseLoopBlocks(node: any, callback: (block: any, location: TCodeLocation) => void) {
  if (!node) return;

  // 检查循环语句
  if (
    (node.type === 'ForStatement' ||
      node.type === 'ForInStatement' ||
      node.type === 'ForOfStatement' ||
      node.type === 'WhileStatement' ||
      node.type === 'DoWhileStatement') &&
    node.span
  ) {
    callback(node, {
      filePath: 'current-file',
      startLine: node.span.start.line,
      startColumn: node.span.start.column,
      endLine: node.span.end.line,
      endColumn: node.span.end.column,
    });
  }

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseLoopBlocks(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseLoopBlocks(item, callback);
        }
      }
    }
  }
}

// 辅助函数：遍历函数声明
function traverseFunctionDeclarations(
  node: any,
  callback: (func: any, location: TCodeLocation) => void
) {
  if (!node) return;

  // 检查函数声明和箭头函数
  if (
    (node.type === 'FunctionDeclaration' || node.type === 'ArrowFunctionExpression') &&
    node.span
  ) {
    callback(node, {
      filePath: 'current-file',
      startLine: node.span.start.line,
      startColumn: node.span.start.column,
      endLine: node.span.end.line,
      endColumn: node.span.end.column,
    });
  }

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseFunctionDeclarations(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseFunctionDeclarations(item, callback);
        }
      }
    }
  }
}

// 辅助函数：查找块中的Hook调用
function findHookCallsInBlock(block: any): string[] {
  const hookCalls: string[] = [];

  // 查找Hook调用
  traverseNode(block, (node) => {
    if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Identifier') {
      const hookName = node.callee.value || node.callee.name;

      if (hookName && REACT_HOOKS.includes(hookName)) {
        hookCalls.push(hookName);
      }
    }
  });

  return hookCalls;
}

// 辅助函数：检查是否是空依赖数组
function isEmptyDependencyArray(node: any): boolean {
  return node && node.type === 'ArrayExpression' && (!node.elements || node.elements.length === 0);
}

// 辅助函数：检查依赖数组中是否有对象字面量
function hasObjectLiteralInDependencyArray(node: any): boolean {
  if (!node || node.type !== 'ArrayExpression' || !node.elements) {
    return false;
  }

  for (const element of node.elements) {
    if (element.type === 'ObjectExpression') {
      return true;
    }
  }

  return false;
}

// 辅助函数：获取回调中引用的外部变量
function getReferencedVariables(node: any): string[] {
  const vars: string[] = [];
  const declaredVars: string[] = [];

  // 收集函数内声明的变量
  traverseNode(node, (n) => {
    if (n.type === 'VariableDeclarator' && n.id && (n.id.value || n.id.name)) {
      declaredVars.push(n.id.value || n.id.name);
    }
  });

  // 收集引用的标识符
  traverseNode(node, (n) => {
    if (n.type === 'Identifier' && (n.value || n.name)) {
      const varName = n.value || n.name;
      // 排除内部声明的变量和常见的全局API
      if (
        !declaredVars.includes(varName) &&
        !['React', 'document', 'window', 'console', 'Math', 'JSON', 'Array', 'Object'].includes(
          varName
        )
      ) {
        vars.push(varName);
      }
    }
  });

  // 去重
  return Array.from(new Set(vars));
}

// 辅助函数：查找缺失的依赖项
function findMissingDependencies(callback: any, depsArray: any): string[] {
  // 获取回调中引用的变量
  const referencedVars = getReferencedVariables(callback);

  // 获取依赖数组中的变量
  const declaredDeps: string[] = [];
  if (depsArray && depsArray.type === 'ArrayExpression' && depsArray.elements) {
    for (const element of depsArray.elements) {
      if (element.type === 'Identifier') {
        declaredDeps.push(element.value || element.name);
      }
    }
  }

  // 找出缺失的依赖
  return referencedVars.filter((v) => !declaredDeps.includes(v));
}

// 辅助函数：检查useState初始值是否是复杂计算
function isExpensiveInitialState(node: any): boolean {
  if (!node) return false;

  // 检查是否是复杂表达式而非简单值或函数
  return (
    (node.type === 'ObjectExpression' && node.properties && node.properties.length > 2) || // 复杂对象
    (node.type === 'ArrayExpression' && node.elements && node.elements.length > 2) || // 较长数组
    node.type === 'CallExpression' || // 函数调用
    node.type === 'BinaryExpression' || // 复杂表达式
    node.type === 'ConditionalExpression'
  ); // 三元表达式
}

// 辅助函数：检查函数是否使用了Hooks
function checkIfFunctionUsesHooks(func: any): boolean {
  let usesHooks = false;

  traverseNode(func, (node) => {
    if (node.type === 'CallExpression' && node.callee && node.callee.type === 'Identifier') {
      const hookName = node.callee.value || node.callee.name;

      if (hookName && (REACT_HOOKS.includes(hookName) || hookName.startsWith('use'))) {
        usesHooks = true;
      }
    }
  });

  return usesHooks;
}

// 辅助函数：通用节点遍历
function traverseNode(node: any, callback: (node: any) => void) {
  if (!node) return;

  callback(node);

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseNode(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseNode(item, callback);
        }
      }
    }
  }
}

// 导出React Hooks规则
const hooksRules: IRule = {
  id: 'react/hooks-rules',
  name: 'React Hooks 使用规则',
  description: '检测React Hooks使用中的常见错误和最佳实践',
  category: RuleCategory.BEST_PRACTICE,
  severity: RuleSeverity.HIGH,
  frameworks: [Framework.REACT],

  // 规则检测函数
  detect: (ast: TAST, context: TRuleContext): TRuleResult[] => {
    // 组合所有检测结果
    return [
      ...checkHooksCallOrder(ast, context),
      ...checkDependencyArray(ast, context),
      ...checkUseStateInitialization(ast, context),
      ...checkCustomHookNaming(ast, context),
    ];
  },
};

export default hooksRules;
