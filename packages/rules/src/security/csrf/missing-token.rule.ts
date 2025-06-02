/**
 * 规则ID: security/csrf/missing-token
 * 严重性: critical
 *
 * 此规则检测表单提交是否包含CSRF防护令牌
 */
import type { Node } from '@swc/core';
import { createRule } from '../../../../core/src/analyzer/static/rule-dsl';
import type { RuleContext } from '../../../../core/src/types/rule';

/**
 * 检查表单是否包含CSRF令牌
 * @param node 表单节点
 */
function hasCSRFToken(node: any, context: RuleContext): boolean {
  // 检查是否为表单元素
  if (node.type !== 'JSXElement' || node.openingElement?.name?.value !== 'form') {
    return true;
  }

  const formContent = context.getNodeText(node);

  // 检查是否包含常见的CSRF令牌模式
  const csrfPatterns = [
    /csrfToken/i,
    /_csrf/i,
    /csrf[-_]token/i,
    /<input[^>]*name=["']csrf/i,
    /getCSRFToken\(/i,
    /useCsrfToken\(/i,
    /useCSRF\(/i,
  ];

  return csrfPatterns.some((pattern) => pattern.test(formContent));
}

export default createRule()
  .id('security/csrf/missing-token')
  .name('表单缺少CSRF令牌')
  .description('表单提交必须包含CSRF防护令牌，以防跨站请求伪造攻击')
  .category('security')
  .severity('critical')
  .select((node: Node) => {
    // 选择所有表单元素
    if (node.type !== 'JSXElement') return false;
    return (node as any).openingElement?.name?.value === 'form';
  })
  .when((node: Node, context: RuleContext) => {
    // 当表单不包含CSRF令牌时报告问题
    return !hasCSRFToken(node, context);
  })
  .report('表单提交缺少CSRF令牌，可能导致跨站请求伪造攻击')
  .documentation(
    `
    ### 问题描述
    
    跨站请求伪造(CSRF)是一种攻击，使恶意网站能够代表用户在已认证的网站上执行操作。
    使用CSRF令牌是防止此类攻击的主要方法之一。
    
    ### 漏洞影响
    
    - 未经授权的操作可能以用户身份执行
    - 可能导致数据被修改、删除或泄露
    - 可能导致账户被劫持
    
    ### 修复建议
    
    在所有表单中添加CSRF令牌：
    
    1. 在服务端生成唯一的CSRF令牌
    2. 在表单中添加隐藏输入字段包含该令牌
    3. 提交时在服务端验证令牌有效性
    
    ### 示例代码
    
    错误示例:
    \`\`\`jsx
    <form action="/api/submit" method="post">
      <input type="text" name="username" />
      <button type="submit">提交</button>
    </form>
    \`\`\`
    
    正确示例:
    \`\`\`jsx
    <form action="/api/submit" method="post">
      <input type="text" name="username" />
      <input type="hidden" name="csrf_token" value={getCsrfToken()} />
      <button type="submit">提交</button>
    </form>
    \`\`\`
  `
  )
  .example('bad', '<form action="/api/submit" method="post"><input name="username" /></form>')
  .example(
    'good',
    '<form action="/api/submit" method="post"><input name="username" /><input type="hidden" name="csrf_token" value={csrfToken} /></form>'
  )
  .build();
