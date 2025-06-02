/**
 * SQL注入漏洞检测规则 - 检测字符串拼接SQL
 */
import type { Rule } from '../../../../../packages/core/src/types/rule';

const rule: Rule = {
  id: 'security/injection/sql-injection',
  name: 'SQL Injection',
  description: '避免在SQL查询中直接拼接用户输入，应使用参数化查询',
  severity: 'critical',
  category: 'security',

  matcher: (node: any, context) => {
    try {
      if (!node || !node.type) return null;

      const nodeText = context.getNodeText(node);
      if (!nodeText) return null;

      // 检查是否为调用表达式并且是数据库查询
      if (
        node.type === 'CallExpression' &&
        node.callee &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property &&
        node.callee.property.value === 'query'
      ) {
        console.log('发现数据库查询调用:', nodeText);

        // 获取位置信息
        const location = context.getNodeLocation(node);

        // 返回SQL注入问题
        return {
          ruleId: rule.id,
          message: '检测到SQL注入风险：直接在SQL语句中拼接变量',
          severity: rule.severity,
          category: rule.category,
          location,
          code: nodeText,
          suggestions: [
            {
              description: '使用参数化查询替代字符串拼接',
              code: '使用db.query("SELECT * FROM products WHERE name LIKE ?", [query])',
            },
          ],
        };
      }

      // 检查字符串拼接的SQL语句
      if (
        node.type === 'BinaryExpression' &&
        node.operator === '+' &&
        nodeText.toUpperCase().includes('SELECT')
      ) {
        console.log('发现SQL字符串拼接:', nodeText);

        // 获取位置信息
        const location = context.getNodeLocation(node);

        // 返回SQL注入问题
        return {
          ruleId: rule.id,
          message: '检测到SQL注入风险：直接在SQL语句中拼接变量',
          severity: rule.severity,
          category: rule.category,
          location,
          code: nodeText,
          suggestions: [
            {
              description: '使用参数化查询替代字符串拼接',
              code: '使用db.query("SELECT * FROM products WHERE name LIKE ?", [query])',
            },
          ],
        };
      }
    } catch (error) {
      console.error('SQL注入规则匹配错误:', error);
    }

    return null;
  },
};

export default rule;
