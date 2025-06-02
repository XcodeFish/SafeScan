/**
 * AST辅助函数
 * 用于简化AST操作和类型判断
 */
import type { Node } from '@swc/core';
import type { RuleContext } from '../types/rule';

/**
 * 检查节点是否为指定类型
 * @param node AST节点
 * @param type 节点类型
 * @returns 是否匹配
 */
export function isNodeType(node: Node, type: string): boolean {
  if (!node) return false;
  return node.type === type;
}

/**
 * 获取节点源代码
 * @param node AST节点
 * @param context 规则上下文
 * @returns 节点对应的源代码
 */
export function getNodeSource(node: Node, context: RuleContext): string {
  if (!node) return '';
  return context.getNodeText(node);
}

/**
 * 从上下文中提取源代码
 * @param context 规则上下文
 * @param start 开始位置
 * @param end 结束位置
 * @returns 指定范围的源代码
 */
export function extractSourceCode(context: RuleContext, start: number, end: number): string {
  if (!context.fileContent) return '';
  return context.fileContent.substring(start, end);
}

/**
 * 获取节点的JSX属性值
 * @param node JSX节点
 * @param attrName 属性名
 * @returns 属性值或undefined
 */
export function getJSXAttributeValue(node: any, attrName: string): string | undefined {
  if (!node.openingElement?.attributes) return undefined;

  const attr = node.openingElement.attributes.find((attr: any) => attr.name?.value === attrName);

  if (!attr?.value) return undefined;

  // 处理不同类型的值
  if (attr.value.expression) {
    // JSX属性值是表达式
    return undefined; // 需要表达式求值，当前不支持
  } else if (attr.value.value) {
    // 字符串字面量
    return attr.value.value;
  }

  return undefined;
}

/**
 * 判断JSX节点是否有指定属性
 * @param node JSX节点
 * @param attrName 属性名
 * @returns 是否具有该属性
 */
export function hasJSXAttribute(node: any, attrName: string): boolean {
  if (!node.openingElement?.attributes) return false;

  return node.openingElement.attributes.some((attr: any) => attr.name?.value === attrName);
}

/**
 * 检查调用表达式是否调用了特定函数
 * @param node 调用表达式节点
 * @param functionName 函数名
 * @returns 是否匹配
 */
export function isCallingFunction(node: any, functionName: string): boolean {
  if (!isNodeType(node, 'CallExpression')) return false;

  // 检查直接调用的情况 func()
  if (node.callee.type === 'Identifier' && node.callee.value === functionName) {
    return true;
  }

  // 检查成员调用的情况 obj.func()
  if (
    node.callee.type === 'MemberExpression' &&
    node.callee.property?.type === 'Identifier' &&
    node.callee.property.value === functionName
  ) {
    return true;
  }

  return false;
}

/**
 * 获取调用表达式的参数
 * @param node 调用表达式节点
 * @param index 参数索引
 * @returns 参数节点或undefined
 */
export function getCallExpressionArg(node: any, index: number): any {
  if (!isNodeType(node, 'CallExpression') || !node.arguments || node.arguments.length <= index) {
    return undefined;
  }

  return node.arguments[index];
}
