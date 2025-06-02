/**
 * XSS检测规则
 * 检测潜在的跨站脚本攻击风险
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

// 危险的DOM API
const DANGEROUS_DOM_APIS = [
  'innerHTML',
  'outerHTML',
  'insertAdjacentHTML',
  'document.write',
  'document.writeln',
  'dangerouslySetInnerHTML',
];

// 检测React中dangerouslySetInnerHTML的使用
function checkReactDangerousAPI(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  // 检查JSX属性是否使用了dangerouslySetInnerHTML
  // 这里是简化的实现，实际中需要递归遍历AST
  try {
    if (ast.type === 'Module') {
      traverseJSXAttributes(ast, (attribute, location) => {
        if (attribute.name && attribute.name.name === 'dangerouslySetInnerHTML') {
          results.push({
            ruleId: 'critical/xss/react-dangerous-html',
            message: '使用dangerouslySetInnerHTML存在XSS风险，应确保内容已安全处理',
            severity: RuleSeverity.CRITICAL,
            location,
            codeSnippet: context.fileContent.substring(
              Math.max(0, location.startColumn - 10),
              Math.min(context.fileContent.length, location.endColumn + 10)
            ),
            fixSuggestion: '使用安全的内容渲染方式，或确保内容已通过DOMPurify等库处理',
            fixable: false,
          });
        }
      });
    }
  } catch (error) {
    // 解析错误处理
    console.error('检测React危险API时出错:', error);
  }

  return results;
}

// 检测DOM API的不安全使用
function checkDomAPI(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  // 检查成员表达式是否使用了危险的DOM API
  // 这里是简化的实现，实际中需要递归遍历AST
  try {
    if (ast.type === 'Module') {
      traverseMemberExpressions(ast, (expr, location) => {
        const propName = expr.property && (expr.property.name || expr.property.value);

        if (propName && DANGEROUS_DOM_APIS.includes(propName)) {
          results.push({
            ruleId: 'critical/xss/unsafe-dom-api',
            message: `使用${propName}可能导致XSS攻击风险`,
            severity: RuleSeverity.CRITICAL,
            location,
            codeSnippet: context.fileContent.substring(
              Math.max(0, location.startColumn - 10),
              Math.min(context.fileContent.length, location.endColumn + 10)
            ),
            fixSuggestion: '使用安全的DOM操作方法如textContent或通过DOMPurify等库处理内容',
            fixable: false,
          });
        }
      });
    }
  } catch (error) {
    // 解析错误处理
    console.error('检测DOM API时出错:', error);
  }

  return results;
}

// 辅助函数：遍历JSX属性（简化版）
function traverseJSXAttributes(
  node: any,
  callback: (attribute: any, location: TCodeLocation) => void
) {
  if (!node) return;

  if (node.type === 'JSXOpeningElement' && node.attributes) {
    for (const attr of node.attributes) {
      if (attr.span) {
        callback(attr, {
          filePath: 'current-file', // 实际中应从context获取
          startLine: attr.span.start.line,
          startColumn: attr.span.start.column,
          endLine: attr.span.end.line,
          endColumn: attr.span.end.column,
        });
      }
    }
  }

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseJSXAttributes(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseJSXAttributes(item, callback);
        }
      }
    }
  }
}

// 辅助函数：遍历成员表达式（简化版）
function traverseMemberExpressions(
  node: any,
  callback: (expr: any, location: TCodeLocation) => void
) {
  if (!node) return;

  if (node.type === 'MemberExpression' && node.span) {
    callback(node, {
      filePath: 'current-file', // 实际中应从context获取
      startLine: node.span.start.line,
      startColumn: node.span.start.column,
      endLine: node.span.end.line,
      endColumn: node.span.end.column,
    });
  }

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseMemberExpressions(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseMemberExpressions(item, callback);
        }
      }
    }
  }
}

// 导出规则定义
const xssDetectionRule: IRule = {
  id: 'critical/xss-detection',
  name: 'XSS攻击检测',
  description: '检测潜在的跨站脚本攻击风险，包括不安全的DOM API使用和React中的危险操作',
  category: RuleCategory.SECURITY,
  severity: RuleSeverity.CRITICAL,
  frameworks: [Framework.REACT, Framework.VUE, Framework.VANILLA],

  // 规则检测函数
  detect: (ast: TAST, context: TRuleContext): TRuleResult[] => {
    // 组合所有检测结果
    return [...checkReactDangerousAPI(ast, context), ...checkDomAPI(ast, context)];
  },
};

export default xssDetectionRule;
