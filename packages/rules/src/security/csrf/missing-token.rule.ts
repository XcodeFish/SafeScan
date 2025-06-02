/**
 * CSRF漏洞检测规则 - 检测表单提交缺少CSRF token
 */
import type { Rule } from '../../../../../packages/core/src/types/rule';

const rule: Rule = {
  id: 'security/csrf/missing-token',
  name: 'Missing CSRF Token',
  description: '表单提交应包含CSRF令牌以防止跨站请求伪造',
  severity: 'high',
  category: 'security',

  matcher: (node: any, context) => {
    try {
      // 检查是否存在节点
      if (!node || !node.type) return null;

      // 获取节点文本
      const nodeText = context.getNodeText(node);
      if (!nodeText) return null;

      // 检查是否为fetch调用
      if (
        node.type === 'CallExpression' &&
        node.callee &&
        nodeText.includes('fetch') &&
        nodeText.includes('POST')
      ) {
        // 识别为fetch调用
        console.log('发现POST fetch调用：', nodeText);

        // 返回CSRF漏洞问题
        const location = context.getNodeLocation(node);

        return {
          ruleId: rule.id,
          message: 'POST请求缺少CSRF保护，可能导致CSRF漏洞',
          severity: rule.severity,
          category: rule.category,
          location,
          code: nodeText,
          suggestions: [
            {
              description: '添加CSRF令牌到请求头或请求体',
              code: '为请求添加csrf-token头或表单字段',
            },
          ],
        };
      }

      // 检查是否为onSubmit表单提交
      if (
        node.type === 'JSXAttribute' &&
        node.name &&
        node.name.type === 'Identifier' &&
        node.name.value === 'onSubmit'
      ) {
        console.log('发现表单提交：', nodeText);

        // 返回CSRF漏洞问题
        const location = context.getNodeLocation(node);

        return {
          ruleId: rule.id,
          message: '表单提交缺少CSRF保护，可能导致CSRF漏洞',
          severity: rule.severity,
          category: rule.category,
          location,
          code: nodeText,
          suggestions: [
            {
              description: '添加CSRF令牌到表单中',
              code: '<input type="hidden" name="csrf-token" value={csrfToken} />',
            },
          ],
        };
      }
    } catch (error) {
      console.error('CSRF规则匹配错误:', error);
    }

    return null;
  },
};

export default rule;
