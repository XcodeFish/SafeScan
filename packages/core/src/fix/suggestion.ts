import { IFixSuggestion, IIssue } from './types';

/**
 * 生成修复建议
 * @param issue 问题
 * @returns 修复建议
 */
export async function generateSuggestion(issue: IIssue): Promise<IFixSuggestion | null> {
  if (!issue) return null;

  const { ruleId, severity } = issue;

  // 根据规则ID获取建议模板
  const suggestionTemplate = await getSuggestionTemplate(ruleId);

  if (!suggestionTemplate) {
    return generateGenericSuggestion(issue);
  }

  // 解析问题上下文
  const context = parseIssueContext(issue);

  // 生成建议
  return {
    id: `suggestion-${ruleId}-${Date.now()}`,
    description: applySuggestionTemplate(suggestionTemplate.description, context),
    reason: applySuggestionTemplate(suggestionTemplate.reason, context),
    codeSnippet: issue.metadata?.codeSnippet || undefined,
    exampleFix: applySuggestionTemplate(suggestionTemplate.exampleFix, context),
    documentationLinks: suggestionTemplate.documentationLinks || [],
    severity,
  };
}

/**
 * 获取规则对应的建议模板
 * @param ruleId 规则ID
 * @returns 建议模板
 */
async function getSuggestionTemplate(ruleId: string): Promise<{
  description: string;
  reason: string;
  exampleFix: string;
  documentationLinks?: string[];
} | null> {
  // 建议模板映射
  const templates: Record<string, any> = {
    'xss-injection': {
      description: '为防止XSS攻击,请使用安全的输出方式处理用户输入',
      reason: '直接将用户输入插入到HTML中可能导致XSS攻击风险',
      exampleFix: '替换 dangerouslySetInnerHTML 为 textContent 或使用框架提供的安全输出方法',
      documentationLinks: [
        'https://owasp.org/www-community/attacks/xss/',
        'https://reactjs.org/docs/dom-elements.html#dangerouslysetinnerhtml',
      ],
    },
    'memory-leak': {
      description: '检测到可能的内存泄漏问题,请确保清理组件资源',
      reason: '组件中的事件监听器、定时器或订阅在组件卸载时未被清理',
      exampleFix: '在组件的 useEffect 返回函数或 componentWillUnmount 生命周期中清理资源',
      documentationLinks: ['https://reactjs.org/docs/hooks-effect.html#effects-with-cleanup'],
    },
    'infinite-loop': {
      description: '检测到可能的无限循环风险',
      reason: '循环条件可能导致无法终止的执行',
      exampleFix: '添加适当的终止条件或确保循环变量正确更新',
      documentationLinks: [
        'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Loops_and_iteration',
      ],
    },
    'dependency-array': {
      description: 'React Hook依赖数组不完整',
      reason: '缺少依赖项可能导致过时的闭包或意外行为',
      exampleFix: '将所有在effect中使用的外部变量添加到依赖数组中',
      documentationLinks: ['https://reactjs.org/docs/hooks-rules.html#eslint-plugin'],
    },
  };

  // 尝试精确匹配规则ID
  if (templates[ruleId]) {
    return templates[ruleId];
  }

  // 尝试匹配规则ID前缀
  for (const templateId of Object.keys(templates)) {
    if (ruleId.startsWith(templateId)) {
      return templates[templateId];
    }
  }

  return null;
}

/**
 * 解析问题上下文
 * @param issue 问题
 * @returns 上下文对象
 */
function parseIssueContext(issue: IIssue): Record<string, any> {
  return {
    ruleId: issue.ruleId,
    message: issue.message,
    severity: issue.severity,
    location: `第${issue.location.startLine}行,第${issue.location.startColumn}列`,
    ...issue.metadata,
  };
}

/**
 * 应用建议模板
 * @param template 模板字符串
 * @param context 上下文对象
 * @returns 填充后的字符串
 */
function applySuggestionTemplate(template: string, context: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return context[key] !== undefined ? String(context[key]) : match;
  });
}

/**
 * 生成通用建议
 * @param issue 问题
 * @returns 修复建议
 */
function generateGenericSuggestion(issue: IIssue): IFixSuggestion {
  const { ruleId, severity, message } = issue;

  return {
    id: `suggestion-generic-${ruleId}-${Date.now()}`,
    description: `修复 ${ruleId} 问题`,
    reason: message || `检测到 ${ruleId} 规则违规`,
    severity,
    documentationLinks: ['https://safescan-docs.example.com/rules'],
  };
}
