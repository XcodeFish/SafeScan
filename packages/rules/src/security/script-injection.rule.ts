/**
 * 规则ID: security/script-injection
 * 严重性: critical
 *
 * 此规则检测可能导致脚本注入攻击的模式
 */
import type { Node } from '@swc/core';
import { createRule } from '../../../core/src/analyzer/static/rule-dsl';
import type { RuleContext, Category } from '../../../core/src/types/rule';
import { isCallingFunction, getCallExpressionArg } from '../../../core/src/utils/ast-helpers';

// 定义类别为安全
const SECURITY_CATEGORY: Category = 'security';

/**
 * 检查是否使用了危险的动态脚本生成模式
 */
function isDangerousScriptPattern(node: Node, context: RuleContext): boolean {
  // 检查eval调用
  if (isCallingFunction(node, 'eval')) {
    const arg = getCallExpressionArg(node as any, 0);
    // 如果不是字符串字面量，则可能是动态代码
    if (arg && arg.type !== 'StringLiteral') {
      return true;
    }
  }

  // 检查document.write/writeln
  if (
    node.type === 'CallExpression' &&
    (node as any).callee.type === 'MemberExpression' &&
    (node as any).callee.object?.value === 'document' &&
    ((node as any).callee.property?.value === 'write' ||
      (node as any).callee.property?.value === 'writeln')
  ) {
    return true;
  }

  // 检查new Function构造
  if (
    node.type === 'NewExpression' &&
    (node as any).callee.type === 'Identifier' &&
    (node as any).callee.value === 'Function'
  ) {
    return true;
  }

  // 检查危险的innerHTML赋值
  if (
    node.type === 'AssignmentExpression' &&
    (node as any).left.type === 'MemberExpression' &&
    (node as any).left.property?.value === 'innerHTML'
  ) {
    // 检查右侧是否包含脚本语法
    const rightSide = (node as any).right;
    if (
      rightSide.type === 'StringLiteral' &&
      /<script\b[^>]*>([\s\S]*?)<\/script>/i.test(rightSide.value)
    ) {
      return true;
    } else if (rightSide.type !== 'StringLiteral') {
      // 动态拼接的内容也可能有风险
      const sourceText = context.getNodeText(rightSide);
      if (sourceText.includes('script') || sourceText.includes('iframe')) {
        return true;
      }
    }
  }

  // 检查createElement('script')
  if (isCallingFunction(node, 'createElement') && node.type === 'CallExpression') {
    const arg = getCallExpressionArg(node as any, 0);
    if (arg && arg.type === 'StringLiteral' && arg.value === 'script') {
      return true;
    }
  }

  return false;
}

export default createRule()
  .id('security/script-injection')
  .name('避免危险的脚本注入')
  .description('禁止使用可能导致脚本注入攻击的方法')
  .category(SECURITY_CATEGORY)
  .severity('critical')
  .select((node: Node) => {
    return (
      node.type === 'CallExpression' ||
      node.type === 'NewExpression' ||
      node.type === 'AssignmentExpression'
    );
  })
  .when((node: Node, context: RuleContext) => {
    return isDangerousScriptPattern(node, context);
  })
  .report('使用了可能导致脚本注入攻击的代码模式')
  .documentation(
    `
    ### 问题描述
    
    动态执行JavaScript代码（如eval、new Function、document.write等）可能会导致脚本注入攻击。
    攻击者可以通过注入恶意代码，实现跨站脚本攻击（XSS）。
    
    ### 安全影响
    
    - 窃取用户cookie和会话信息
    - 重定向至恶意网站
    - 修改页面内容欺骗用户
    - 执行任意JavaScript代码
    
    ### 修复建议
    
    1. 避免使用eval、Function构造函数和document.write/writeln
    2. 使用安全的DOM操作代替innerHTML
    3. 如果必须使用动态代码，确保严格验证输入内容
    4. 对于动态内容，使用textContent而不是innerHTML
    5. 使用内容安全策略(CSP)限制执行来源
    
    ### 示例代码
    
    错误示例:
    \`\`\`js
    // 危险的eval使用
    eval(userInput);
    
    // 危险的Function构造
    const dynamicFunc = new Function(userInput);
    
    // 危险的document.write
    document.write('<script>' + userInput + '</script>');
    
    // 危险的innerHTML使用
    element.innerHTML = '<script>' + userInput + '</script>';
    \`\`\`
    
    正确示例:
    \`\`\`js
    // 安全地渲染内容
    element.textContent = userInput;
    
    // 使用安全的DOM API
    const div = document.createElement('div');
    div.textContent = userInput;
    container.appendChild(div);
    \`\`\`
  `
  )
  .example('bad', "eval('alert(\"' + userInput + '\")')")
  .example('bad', "document.write('<script>alert(\"' + userInput + '\")</script>')")
  .example('good', "document.getElementById('output').textContent = userInput;")
  .build();
