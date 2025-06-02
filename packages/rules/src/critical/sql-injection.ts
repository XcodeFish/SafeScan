/**
 * SQL注入检测规则
 * 检测潜在的SQL注入攻击风险
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

// 常见的数据库操作API
const DATABASE_APIS = [
  'query',
  'execute',
  'exec',
  'raw',
  'all',
  'run',
  'prepare',
  'sql',
  'knex',
  'sequelize',
];

// 常见的模板字符串拼接模式
const RISKY_PATTERNS = ['`SELECT', '`INSERT', '`UPDATE', '`DELETE', '`DROP', '`CREATE', '`ALTER'];

// 检测SQL字符串拼接
function checkStringConcatenation(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      // 查找字符串拼接操作
      traverseStringConcatenations(ast, (node, location) => {
        // 检查是否包含SQL关键字
        if (containsSqlKeyword(node)) {
          results.push({
            ruleId: 'critical/sql-injection/string-concat',
            message: '使用字符串拼接构建SQL查询可能导致SQL注入风险',
            severity: RuleSeverity.CRITICAL,
            location,
            codeSnippet: context.fileContent.substring(
              Math.max(0, location.startColumn - 10),
              Math.min(context.fileContent.length, location.endColumn + 10)
            ),
            fixSuggestion: '使用参数化查询或预处理语句替代字符串拼接',
            fixable: false,
          });
        }
      });
    }
  } catch (error) {
    console.error('检测SQL字符串拼接时出错:', error);
  }

  return results;
}

// 检测不安全的模板字符串
function checkUnsafeTemplates(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      // 查找模板字符串
      traverseTemplateExpressions(ast, (node, location) => {
        // 检查模板字符串是否包含SQL查询
        if (isRiskyTemplateString(node)) {
          results.push({
            ruleId: 'critical/sql-injection/template-string',
            message: '在模板字符串中直接插入变量构建SQL查询可能导致注入风险',
            severity: RuleSeverity.CRITICAL,
            location,
            codeSnippet: context.fileContent.substring(
              Math.max(0, location.startColumn - 10),
              Math.min(context.fileContent.length, location.endColumn + 10)
            ),
            fixSuggestion: '使用参数化查询或ORM提供的安全API',
            fixable: false,
          });
        }
      });
    }
  } catch (error) {
    console.error('检测不安全模板字符串时出错:', error);
  }

  return results;
}

// 检测直接使用用户输入
function checkUnsafeInputUsage(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      // 查找数据库API调用
      traverseDatabaseCalls(ast, (call, location) => {
        // 检查是否直接使用了可能的用户输入
        if (containsPotentialUserInput(call)) {
          results.push({
            ruleId: 'critical/sql-injection/unsafe-input',
            message: '直接将用户输入传递给数据库操作可能导致SQL注入风险',
            severity: RuleSeverity.CRITICAL,
            location,
            codeSnippet: context.fileContent.substring(
              Math.max(0, location.startColumn - 10),
              Math.min(context.fileContent.length, location.endColumn + 10)
            ),
            fixSuggestion: '使用参数化查询并对用户输入进行验证和转义',
            fixable: false,
          });
        }
      });
    }
  } catch (error) {
    console.error('检测不安全输入使用时出错:', error);
  }

  return results;
}

// 辅助函数：遍历字符串拼接操作
function traverseStringConcatenations(
  node: any,
  callback: (node: any, location: TCodeLocation) => void
) {
  if (!node) return;

  // 检查字符串拼接操作符
  if (
    node.type === 'BinaryExpression' &&
    node.operator === '+' &&
    ((node.left && (node.left.type === 'StringLiteral' || node.left.type === 'TemplateLiteral')) ||
      (node.right &&
        (node.right.type === 'StringLiteral' || node.right.type === 'TemplateLiteral'))) &&
    node.span
  ) {
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
      traverseStringConcatenations(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseStringConcatenations(item, callback);
        }
      }
    }
  }
}

// 辅助函数：遍历模板字符串表达式
function traverseTemplateExpressions(
  node: any,
  callback: (node: any, location: TCodeLocation) => void
) {
  if (!node) return;

  // 检查模板字符串
  if (
    node.type === 'TemplateLiteral' &&
    node.expressions &&
    node.expressions.length > 0 &&
    node.span
  ) {
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
      traverseTemplateExpressions(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseTemplateExpressions(item, callback);
        }
      }
    }
  }
}

// 辅助函数：遍历数据库API调用
function traverseDatabaseCalls(node: any, callback: (call: any, location: TCodeLocation) => void) {
  if (!node) return;

  // 检查数据库API调用
  if (node.type === 'CallExpression' && node.span) {
    // 检查是否是数据库API调用
    let isDatabaseCall = false;

    // 检查成员表达式调用，如db.query(), connection.execute()等
    if (node.callee && node.callee.type === 'MemberExpression' && node.callee.property) {
      const methodName = node.callee.property.value || node.callee.property.name;
      if (methodName && DATABASE_APIS.includes(methodName)) {
        isDatabaseCall = true;
      }
    }

    // 直接的函数调用，如query(), exec()等
    if (node.callee && node.callee.type === 'Identifier') {
      const funcName = node.callee.value || node.callee.name;
      if (funcName && DATABASE_APIS.includes(funcName)) {
        isDatabaseCall = true;
      }
    }

    if (isDatabaseCall) {
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
      traverseDatabaseCalls(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseDatabaseCalls(item, callback);
        }
      }
    }
  }
}

// 辅助函数：检查是否包含SQL关键字
function containsSqlKeyword(node: any): boolean {
  const sqlKeywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER'];

  // 检查字符串字面量
  if (node.left && node.left.type === 'StringLiteral' && node.left.value) {
    for (const keyword of sqlKeywords) {
      if (node.left.value.toUpperCase().includes(keyword)) {
        return true;
      }
    }
  }

  if (node.right && node.right.type === 'StringLiteral' && node.right.value) {
    for (const keyword of sqlKeywords) {
      if (node.right.value.toUpperCase().includes(keyword)) {
        return true;
      }
    }
  }

  // 检查模板字符串
  if (node.left && node.left.type === 'TemplateLiteral' && node.left.quasis) {
    for (const quasi of node.left.quasis) {
      if (quasi.value && quasi.value.raw) {
        for (const keyword of sqlKeywords) {
          if (quasi.value.raw.toUpperCase().includes(keyword)) {
            return true;
          }
        }
      }
    }
  }

  if (node.right && node.right.type === 'TemplateLiteral' && node.right.quasis) {
    for (const quasi of node.right.quasis) {
      if (quasi.value && quasi.value.raw) {
        for (const keyword of sqlKeywords) {
          if (quasi.value.raw.toUpperCase().includes(keyword)) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

// 辅助函数：检查是否是高风险模板字符串
function isRiskyTemplateString(node: any): boolean {
  // 检查模板字符串的静态部分是否包含SQL关键字
  if (node.quasis && node.quasis.length > 0) {
    for (const quasi of node.quasis) {
      if (quasi.value && quasi.value.raw) {
        const raw = quasi.value.raw.toUpperCase();
        for (const pattern of RISKY_PATTERNS) {
          if (raw.includes(pattern.toUpperCase().substring(1))) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

// 辅助函数：检查是否包含潜在的用户输入
function containsPotentialUserInput(call: any): boolean {
  if (!call.arguments || call.arguments.length === 0) return false;

  // 检查参数是否可能是来自用户的数据
  for (const arg of call.arguments) {
    // 检查是否直接使用了可能的用户输入变量
    if (arg.type === 'Identifier') {
      const varName = arg.value || arg.name;
      if (varName && isPotentialUserInputVariable(varName)) {
        return true;
      }
    }

    // 检查是否使用了对象属性访问，可能是request.body等用户输入
    if (arg.type === 'MemberExpression') {
      if (isRequestObjectAccess(arg)) {
        return true;
      }
    }

    // 检查模板字符串是否包含可能的用户输入
    if (arg.type === 'TemplateLiteral' && arg.expressions && arg.expressions.length > 0) {
      for (const expr of arg.expressions) {
        if (expr.type === 'Identifier') {
          const varName = expr.value || expr.name;
          if (varName && isPotentialUserInputVariable(varName)) {
            return true;
          }
        } else if (expr.type === 'MemberExpression' && isRequestObjectAccess(expr)) {
          return true;
        }
      }
    }
  }

  return false;
}

// 辅助函数：检查变量名是否可能是用户输入
function isPotentialUserInputVariable(varName: string): boolean {
  const userInputPatterns = [
    'user',
    'input',
    'param',
    'query',
    'body',
    'form',
    'request',
    'req',
    'data',
    'payload',
  ];

  varName = varName.toLowerCase();
  for (const pattern of userInputPatterns) {
    if (varName.includes(pattern)) {
      return true;
    }
  }

  return false;
}

// 辅助函数：检查是否是请求对象属性访问
function isRequestObjectAccess(expr: any): boolean {
  if (!expr.object) return false;

  // 检查是否访问了request.body, req.params等属性
  const objName = expr.object.value || expr.object.name;
  if (!objName) return false;

  const requestObjects = ['request', 'req', 'input', 'event'];
  const userDataProperties = ['body', 'params', 'query', 'data', 'formData', 'payload'];

  if (requestObjects.includes(objName.toLowerCase())) {
    // 直接的req.body等访问
    const propName = expr.property && (expr.property.value || expr.property.name);
    if (propName && userDataProperties.includes(propName.toLowerCase())) {
      return true;
    }

    // 嵌套访问如req.body.username
    if (expr.property && expr.property.type === 'MemberExpression') {
      const propObj =
        expr.property.object && (expr.property.object.value || expr.property.object.name);
      if (propObj && userDataProperties.includes(propObj.toLowerCase())) {
        return true;
      }
    }
  }

  return false;
}

// 导出规则定义
const sqlInjectionRule: IRule = {
  id: 'critical/sql-injection',
  name: 'SQL注入检测',
  description: '检测潜在的SQL注入攻击风险，包括字符串拼接、不安全模板和用户输入使用',
  category: RuleCategory.SECURITY,
  severity: RuleSeverity.CRITICAL,
  frameworks: [Framework.NODEJS, Framework.VANILLA],

  // 规则检测函数
  detect: (ast: TAST, context: TRuleContext): TRuleResult[] => {
    // 组合所有检测结果
    return [
      ...checkStringConcatenation(ast, context),
      ...checkUnsafeTemplates(ast, context),
      ...checkUnsafeInputUsage(ast, context),
    ];
  },
};

export default sqlInjectionRule;
