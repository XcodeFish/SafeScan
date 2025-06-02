/**
 * XSS检测规则测试
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { parseCode } from '@safescan/core/analyzer/static/parser';
import { RuleLoader, RuleMatcher } from '@safescan/core/analyzer/static/rules';
import { RuleSeverity } from '@safescan/core/types';
import {
  mockXssRule,
  mockEvalXssRule,
  mockReactDangerousHtmlRule,
  mockUrlInjectionRule,
  mockSanitizedHtmlRule,
} from '../mocks/mock-rules';

describe('XSS检测规则', () => {
  let ruleLoader: RuleLoader;
  let ruleMatcher: RuleMatcher;

  beforeEach(() => {
    ruleLoader = new RuleLoader();
    // 添加所有XSS检测规则
    ruleLoader.addRule(mockXssRule);
    ruleLoader.addRule(mockEvalXssRule);
    ruleLoader.addRule(mockReactDangerousHtmlRule);
    ruleLoader.addRule(mockUrlInjectionRule);
    ruleLoader.addRule(mockSanitizedHtmlRule);
    ruleMatcher = new RuleMatcher(ruleLoader);
  });

  test('应检测到直接插入HTML的XSS风险', async () => {
    const code = `
      function renderUserInput() {
        const userInput = getQueryParam('input');
        document.getElementById('output').innerHTML = userInput;
      }
    `;

    const ast = (await parseCode(code)).ast;
    const context = {
      filePath: 'test.js',
      fileContent: code,
    };

    const results = ruleMatcher.matchByRuleId(ast, context, 'security-xss-innerHTML');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].ruleId).toBe('security-xss-innerHTML');
    expect(results[0].severity).toBe(RuleSeverity.CRITICAL);
    expect(results[0].location.startLine).toBeGreaterThan(0);
  });

  test('应检测到eval函数的XSS风险', async () => {
    const code = `
      function processUserCode() {
        const userCode = getQueryParam('code');
        eval(userCode);
      }
    `;

    const ast = (await parseCode(code)).ast;
    const context = {
      filePath: 'test.js',
      fileContent: code,
    };

    const results = ruleMatcher.matchByRuleId(ast, context, 'security-xss-eval');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].ruleId).toBe('security-xss-eval');
    expect(results[0].severity).toBe(RuleSeverity.CRITICAL);
  });

  test('应检测到React中的危险HTML插入', async () => {
    const code = `
      import React from 'react';
      
      function UserProfile({ userData }) {
        return (
          <div 
            dangerouslySetInnerHTML={{ 
              __html: userData.description 
            }} 
          />
        );
      }
    `;

    const ast = (await parseCode(code, { language: 'jsx' })).ast;
    const context = {
      filePath: 'UserProfile.jsx',
      fileContent: code,
    };

    const results = ruleMatcher.matchByRuleId(
      ast,
      context,
      'security-xss-react-dangerouslySetInnerHTML'
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].ruleId).toBe('security-xss-react-dangerouslySetInnerHTML');
    expect(results[0].severity).toBe(RuleSeverity.HIGH);
  });

  test('不应将安全的HTML渲染标记为XSS风险', async () => {
    const code = `
      function renderSafeHTML() {
        const safeHTML = sanitizeHTML(getQueryParam('input'));
        document.getElementById('output').innerHTML = safeHTML;
      }
    `;

    const ast = (await parseCode(code)).ast;
    const context = {
      filePath: 'test.js',
      fileContent: code,
    };

    // 假设我们有一个规则会检查是否经过了sanitizeHTML处理
    const results = ruleMatcher.matchByRuleId(ast, context, 'security-xss-sanitized');

    // 对于已经进行过安全处理的内容，应该不报告问题
    expect(results.length).toBe(0);
  });

  test('应识别URL注入的XSS风险', async () => {
    const code = `
      function redirectToUserPage() {
        const redirectUrl = getQueryParam('redirect');
        window.location = redirectUrl;
      }
    `;

    const ast = (await parseCode(code)).ast;
    const context = {
      filePath: 'test.js',
      fileContent: code,
    };

    const results = ruleMatcher.matchByRuleId(ast, context, 'security-xss-url-injection');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].ruleId).toBe('security-xss-url-injection');
    expect(results[0].severity).toBe(RuleSeverity.HIGH);
  });
});
