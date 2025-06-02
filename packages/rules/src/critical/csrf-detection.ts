/**
 * CSRF检测规则
 * 检测潜在的跨站请求伪造攻击风险
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

// 需要CSRF保护的HTTP方法
const SENSITIVE_HTTP_METHODS = ['post', 'put', 'delete', 'patch'];

// 检测表单是否缺少CSRF令牌
function checkFormTokens(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      traverseForms(ast, (form, location) => {
        // 检查表单是否包含CSRF令牌字段
        const hasToken = checkForCsrfToken(form);

        if (!hasToken && form.attributes) {
          // 确认表单需要CSRF保护（非GET方法或无方法默认为POST）
          let method = 'post'; // 默认方法
          for (const attr of form.attributes) {
            if (attr.name && attr.name.name === 'method') {
              if (attr.value && attr.value.value) {
                method = attr.value.value.toLowerCase();
              }
            }
          }

          if (SENSITIVE_HTTP_METHODS.includes(method)) {
            results.push({
              ruleId: 'critical/csrf/missing-token',
              message: `表单缺少CSRF令牌，存在CSRF攻击风险`,
              severity: RuleSeverity.HIGH,
              location,
              codeSnippet: context.fileContent.substring(
                Math.max(0, location.startColumn - 10),
                Math.min(context.fileContent.length, location.endColumn + 10)
              ),
              fixSuggestion:
                '添加CSRF令牌字段，如 <input type="hidden" name="_csrf" value="{{csrfToken}}" />',
              fixable: false,
            });
          }
        }
      });
    }
  } catch (error) {
    console.error('检测CSRF表单令牌时出错:', error);
  }

  return results;
}

// 检测Ajax请求是否缺少CSRF保护
function checkAjaxRequests(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      // 检查fetch、axios、jQuery ajax等HTTP请求
      traverseHttpRequests(ast, (request, location, method) => {
        if (SENSITIVE_HTTP_METHODS.includes(method.toLowerCase())) {
          const hasHeader = checkForCsrfHeader(request);

          if (!hasHeader) {
            results.push({
              ruleId: 'critical/csrf/ajax-no-protection',
              message: `HTTP ${method.toUpperCase()} 请求缺少CSRF保护头，存在CSRF攻击风险`,
              severity: RuleSeverity.HIGH,
              location,
              codeSnippet: context.fileContent.substring(
                Math.max(0, location.startColumn - 10),
                Math.min(context.fileContent.length, location.endColumn + 10)
              ),
              fixSuggestion: '添加CSRF保护头，如 headers: { "X-CSRF-Token": csrfToken }',
              fixable: false,
            });
          }
        }
      });
    }
  } catch (error) {
    console.error('检测CSRF Ajax保护时出错:', error);
  }

  return results;
}

// 检测跨域资源共享(CORS)配置不当
function checkCorsConfig(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      traverseCorsConfigs(ast, (config, location) => {
        // 检查是否使用了过于宽松的CORS配置
        if (isInsecureCorsConfig(config)) {
          results.push({
            ruleId: 'critical/csrf/insecure-cors',
            message: '过于宽松的CORS配置可能增加CSRF攻击风险',
            severity: RuleSeverity.MEDIUM,
            location,
            codeSnippet: context.fileContent.substring(
              Math.max(0, location.startColumn - 10),
              Math.min(context.fileContent.length, location.endColumn + 10)
            ),
            fixSuggestion: '明确指定安全的域名而非使用通配符，并确保凭证安全',
            fixable: false,
          });
        }
      });
    }
  } catch (error) {
    console.error('检测CORS配置时出错:', error);
  }

  return results;
}

// 辅助函数：遍历表单元素
function traverseForms(node: any, callback: (form: any, location: TCodeLocation) => void) {
  if (!node) return;

  if (node.type === 'JSXOpeningElement' && node.name && node.name.name === 'form' && node.span) {
    callback(node, {
      filePath: 'current-file',
      startLine: node.span.start.line,
      startColumn: node.span.start.column,
      endLine: node.span.end.line,
      endColumn: node.span.end.column,
    });
  }

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseForms(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseForms(item, callback);
        }
      }
    }
  }
}

// 辅助函数：遍历HTTP请求
function traverseHttpRequests(
  node: any,
  callback: (request: any, location: TCodeLocation, method: string) => void
) {
  if (!node) return;

  // 检查fetch调用
  if (
    node.type === 'CallExpression' &&
    node.callee &&
    node.callee.type === 'Identifier' &&
    node.callee.value === 'fetch' &&
    node.span
  ) {
    // 确定HTTP方法
    let method = 'get'; // fetch默认方法
    if (node.arguments && node.arguments.length > 1) {
      const options = node.arguments[1];
      if (options.type === 'ObjectExpression') {
        for (const prop of options.properties || []) {
          if (prop.key && prop.key.value === 'method' && prop.value.value) {
            method = prop.value.value.toLowerCase();
            break;
          }
        }
      }
    }

    callback(
      node,
      {
        filePath: 'current-file',
        startLine: node.span.start.line,
        startColumn: node.span.start.column,
        endLine: node.span.end.line,
        endColumn: node.span.end.column,
      },
      method
    );
  }

  // 检查axios调用
  if (
    node.type === 'CallExpression' &&
    node.callee &&
    ((node.callee.type === 'MemberExpression' &&
      node.callee.object &&
      node.callee.object.value === 'axios' &&
      node.callee.property) ||
      (node.callee.type === 'Identifier' && node.callee.value === 'axios')) &&
    node.span
  ) {
    // 确定HTTP方法
    let method = 'get';
    if (node.callee.type === 'MemberExpression' && node.callee.property.value) {
      method = node.callee.property.value.toLowerCase();
    } else if (node.arguments && node.arguments.length > 0) {
      const options = node.arguments[0];
      if (options.type === 'ObjectExpression') {
        for (const prop of options.properties || []) {
          if (prop.key && prop.key.value === 'method' && prop.value.value) {
            method = prop.value.value.toLowerCase();
            break;
          }
        }
      }
    }

    callback(
      node,
      {
        filePath: 'current-file',
        startLine: node.span.start.line,
        startColumn: node.span.start.column,
        endLine: node.span.end.line,
        endColumn: node.span.end.column,
      },
      method
    );
  }

  // 检查$.ajax调用 (jQuery)
  if (
    node.type === 'CallExpression' &&
    node.callee &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object &&
    node.callee.object.value === '$' &&
    node.callee.property &&
    node.callee.property.value === 'ajax' &&
    node.span
  ) {
    // 确定HTTP方法
    let method = 'get'; // jQuery ajax默认方法
    if (node.arguments && node.arguments.length > 0) {
      const options = node.arguments[0];
      if (options.type === 'ObjectExpression') {
        for (const prop of options.properties || []) {
          if (prop.key && prop.key.value === 'type' && prop.value.value) {
            method = prop.value.value.toLowerCase();
            break;
          }
        }
      }
    }

    callback(
      node,
      {
        filePath: 'current-file',
        startLine: node.span.start.line,
        startColumn: node.span.start.column,
        endLine: node.span.end.line,
        endColumn: node.span.end.column,
      },
      method
    );
  }

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseHttpRequests(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseHttpRequests(item, callback);
        }
      }
    }
  }
}

// 辅助函数：遍历CORS配置
function traverseCorsConfigs(node: any, callback: (config: any, location: TCodeLocation) => void) {
  if (!node) return;

  // 检查常见的CORS配置模式
  if (node.type === 'ObjectExpression') {
    let hasCorsProperty = false;

    // 检查是否是CORS配置对象
    for (const prop of node.properties || []) {
      if (
        prop.key &&
        (prop.key.value === 'origin' ||
          prop.key.value === 'credentials' ||
          prop.key.value === 'Access-Control-Allow-Origin')
      ) {
        hasCorsProperty = true;
        break;
      }
    }

    if (hasCorsProperty && node.span) {
      callback(node, {
        filePath: 'current-file',
        startLine: node.span.start.line,
        startColumn: node.span.start.column,
        endLine: node.span.end.line,
        endColumn: node.span.end.column,
      });
    }
  }

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseCorsConfigs(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseCorsConfigs(item, callback);
        }
      }
    }
  }
}

// 辅助函数：检查表单是否包含CSRF令牌
function checkForCsrfToken(form: any): boolean {
  // 在表单元素中递归查找CSRF令牌
  const hasCsrfToken = findTokenInNode(form);
  return hasCsrfToken;
}

// 辅助函数：递归查找CSRF令牌
function findTokenInNode(node: any): boolean {
  if (!node) return false;

  // 检查是否有CSRF令牌的常见模式
  if (node.type === 'JSXOpeningElement' && node.name && node.name.name === 'input') {
    let isHidden = false;
    let isCsrfField = false;

    for (const attr of node.attributes || []) {
      if (attr.name && attr.name.name === 'type' && attr.value && attr.value.value === 'hidden') {
        isHidden = true;
      }

      if (
        attr.name &&
        attr.name.name === 'name' &&
        attr.value &&
        (attr.value.value === '_csrf' ||
          attr.value.value === 'csrf_token' ||
          attr.value.value === 'csrfToken' ||
          attr.value.value.toLowerCase().includes('csrf'))
      ) {
        isCsrfField = true;
      }
    }

    if (isHidden && isCsrfField) {
      return true;
    }
  }

  // 递归检查子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      if (findTokenInNode(node[key])) {
        return true;
      }
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          if (findTokenInNode(item)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

// 辅助函数：检查HTTP请求是否包含CSRF头
function checkForCsrfHeader(request: any): boolean {
  if (!request || !request.arguments) return false;

  // 检查请求配置对象中的headers
  const configArg = request.arguments.length > 1 ? request.arguments[1] : request.arguments[0];
  if (configArg && configArg.type === 'ObjectExpression') {
    for (const prop of configArg.properties || []) {
      if (prop.key && prop.key.value === 'headers' && prop.value.type === 'ObjectExpression') {
        // 在headers对象中查找CSRF相关的头
        for (const header of prop.value.properties || []) {
          if (
            header.key &&
            (header.key.value === 'X-CSRF-Token' ||
              header.key.value === 'CSRF-Token' ||
              header.key.value === '_csrf' ||
              header.key.value.toLowerCase().includes('csrf'))
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

// 辅助函数：检查CORS配置是否不安全
function isInsecureCorsConfig(config: any): boolean {
  if (!config || !config.properties) return false;

  for (const prop of config.properties) {
    // 检查是否使用了通配符origin
    if (
      prop.key &&
      (prop.key.value === 'origin' || prop.key.value === 'Access-Control-Allow-Origin') &&
      prop.value.value === '*'
    ) {
      return true;
    }

    // 检查是否启用了不安全的凭证
    if (
      prop.key &&
      (prop.key.value === 'credentials' || prop.key.value === 'Access-Control-Allow-Credentials') &&
      (prop.value.value === true || prop.value.value === 'true') &&
      hasWildcardOrigin(config)
    ) {
      return true;
    }
  }

  return false;
}

// 辅助函数：检查配置是否有通配符origin
function hasWildcardOrigin(config: any): boolean {
  for (const prop of config.properties || []) {
    if (
      prop.key &&
      (prop.key.value === 'origin' || prop.key.value === 'Access-Control-Allow-Origin') &&
      prop.value.value === '*'
    ) {
      return true;
    }
  }
  return false;
}

// 导出规则定义
const csrfDetectionRule: IRule = {
  id: 'critical/csrf-detection',
  name: 'CSRF攻击检测',
  description: '检测潜在的跨站请求伪造攻击风险，包括表单令牌缺失、Ajax请求保护和CORS配置',
  category: RuleCategory.SECURITY,
  severity: RuleSeverity.HIGH,
  frameworks: [Framework.REACT, Framework.VUE, Framework.VANILLA],

  // 规则检测函数
  detect: (ast: TAST, context: TRuleContext): TRuleResult[] => {
    // 组合所有检测结果
    return [
      ...checkFormTokens(ast, context),
      ...checkAjaxRequests(ast, context),
      ...checkCorsConfig(ast, context),
    ];
  },
};

export default csrfDetectionRule;
