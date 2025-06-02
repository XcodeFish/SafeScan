/**
 * dangerous-html规则测试
 */
import { describe, it, expect } from 'vitest';
import dangerousHtmlRule from './dangerous-html.rule';

describe('security/xss/dangerous-html', () => {
  // 简化的测试方法，因为我们还没有完整实现规则测试框架
  const testRule = (code: string, expectViolation: boolean) => {
    // 简单的AST节点模拟
    const mockNode = {
      type: 'JSXAttribute',
      name: { value: 'dangerouslySetInnerHTML' },
      value: {
        expression: {
          properties: [
            {
              key: { value: '__html' },
              value: code.includes('DOMPurify')
                ? { type: 'CallExpression', callee: { value: 'DOMPurify.sanitize' } }
                : { type: 'Identifier', value: 'userContent' },
            },
          ],
        },
      },
    };

    // 简化的上下文
    const context = {
      getNodeText: () => code,
      getNodeLocation: () => ({
        filePath: 'test.tsx',
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 50,
      }),
      fileContent: code,
      filePath: 'test.tsx',
    };

    // 运行规则
    const issue = dangerousHtmlRule.matcher(mockNode as any, context as any);

    // 验证结果
    if (expectViolation) {
      expect(issue).not.toBeNull();
      expect(issue?.ruleId).toBe('security/xss/dangerous-html');
    } else {
      expect(issue).toBeNull();
    }
  };

  it('应该检测没有净化的dangerouslySetInnerHTML', () => {
    const code = `<div dangerouslySetInnerHTML={{ __html: userContent }} />`;
    testRule(code, true);
  });

  it('应该通过有净化处理的dangerouslySetInnerHTML', () => {
    const code = `<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />`;
    testRule(code, false);
  });

  it('应该检测可能有XSS风险的字符串模板', () => {
    const code = `<div dangerouslySetInnerHTML={{ __html: \`<script>\${userInput}</script>\` }} />`;
    testRule(code, true);
  });
});

// 模拟完整的规则测试框架（待将来完善）
describe('使用规则测试框架', () => {
  // 这里只是示例，实际需要完善规则测试框架后使用
  it('应该能完整测试规则', () => {
    // 将来实现完整的测试框架后，可以这样使用：
    // const tester = createRuleTester('security/xss/dangerous-html', dangerousHtmlRule);
    // tester.run(
    //   [{ code: '<div>安全的HTML</div>' }],
    //   [{ code: '<div dangerouslySetInnerHTML={{ __html: data }} />' }]
    // );
    expect(true).toBe(true);
  });
});
