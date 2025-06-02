/**
 * 规则ID: security/xss/dangerous-html
 * 严重性: critical
 *
 * 此规则检测React中dangerouslySetInnerHTML的不安全使用，这可能导致XSS攻击
 */
import type { Node } from '@swc/core';
import { createRule } from '../../../../core/src/analyzer/static/rule-dsl';
import type { RuleContext } from '../../../../core/src/types/rule';

/**
 * 检查是否为安全的HTML内容
 * 此函数可以基于项目需求扩展更复杂的检测
 */
function isSafeHtmlContent(node: any): boolean {
  // 检查是否有__html字段
  if (!node || !node.properties) {
    return false;
  }

  const htmlProp = node.properties.find((prop: any) => prop.key?.value === '__html');

  if (!htmlProp || !htmlProp.value) {
    return false;
  }

  // 检查内容是否为字符串字面量（相对安全）
  if (htmlProp.value.type === 'StringLiteral') {
    return true;
  }

  // 检查是否使用了DOMPurify等安全库（函数调用）
  if (htmlProp.value.type === 'CallExpression' && htmlProp.value.callee?.type === 'Identifier') {
    const funcName = htmlProp.value.callee.value;
    // 白名单安全函数
    const safeFunctions = ['sanitizeHtml', 'DOMPurify.sanitize', 'sanitize', 'purify'];
    return safeFunctions.some((name) => funcName.includes(name));
  }

  return false;
}

export default createRule()
  .id('security/xss/dangerous-html')
  .name('禁止不安全地使用dangerouslySetInnerHTML')
  .description('使用dangerouslySetInnerHTML时必须确保内容已被正确清理，以防XSS攻击')
  .category('security')
  .severity('critical')
  .framework('react')
  .select((node: Node, _context: RuleContext) => {
    // 检查是否为JSX属性
    if (node.type !== 'JSXAttribute') {
      return false;
    }

    // 检查是否是dangerouslySetInnerHTML属性
    const attr = node as any;
    return attr.name?.value === 'dangerouslySetInnerHTML';
  })
  .when((node: Node) => {
    // 获取属性值
    const attr = node as any;
    if (!attr.value?.expression) {
      return false; // 无表达式值
    }

    // 检查表达式是否不安全
    return !isSafeHtmlContent(attr.value.expression);
  })
  .report('发现不安全使用dangerouslySetInnerHTML，可能导致XSS攻击')
  .documentation(
    `
    ### 问题描述
    
    React的dangerouslySetInnerHTML属性允许直接插入原始HTML，但这可能导致跨站脚本(XSS)攻击。
    
    ### 漏洞影响
    
    攻击者可能通过注入恶意脚本来获取用户信息、会话劫持或其他安全威胁。
    
    ### 修复建议
    
    1. 尽量避免使用dangerouslySetInnerHTML
    2. 如必须使用，确保内容经过安全处理:
       - 使用DOMPurify等库清理HTML内容
       - 使用安全的标记语言如Markdown替代原始HTML
       - 使用React组件结构而非原始HTML
    
    ### 示例代码
    
    错误示例:
    \`\`\`jsx
    <div dangerouslySetInnerHTML={{__html: userInput}} />
    \`\`\`
    
    正确示例:
    \`\`\`jsx
    import DOMPurify from 'dompurify';
    
    <div dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(userInput)}} />
    \`\`\`
  `
  )
  .example('bad', '<div dangerouslySetInnerHTML={{__html: data}} />')
  .example('good', '<div dangerouslySetInnerHTML={{__html: DOMPurify.sanitize(data)}} />')
  .build();
