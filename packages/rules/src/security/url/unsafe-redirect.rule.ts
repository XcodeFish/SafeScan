/**
 * 规则ID: security/url/unsafe-redirect
 * 严重性: high
 *
 * 此规则检测可能导致开放重定向漏洞的不安全URL重定向
 */
import type { Node } from '@swc/core';
import { createRule } from '../../../../core/src/analyzer/static/rule-dsl';
import type { RuleContext } from '../../../../core/src/types/rule';
import { isCallingFunction } from '../../../../core/src/utils/ast-helpers';

/**
 * 检查是否为重定向操作
 */
function isRedirectOperation(node: any): boolean {
  // 检查window.location赋值
  if (
    node.type === 'AssignmentExpression' &&
    node.left.type === 'MemberExpression' &&
    node.left.object?.value === 'window' &&
    ['location', 'location.href'].includes(node.left.property?.value)
  ) {
    return true;
  }

  // 检查location.replace调用
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object?.value === 'location' &&
    node.callee.property?.value === 'replace'
  ) {
    return true;
  }

  // 检查history.push/replace (React Router)
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object?.value === 'history' &&
    ['push', 'replace'].includes(node.callee.property?.value)
  ) {
    return true;
  }

  // 检查navigate函数调用 (React Router v6+)
  if (isCallingFunction(node, 'navigate')) {
    return true;
  }

  // 检查Router/Redirect组件 (React Router)
  if (
    node.type === 'JSXElement' &&
    ['Redirect', 'Navigate'].includes(node.openingElement?.name?.value)
  ) {
    return true;
  }

  return false;
}

/**
 * 检查URL是否来自于用户输入或URL参数
 */
function hasUnsafeUrlSource(node: any, context: RuleContext): boolean {
  const nodeText = context.getNodeText(node);

  // 检查是否包含常见的不安全URL来源模式
  const unsafePatterns = [
    /location\.search/,
    /location\.hash/,
    /URLSearchParams/,
    /getParameter/,
    /params\./,
    /useParams/,
    /query\./,
    /useQuery/,
    /\$_GET/,
    /request\.query/,
    /req\.query/,
  ];

  return unsafePatterns.some((pattern) => pattern.test(nodeText));
}

export default createRule()
  .id('security/url/unsafe-redirect')
  .name('不安全的URL重定向')
  .description('检测可能导致开放重定向漏洞的不安全URL重定向')
  .category('security')
  .severity('high')
  .select((node: Node) => {
    // 选择所有可能的重定向操作
    return isRedirectOperation(node);
  })
  .when((node: Node, context: RuleContext) => {
    // 当重定向URL可能来自不安全来源时报告问题
    return hasUnsafeUrlSource(node, context);
  })
  .report('检测到不安全的URL重定向，可能导致开放重定向漏洞')
  .documentation(
    `
    ### 问题描述
    
    开放重定向漏洞允许攻击者将用户重定向到恶意网站，通常通过操纵应用程序中的重定向URL参数。
    这类漏洞常被用于钓鱼攻击，因为用户可能会信任来自合法域名的重定向。
    
    ### 漏洞影响
    
    - 钓鱼攻击
    - 信息泄露
    - 绕过安全控制
    - 提高社会工程学攻击的可信度
    
    ### 修复建议
    
    1. 使用相对URL而不是绝对URL
    2. 实现URL白名单验证
    3. 使用间接引用映射而不是直接使用用户提供的URL
    4. 对重定向URL进行严格验证
    
    ### 示例代码
    
    错误示例:
    \`\`\`js
    // 直接使用URL参数进行重定向
    const url = new URLSearchParams(window.location.search).get('redirect');
    window.location.href = url;
    \`\`\`
    
    正确示例:
    \`\`\`js
    // 验证重定向URL
    const url = new URLSearchParams(window.location.search).get('redirect');
    
    // 方法1: 使用白名单
    const allowedDomains = ['example.com', 'safe-domain.com'];
    const isAllowed = allowedDomains.some(domain => 
      url.startsWith('https://' + domain + '/') || url.startsWith('/')
    );
    
    if (isAllowed) {
      window.location.href = url;
    } else {
      // 使用安全的默认值
      window.location.href = '/home';
    }
    \`\`\`
  `
  )
  .example('bad', "window.location.href = new URLSearchParams(location.search).get('redirect');")
  .example('bad', '<Redirect to={props.location.state.from} />')
  .example(
    'good',
    `
    // 使用白名单验证重定向URL
    const redirectTo = urlParams.get('redirect');
    const safeUrl = isSafeUrl(redirectTo) ? redirectTo : '/dashboard';
    navigate(safeUrl);
  `
  )
  .build();
