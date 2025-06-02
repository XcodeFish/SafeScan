/**
 * 规则ID: memory/leak/react-useeffect-cleanup
 * 严重性: high
 *
 * 此规则检测React中useEffect中缺少cleanup函数可能导致的内存泄漏
 */
import type { Node } from '@swc/core';
import { createRule } from '../../../../core/src/analyzer/static/rule-dsl';
import type { Category } from '../../../../core/src/types/rule';
import { isCallingFunction, getCallExpressionArg } from '../../../../core/src/utils/ast-helpers';

/**
 * 检查useEffect是否有清理函数
 * 此函数检测useEffect中返回的清理函数
 */
function hasCleanupFunction(node: any): boolean {
  // 检查是否为useEffect调用
  if (!isCallingFunction(node, 'useEffect')) {
    return true; // 不是useEffect，不需要检查
  }

  // 获取第一个参数（回调函数）
  const callbackArg = getCallExpressionArg(node, 0);
  if (!callbackArg) {
    return false; // 没有传入回调函数
  }

  // 检查参数是否为函数表达式或箭头函数表达式
  if (callbackArg.type !== 'FunctionExpression' && callbackArg.type !== 'ArrowFunctionExpression') {
    return false; // 回调不是直接的函数，无法静态分析
  }

  // 检查函数体
  const body = callbackArg.body;

  // 箭头函数可能直接返回表达式
  if (callbackArg.type === 'ArrowFunctionExpression' && body.type !== 'BlockStatement') {
    // 直接返回函数表达式的情况
    return body.type === 'FunctionExpression' || body.type === 'ArrowFunctionExpression';
  }

  // 对于函数体，查找return语句
  if (body.type === 'BlockStatement' && body.stmts && body.stmts.length > 0) {
    // 检查是否有return语句返回函数
    for (const stmt of body.stmts) {
      if (stmt.type === 'ReturnStatement') {
        const returnArg = stmt.argument;
        // 返回的是函数
        if (
          returnArg &&
          (returnArg.type === 'FunctionExpression' ||
            returnArg.type === 'ArrowFunctionExpression' ||
            returnArg.type === 'Identifier') // 也可能是函数变量
        ) {
          return true;
        }
      }
    }

    // 检查是否存在设置事件监听器但没有清理
    let hasEventListener = false;
    let hasRemoveListener = false;

    for (const stmt of body.stmts) {
      // 检查常见的事件监听器添加模式
      if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'CallExpression') {
        const callExpr = stmt.expression;
        if (
          callExpr.callee.type === 'MemberExpression' &&
          callExpr.callee.property.value === 'addEventListener'
        ) {
          hasEventListener = true;
        } else if (
          callExpr.callee.type === 'MemberExpression' &&
          callExpr.callee.property.value === 'removeEventListener'
        ) {
          hasRemoveListener = true;
        }
      }
    }

    // 如果有添加事件监听器但没有移除，可能是问题
    if (hasEventListener && !hasRemoveListener) {
      return false;
    }
  }

  // 没有找到明确的返回函数
  return false;
}

// 由于Category是枚举类型，我们需要使用正确的类别值
const MEMORY_CATEGORY: Category = 'bestPractice';

export default createRule()
  .id('memory/leak/react-useeffect-cleanup')
  .name('React useEffect必须包含清理函数')
  .description('使用useEffect添加事件监听器或订阅时，必须返回清理函数以防止内存泄漏')
  .category(MEMORY_CATEGORY)
  .severity('high')
  .framework('react')
  .select((node: Node) => {
    // 选择useEffect调用
    return isCallingFunction(node, 'useEffect');
  })
  .when((node: Node) => {
    // 当没有清理函数时报告问题
    return !hasCleanupFunction(node);
  })
  .report('useEffect缺少清理函数，可能导致内存泄漏')
  .documentation(
    `
    ### 问题描述
    
    React的useEffect钩子用于处理副作用，如果在其中设置了事件监听器、定时器或订阅，
    却没有返回清理函数，可能会导致组件卸载后仍然有活跃的监听器或订阅，从而造成内存泄漏。
    
    ### 内存泄漏影响
    
    - 随着时间推移，应用性能逐渐下降
    - 浏览器内存使用量增加
    - 在复杂应用中可能导致浏览器崩溃
    
    ### 修复建议
    
    在useEffect中返回一个清理函数，用于在组件卸载时清除所有事件监听器、定时器和订阅:
    
    ### 示例代码
    
    错误示例:
    \`\`\`jsx
    useEffect(() => {
      window.addEventListener('resize', handleResize);
      // 缺少清理函数
    }, []);
    \`\`\`
    
    正确示例:
    \`\`\`jsx
    useEffect(() => {
      window.addEventListener('resize', handleResize);
      
      // 返回清理函数
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }, []);
    \`\`\`
  `
  )
  .example(
    'bad',
    `
    useEffect(() => {
      document.addEventListener('click', handleClick);
    }, []);
  `
  )
  .example(
    'good',
    `
    useEffect(() => {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }, []);
  `
  )
  .build();
