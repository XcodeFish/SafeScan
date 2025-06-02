/**
 * XSS漏洞检测规则 - 检测使用dangerouslySetInnerHTML的情况
 */
import type { Rule } from '../../../../../packages/core/src/types/rule';

const rule: Rule = {
  id: 'security/xss/dangerous-html',
  name: 'Dangerous innerHTML',
  description: '避免使用dangerouslySetInnerHTML，它可能导致XSS漏洞',
  severity: 'high',
  category: 'security',
  framework: 'react',

  matcher: (node: any, context) => {
    try {
      // 调试输出
      if (node.type === 'JSXAttribute') {
        console.log('匹配JSXAttribute节点', node);
        console.log('属性名:', node.name);
      }

      // 检查是否为JSX属性
      if (node.type === 'JSXAttribute') {
        // 从测试输出中我们看到name字段有Identifier类型，并使用value字段存储属性名
        if (
          node.name &&
          node.name.type === 'Identifier' &&
          node.name.value === 'dangerouslySetInnerHTML'
        ) {
          console.log('匹配到dangerouslySetInnerHTML属性!');
          const nodeText = context.getNodeText(node);
          const location = context.getNodeLocation(node);

          return {
            ruleId: rule.id,
            message: '使用dangerouslySetInnerHTML可能导致XSS漏洞',
            severity: rule.severity,
            category: rule.category,
            location,
            code: nodeText,
            suggestions: [
              {
                description: '使用安全的渲染方式替代dangerouslySetInnerHTML',
                code: '使用 {sanitizedContent} 替代 dangerouslySetInnerHTML',
              },
            ],
          };
        }
      }

      // 另一种情况：通过文本匹配
      if (node && typeof node === 'object') {
        const nodeText = context.getNodeText(node);
        if (nodeText && nodeText.includes('dangerouslySetInnerHTML')) {
          console.log('通过文本匹配到dangerouslySetInnerHTML');
          const location = context.getNodeLocation(node);

          return {
            ruleId: rule.id,
            message: '使用dangerouslySetInnerHTML可能导致XSS漏洞',
            severity: rule.severity,
            category: rule.category,
            location,
            code: nodeText,
            suggestions: [
              {
                description: '使用安全的渲染方式替代dangerouslySetInnerHTML',
                code: '使用 {sanitizedContent} 替代 dangerouslySetInnerHTML',
              },
            ],
          };
        }
      }
    } catch (error) {
      console.error('XSS规则匹配错误:', error);
    }

    return null;
  },
};

export default rule;
