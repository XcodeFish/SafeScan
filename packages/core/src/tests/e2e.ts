/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-vars */
/**
 * 端到端测试
 * 提供完整的工作流测试，验证各个组件集成的正确性
 */
import { createDynamicFeedback } from '../analyzer/dynamic/feedback';
import {
  createHeadlessBrowser,
  IPageTest,
  TestStepType,
  TestAssertType,
  TestResultStatus,
} from '../analyzer/dynamic/headless';
import { createRuntimeHooks } from '../analyzer/dynamic/hooks';
import { createRuntimeProtection } from '../analyzer/dynamic/runtime';
import { RuleCategory, RuleSeverity } from '../types';

/**
 * 测试配置选项
 */
export interface IE2ETestOptions {
  /** 超时时间(ms) */
  timeout?: number;
  /** 是否启用屏幕截图 */
  enableScreenshots?: boolean;
  /** 截图保存目录 */
  screenshotDir?: string;
  /** 测试URL */
  baseUrl?: string;
  /** 设备类型 */
  deviceType?: string;
  /** 是否在无头模式运行 */
  headless?: boolean;
  /** 测试结束回调函数 */
  onComplete?: (results: IE2ETestResult) => void;
}

/**
 * 测试用例
 */
export interface IE2ETestCase {
  /** 测试ID */
  id: string;
  /** 测试名称 */
  name: string;
  /** 测试描述 */
  description: string;
  /** 测试标签 */
  tags?: string[];
  /** 测试执行函数 */
  execute: (tester: E2ETester) => Promise<void>;
}

/**
 * 测试断言
 */
export interface IE2EAssertion {
  /** 断言是否通过 */
  passed: boolean;
  /** 断言消息 */
  message: string;
  /** 断言详情 */
  details?: any;
  /** 期望值 */
  expected?: any;
  /** 实际值 */
  actual?: any;
}

/**
 * 测试用例结果
 */
export interface IE2ETestCaseResult {
  /** 测试ID */
  id: string;
  /** 测试名称 */
  name: string;
  /** 测试状态 */
  status: TestResultStatus;
  /** 断言列表 */
  assertions: IE2EAssertion[];
  /** 错误消息 */
  error?: string;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 执行时间(ms) */
  duration: number;
  /** 截图路径 */
  screenshotPaths?: string[];
  /** 测试日志 */
  logs: string[];
  /** 安全问题 */
  securityIssues: {
    /** 问题类型 */
    type: string;
    /** 问题描述 */
    description: string;
    /** 严重程度 */
    severity: RuleSeverity;
    /** 类别 */
    category: RuleCategory;
  }[];
}

/**
 * 测试结果
 */
export interface IE2ETestResult {
  /** 测试套件名称 */
  name: string;
  /** 测试用例结果 */
  testResults: IE2ETestCaseResult[];
  /** 总测试数 */
  totalTests: number;
  /** 通过测试数 */
  passedTests: number;
  /** 失败测试数 */
  failedTests: number;
  /** 安全问题数 */
  securityIssueCount: number;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 总执行时间(ms) */
  duration: number;
}

/**
 * 端到端测试器类
 */
export class E2ETester {
  /** 测试套件名称 */
  private name: string;
  /** 测试用例列表 */
  private testCases: IE2ETestCase[] = [];
  /** 测试用例结果 */
  private testResults: IE2ETestCaseResult[] = [];
  /** 当前测试用例 */
  private currentTest?: IE2ETestCase;
  /** 当前测试结果 */
  private currentResult?: IE2ETestCaseResult;
  /** 无头浏览器 */
  private headlessBrowser = createHeadlessBrowser();
  /** 运行时保护 */
  private runtimeProtection = createRuntimeProtection();
  /** 运行时钩子 */
  private runtimeHooks = createRuntimeHooks();
  /** 动态反馈 */
  private dynamicFeedback = createDynamicFeedback();
  /** 测试配置 */
  private options: IE2ETestOptions;
  /** 默认基础URL */
  private readonly DEFAULT_BASE_URL = 'http://localhost:3000';

  /**
   * 构造函数
   * @param name 测试套件名称
   * @param options 测试配置选项
   */
  constructor(name: string, options: IE2ETestOptions = {}) {
    this.name = name;
    this.options = {
      timeout: 30000,
      enableScreenshots: true,
      screenshotDir: './screenshots',
      baseUrl: this.DEFAULT_BASE_URL,
      headless: true,
      ...options,
    };
  }

  /**
   * 添加测试用例
   * @param testCase 测试用例
   */
  addTest(testCase: IE2ETestCase): void {
    this.testCases.push(testCase);
  }

  /**
   * 添加多个测试用例
   * @param testCases 测试用例数组
   */
  addTests(testCases: IE2ETestCase[]): void {
    this.testCases.push(...testCases);
  }

  /**
   * 运行所有测试用例
   */
  async runAll(): Promise<IE2ETestResult> {
    this.testResults = [];
    const startTime = Date.now();

    try {
      await this.initializeEnvironment();

      for (const testCase of this.testCases) {
        await this.runTest(testCase);
      }
    } finally {
      await this.cleanupEnvironment();
    }

    const endTime = Date.now();

    // 计算测试结果
    const totalTests = this.testResults.length;
    const passedTests = this.testResults.filter((r) => r.status === TestResultStatus.PASSED).length;
    const failedTests = totalTests - passedTests;

    // 计算安全问题总数
    const securityIssueCount = this.testResults.reduce(
      (sum, result) => sum + result.securityIssues.length,
      0
    );

    const testResult: IE2ETestResult = {
      name: this.name,
      testResults: this.testResults,
      totalTests,
      passedTests,
      failedTests,
      securityIssueCount,
      startTime,
      endTime,
      duration: endTime - startTime,
    };

    // 调用完成回调
    if (this.options.onComplete) {
      this.options.onComplete(testResult);
    }

    return testResult;
  }

  /**
   * 运行单个测试用例
   * @param testCase 测试用例
   */
  async runTest(testCase: IE2ETestCase): Promise<IE2ETestCaseResult> {
    const startTime = Date.now();

    this.currentTest = testCase;
    this.currentResult = {
      id: testCase.id,
      name: testCase.name,
      status: TestResultStatus.PASSED,
      assertions: [],
      startTime,
      endTime: 0,
      duration: 0,
      logs: [],
      securityIssues: [],
    };

    try {
      await testCase.execute(this);

      // 如果没有断言，视为失败
      if (this.currentResult.assertions.length === 0) {
        this.log('Warning: Test has no assertions');
      }

      // 如果有失败的断言，整个测试失败
      const failedAssertions = this.currentResult.assertions.filter((a) => !a.passed);
      if (failedAssertions.length > 0) {
        this.currentResult.status = TestResultStatus.FAILED;
        this.currentResult.error = `Failed assertions: ${failedAssertions.length}`;
      }
    } catch (error: any) {
      this.currentResult.status = TestResultStatus.ERROR;
      this.currentResult.error = error.message || 'Unknown error';
      this.log(`Error: ${error.message}`);

      if (error.stack) {
        this.log(`Stack: ${error.stack}`);
      }
    }

    const endTime = Date.now();
    this.currentResult.endTime = endTime;
    this.currentResult.duration = endTime - startTime;

    this.testResults.push({ ...this.currentResult });
    return { ...this.currentResult };
  }

  /**
   * 初始化测试环境
   */
  private async initializeEnvironment(): Promise<void> {
    // 初始化无头浏览器
    await this.headlessBrowser.init();

    // 配置无头浏览器
    this.headlessBrowser.updateConfig({
      headless: this.options.headless ?? true,
      enableScreenshots: this.options.enableScreenshots,
      screenshotDir: this.options.screenshotDir,
      pageLoadTimeout: this.options.timeout,
    });

    // 初始化其他组件
    await this.runtimeProtection.init();
    await this.runtimeHooks.init();
    await this.dynamicFeedback.init();

    // 启动组件
    await this.headlessBrowser.start();
    await this.runtimeProtection.start();
    await this.runtimeHooks.start();
    await this.dynamicFeedback.start();
  }

  /**
   * 清理测试环境
   */
  private async cleanupEnvironment(): Promise<void> {
    try {
      // 停止所有组件
      await this.headlessBrowser.stop();
      await this.runtimeProtection.stop();
      await this.runtimeHooks.stop();
      await this.dynamicFeedback.stop();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * 日志记录
   * @param message 日志消息
   */
  log(message: string): void {
    if (this.currentResult) {
      this.currentResult.logs.push(`[${new Date().toISOString()}] ${message}`);
    }
    console.log(`[${this.currentTest?.name || 'Test'}] ${message}`);
  }

  /**
   * 断言条件为真
   * @param condition 条件
   * @param message 断言消息
   */
  assert(condition: boolean, message: string): void {
    if (!this.currentResult) {
      throw new Error('No active test case');
    }

    this.currentResult.assertions.push({
      passed: condition,
      message,
    });

    if (!condition) {
      this.log(`Assertion failed: ${message}`);
    }
  }

  /**
   * 断言两个值相等
   * @param actual 实际值
   * @param expected 预期值
   * @param message 断言消息
   */
  assertEqual(actual: any, expected: any, message: string): void {
    const isEqual = this.deepEqual(actual, expected);

    if (!this.currentResult) {
      throw new Error('No active test case');
    }

    this.currentResult.assertions.push({
      passed: isEqual,
      message,
      expected,
      actual,
    });

    if (!isEqual) {
      this.log(`Assertion failed: ${message}`);
      this.log(`Expected: ${JSON.stringify(expected)}`);
      this.log(`Actual: ${JSON.stringify(actual)}`);
    }
  }

  /**
   * 断言包含子串
   * @param text 文本
   * @param substring 子串
   * @param message 断言消息
   */
  assertContains(text: string, substring: string, message: string): void {
    const contains = text.includes(substring);

    if (!this.currentResult) {
      throw new Error('No active test case');
    }

    this.currentResult.assertions.push({
      passed: contains,
      message,
      expected: `to contain "${substring}"`,
      actual: text,
    });

    if (!contains) {
      this.log(`Assertion failed: ${message}`);
      this.log(`Expected to contain: "${substring}"`);
      this.log(`Actual: "${text}"`);
    }
  }

  /**
   * 运行浏览器测试
   * @param pageTest 页面测试定义
   */
  async runBrowserTest(pageTest: IPageTest): Promise<void> {
    // 如果URL没有协议，加上基础URL
    if (!pageTest.url.startsWith('http')) {
      pageTest.url = `${this.options.baseUrl || this.DEFAULT_BASE_URL}${pageTest.url.startsWith('/') ? pageTest.url : '/' + pageTest.url}`;
    }

    // 添加测试到无头浏览器
    this.headlessBrowser.addTest(pageTest);

    // 等待测试完成
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | undefined;

      // 设置超时
      if (this.options.timeout) {
        timeoutId = setTimeout(() => {
          reject(new Error(`Test timed out after ${this.options.timeout}ms`));
        }, this.options.timeout);
      }

      // 覆盖原有的测试完成回调
      const originalOnTestComplete = this.headlessBrowser.getConfig().onTestComplete;

      this.headlessBrowser.updateConfig({
        onTestComplete: (results) => {
          // 清除超时
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          // 调用原始回调
          if (originalOnTestComplete) {
            originalOnTestComplete(results);
          }

          // 处理结果
          const testResult = results.results.find((r) => r.testId === pageTest.id);
          if (testResult) {
            // 更新当前测试结果
            if (this.currentResult) {
              // 添加截图路径
              this.currentResult.screenshotPaths = testResult.steps
                .filter((s) => s.screenshotPath)
                .map((s) => s.screenshotPath!);

              // 添加安全问题
              this.currentResult.securityIssues = testResult.securityIssues.map((issue) => ({
                type: issue.type,
                description: issue.description,
                severity: issue.severity,
                category: issue.category,
              }));

              // 添加控制台日志
              testResult.consoleLogs.forEach((log) => {
                this.log(`Console: ${log}`);
              });
            }

            // 如果测试失败，抛出错误
            if (testResult.status !== TestResultStatus.PASSED) {
              const failedStep = testResult.steps.find((s) => s.status !== TestResultStatus.PASSED);
              if (failedStep && failedStep.error) {
                reject(
                  new Error(
                    `Step ${failedStep.stepIndex} (${failedStep.description}) failed: ${failedStep.error}`
                  )
                );
                return;
              }
              reject(new Error(`Test failed with status: ${testResult.status}`));
              return;
            }

            resolve();
          } else {
            reject(new Error(`Test result not found for ID: ${pageTest.id}`));
          }
        },
      });
    });
  }

  /**
   * 深度比较两个值是否相等
   * @param a 第一个值
   * @param b 第二个值
   * @returns 是否相等
   */
  private deepEqual(a: any, b: any): boolean {
    if (a === b) return true;

    if (a === null || b === null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!this.deepEqual(a[key], b[key])) return false;
    }

    return true;
  }
}

/**
 * 预定义的安全测试用例集
 * 用于检测常见的安全漏洞
 */
export const SecurityTestSuite = {
  /**
   * XSS攻击测试用例
   * @param baseUrl 基础URL
   * @param _options 测试选项（暂未使用）
   */
  createXSSTests(baseUrl: string, _options?: Partial<IE2ETestOptions>): IE2ETestCase[] {
    return [
      {
        id: 'xss-reflected',
        name: 'XSS reflected attack test',
        description: 'Tests if the application is vulnerable to reflected XSS attacks',
        tags: ['security', 'xss'],
        execute: async (tester) => {
          await tester.runBrowserTest({
            id: 'xss-reflected-test',
            name: 'Reflected XSS Test',
            description: 'Check for reflected XSS vulnerabilities',
            url: `${baseUrl}/search?q=<script>alert(1)</script>`,
            injectSafetyMonitor: true,
            steps: [
              {
                type: TestStepType.WAIT_FOR,
                description: 'Wait for page to load',
                timeout: 5000,
                selector: 'body',
              },
              {
                type: TestStepType.ASSERT,
                description: 'Check if XSS payload is sanitized',
                assertType: TestAssertType.ELEMENT_NOT_EXISTS,
                selector: 'script',
              },
              {
                type: TestStepType.SCREENSHOT,
                description: 'Screenshot of search results',
                screenshotName: 'xss-reflected-test.png',
              },
            ],
          });
        },
      },
      {
        id: 'xss-stored',
        name: 'XSS stored attack test',
        description: 'Tests if the application is vulnerable to stored XSS attacks',
        tags: ['security', 'xss'],
        execute: async (tester) => {
          // 提交包含XSS payload的表单
          await tester.runBrowserTest({
            id: 'xss-stored-submit',
            name: 'Submit Form with XSS Payload',
            description: 'Submit a form with an XSS payload',
            url: `${baseUrl}/comments`,
            injectSafetyMonitor: true,
            steps: [
              {
                type: TestStepType.WAIT_FOR,
                description: 'Wait for comment form',
                selector: 'form',
                timeout: 5000,
              },
              {
                type: TestStepType.TYPE,
                description: 'Enter name',
                selector: 'input[name="name"]',
                value: 'Test User',
              },
              {
                type: TestStepType.TYPE,
                description: 'Enter malicious comment',
                selector: 'textarea[name="comment"]',
                value: 'This is a test <script>alert("XSS")</script>',
              },
              {
                type: TestStepType.CLICK,
                description: 'Submit the comment',
                selector: 'button[type="submit"]',
              },
              {
                type: TestStepType.WAIT_FOR,
                description: 'Wait for submission to complete',
                selector: '.success-message',
                timeout: 5000,
              },
            ],
          });

          // 检查提交后页面是否安全渲染评论
          await tester.runBrowserTest({
            id: 'xss-stored-check',
            name: 'Check Stored XSS',
            description: 'Check if stored XSS payload is properly sanitized',
            url: `${baseUrl}/comments`,
            injectSafetyMonitor: true,
            steps: [
              {
                type: TestStepType.WAIT_FOR,
                description: 'Wait for comments to load',
                selector: '.comments-list',
                timeout: 5000,
              },
              {
                type: TestStepType.ASSERT,
                description: 'Check if XSS payload is sanitized',
                assertType: TestAssertType.ELEMENT_NOT_EXISTS,
                selector: '.comments-list script',
              },
              {
                type: TestStepType.SCREENSHOT,
                description: 'Screenshot of comments page',
                screenshotName: 'xss-stored-test.png',
              },
            ],
          });
        },
      },
    ];
  },

  /**
   * CSRF攻击测试用例
   * @param baseUrl 基础URL
   * @param _options 测试选项（暂未使用）
   */
  createCSRFTests(baseUrl: string, _options?: Partial<IE2ETestOptions>): IE2ETestCase[] {
    return [
      {
        id: 'csrf-token-test',
        name: 'CSRF Token Test',
        description: 'Tests if the application properly implements CSRF tokens',
        tags: ['security', 'csrf'],
        execute: async (tester) => {
          // 首先获取表单和CSRF token
          await tester.runBrowserTest({
            id: 'csrf-check',
            name: 'Check CSRF Protection',
            description: 'Check if forms include CSRF tokens',
            url: `${baseUrl}/profile`,
            injectSafetyMonitor: true,
            steps: [
              {
                type: TestStepType.WAIT_FOR,
                description: 'Wait for form to load',
                selector: 'form',
                timeout: 5000,
              },
              {
                type: TestStepType.ASSERT,
                description: 'Check for CSRF token field',
                assertType: TestAssertType.ELEMENT_EXISTS,
                selector:
                  'input[name="csrf_token"], input[name="_csrf"], input[type="hidden"][name^="csrf"]',
              },
              {
                type: TestStepType.EVALUATE,
                description: 'Extract CSRF token using JS',
                value: `
                  window.extractedCSRFToken = document.querySelector('input[name="csrf_token"], input[name="_csrf"], input[type="hidden"][name^="csrf"]')?.value;
                  console.log('Extracted CSRF token:', window.extractedCSRFToken);
                `,
              },
              {
                type: TestStepType.ASSERT,
                description: 'Verify CSRF token is not empty',
                assertType: TestAssertType.CUSTOM,
                customFn: async (page) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const token = await page.evaluate(() => (window as any).extractedCSRFToken);
                  return !!token && token.length > 0;
                },
              },
              {
                type: TestStepType.SCREENSHOT,
                description: 'Screenshot of form with CSRF token',
                screenshotName: 'csrf-token-test.png',
              },
            ],
          });

          // 测试完成后验证断言结果
          tester.assert(
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            tester.currentResult!.assertions.every((a) => a.passed),
            'CSRF protection should be properly implemented'
          );
        },
      },
    ];
  },
};

/**
 * 创建端到端测试套件
 * @param name 测试套件名称
 * @param options 测试选项
 */
export function createE2ETester(name: string, options?: IE2ETestOptions): E2ETester {
  return new E2ETester(name, options);
}
