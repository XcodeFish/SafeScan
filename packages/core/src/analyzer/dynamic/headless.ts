/* eslint-disable */
/**
 * 浏览器无头测试集成
 * 提供浏览器环境中的自动化安全测试能力
 */
import { RuleCategory, RuleSeverity } from '../../types';
import { ModuleStatus, ModulePriority } from '../../types/module-interface';

// 使用动态导入避免直接依赖
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let puppeteer: any;
try {
  // 尝试加载puppeteer，如果不存在则会在运行时处理
  // eslint-disable-next-line import/no-extraneous-dependencies
  puppeteer = require('puppeteer');
} catch (e) {
  // 当puppeteer未安装时不会立即抛错
  puppeteer = null;
}

// 声明类型但不依赖实际包
interface IBrowser {
  close(): Promise<void>;
  newPage(): Promise<IPage>;
}

interface IPage {
  setDefaultTimeout(timeout: number): Promise<void>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  setRequestInterception(value: boolean): Promise<void>;
  goto(url: string, options: Record<string, unknown>): Promise<void>;
  waitForSelector(selector: string, options: Record<string, unknown>): Promise<void>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string): Promise<void>;
  screenshot(options: Record<string, unknown>): Promise<void>;
  evaluate(fn: string | ((...args: unknown[]) => unknown), ...args: unknown[]): Promise<unknown>;
  $(selector: string): Promise<unknown>;
  $eval(
    selector: string,
    fn: (el: Element, ...args: unknown[]) => unknown,
    ...args: unknown[]
  ): Promise<unknown>;
  url(): string;
  close(): Promise<void>;
}

interface IConsoleMessage {
  type(): string;
  text(): string;
}

// 重命名类型以避免冲突
type PuppeteerBrowser = IBrowser;
type PuppeteerPage = IPage;
type PuppeteerConsoleMessage = IConsoleMessage;

/**
 * 无头测试配置
 */
export interface IHeadlessConfig {
  /** 是否启用无头测试 */
  enabled: boolean;
  /** 模块优先级 */
  priority: ModulePriority;
  /** 是否在无头模式运行 */
  headless: boolean;
  /** 是否拦截网络请求 */
  interceptNetwork: boolean;
  /** 浏览器启动超时时间(ms) */
  browserLaunchTimeout: number;
  /** 页面加载超时时间(ms) */
  pageLoadTimeout: number;
  /** 是否启用截图 */
  enableScreenshots: boolean;
  /** 截图保存目录 */
  screenshotDir?: string;
  /** 是否记录浏览器控制台日志 */
  logConsole: boolean;
  /** 自定义浏览器参数 */
  browserArgs?: string[];
  /** 执行前注入脚本 */
  preInjectedScripts?: string[];
  /** 最大并行测试数 */
  maxParallelTests: number;
  /** 测试完成回调 */
  onTestComplete?: (results: IHeadlessTestResult) => void;
}

// 默认无头测试配置
const DEFAULT_HEADLESS_CONFIG: IHeadlessConfig = {
  enabled: true,
  priority: ModulePriority.NORMAL,
  headless: true,
  interceptNetwork: true,
  browserLaunchTimeout: 30000,
  pageLoadTimeout: 30000,
  enableScreenshots: true,
  logConsole: true,
  maxParallelTests: 4,
};

/**
 * 测试步骤类型
 */
export enum TestStepType {
  /** 导航到URL */
  NAVIGATE = 'navigate',
  /** 点击元素 */
  CLICK = 'click',
  /** 输入文本 */
  TYPE = 'type',
  /** 等待元素 */
  WAIT_FOR = 'wait_for',
  /** 截图 */
  SCREENSHOT = 'screenshot',
  /** 执行JavaScript */
  EVALUATE = 'evaluate',
  /** 断言 */
  ASSERT = 'assert',
  /** 自定义步骤 */
  CUSTOM = 'custom',
}

/**
 * 测试断言类型
 */
export enum TestAssertType {
  /** 存在元素 */
  ELEMENT_EXISTS = 'element_exists',
  /** 不存在元素 */
  ELEMENT_NOT_EXISTS = 'element_not_exists',
  /** 元素包含文本 */
  ELEMENT_CONTAINS = 'element_contains',
  /** URL匹配 */
  URL_MATCHES = 'url_matches',
  /** 控制台无错误 */
  NO_CONSOLE_ERRORS = 'no_console_errors',
  /** 自定义断言 */
  CUSTOM = 'custom',
}

/**
 * 测试步骤接口
 */
export interface ITestStep {
  /** 步骤类型 */
  type: TestStepType;
  /** 步骤描述 */
  description: string;
  /** 选择器（如果适用） */
  selector?: string;
  /** 值（如果适用） */
  value?: string | any;
  /** 超时时间（如果适用） */
  timeout?: number;
  /** 断言类型（如果是断言步骤） */
  assertType?: TestAssertType;
  /** 截图名称（如果是截图步骤） */
  screenshotName?: string;
  /** 自定义执行函数 */
  customFn?: (page: PuppeteerPage) => Promise<any>;
}

/**
 * 页面测试用例
 */
export interface IPageTest {
  /** 测试ID */
  id: string;
  /** 测试名称 */
  name: string;
  /** 测试描述 */
  description: string;
  /** 起始URL */
  url: string;
  /** 设备类型仿真 */
  deviceType?: string;
  /** 测试步骤 */
  steps: ITestStep[];
  /** 测试超时时间(ms) */
  timeout?: number;
  /** 测试标签（用于分类） */
  tags?: string[];
  /** 是否注入安全监测脚本 */
  injectSafetyMonitor?: boolean;
}

/**
 * 测试结果状态
 */
export enum TestResultStatus {
  /** 通过 */
  PASSED = 'passed',
  /** 失败 */
  FAILED = 'failed',
  /** 错误 */
  ERROR = 'error',
  /** 跳过 */
  SKIPPED = 'skipped',
}

/**
 * 测试步骤结果
 */
export interface ITestStepResult {
  /** 步骤索引 */
  stepIndex: number;
  /** 步骤类型 */
  type: TestStepType;
  /** 结果状态 */
  status: TestResultStatus;
  /** 步骤描述 */
  description: string;
  /** 错误信息（如果失败） */
  error?: string;
  /** 错误堆栈（如果失败） */
  errorStack?: string;
  /** 执行时间(ms) */
  duration: number;
  /** 截图路径（如果有） */
  screenshotPath?: string;
  /** 断言结果（如果是断言步骤） */
  assertResult?: boolean;
  /** 步骤执行时控制台日志 */
  consoleLogs?: string[];
}

/**
 * 安全问题
 */
export interface ISecurityIssue {
  /** 问题类型 */
  type: string;
  /** 问题描述 */
  description: string;
  /** 严重程度 */
  severity: RuleSeverity;
  /** 问题类别 */
  category: RuleCategory;
  /** 发现步骤索引 */
  stepIndex?: number;
  /** URL */
  url?: string;
  /** 元素选择器（如果适用） */
  selector?: string;
  /** 问题详情 */
  details?: any;
}

/**
 * 测试结果
 */
export interface ITestResult {
  /** 测试ID */
  testId: string;
  /** 测试名称 */
  name: string;
  /** 结果状态 */
  status: TestResultStatus;
  /** 步骤结果 */
  steps: ITestStepResult[];
  /** 发现的安全问题 */
  securityIssues: ISecurityIssue[];
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 总执行时间(ms) */
  duration: number;
  /** 浏览器控制台日志 */
  consoleLogs: string[];
  /** 网络请求日志 */
  networkLogs: any[];
}

/**
 * 无头测试结果
 */
export interface IHeadlessTestResult {
  /** 测试结果列表 */
  results: ITestResult[];
  /** 总测试数 */
  totalTests: number;
  /** 通过测试数 */
  passedTests: number;
  /** 失败测试数 */
  failedTests: number;
  /** 错误测试数 */
  errorTests: number;
  /** 发现的安全问题总数 */
  totalSecurityIssues: number;
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime: number;
  /** 总执行时间(ms) */
  duration: number;
}

/**
 * 浏览器无头测试
 */
export class HeadlessBrowser {
  /** 模块ID */
  readonly id: string = 'headless-browser';

  /** 模块状态 */
  private status: ModuleStatus = ModuleStatus.IDLE;

  /** 模块配置 */
  private config: IHeadlessConfig;

  /** 浏览器实例 */
  private browser?: PuppeteerBrowser;

  /** 活跃测试数量 */
  private activeTests: number = 0;

  /** 测试队列 */
  private testQueue: IPageTest[] = [];

  /** 测试结果 */
  private testResults: ITestResult[] = [];

  /** 控制台日志缓存 */
  private consoleLogsMap: Map<PuppeteerPage, PuppeteerConsoleMessage[]> = new Map();

  /** 安全监测脚本 */
  private readonly safetyMonitorScript: string = `
    // 注入安全监测脚本
    (function() {
      const originalEval = window.eval;
      window.eval = function(code) {
        console.warn('[SECURITY] eval() called with:', code.substring(0, 100));
        return originalEval.apply(this, arguments);
      };

      // 监控DOM XSS向量
      const originalSetInnerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML').set;
      Object.defineProperty(Element.prototype, 'innerHTML', {
        set(value) {
          if (value && typeof value === 'string' && (value.includes('<script') || value.includes('javascript:'))) {
            console.error('[SECURITY] Potential XSS detected in innerHTML:', value.substring(0, 100));
          }
          return originalSetInnerHTML.call(this, value);
        }
      });

      // 监控敏感API
      const sensitiveAPIs = ['localStorage', 'sessionStorage', 'indexedDB', 'navigator.geolocation'];
      sensitiveAPIs.forEach(api => {
        const parts = api.split('.');
        let obj = window;
        for (let i = 0; i < parts.length - 1; i++) {
          obj = obj[parts[i]];
          if (!obj) return;
        }

        const prop = parts[parts.length - 1];
        const original = obj[prop];
        Object.defineProperty(obj, prop, {
          get() {
            console.warn('[SECURITY] Access to sensitive API:', api);
            return original;
          }
        });
      });

      // 报告所有混合内容
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeName === 'SCRIPT' || node.nodeName === 'IFRAME') {
              const src = node.src || '';
              if (src.startsWith('http:') && window.location.protocol === 'https:') {
                console.error('[SECURITY] Mixed content detected:', src);
              }
            }
          });
        });
      });
      
      observer.observe(document, { childList: true, subtree: true });

      console.log('[SECURITY] Safety monitoring initialized');
    })();
  `;

  /**
   * 构造函数
   * @param config 无头测试配置
   */
  constructor(config: Partial<IHeadlessConfig> = {}) {
    this.config = { ...DEFAULT_HEADLESS_CONFIG, ...config };
  }

  /**
   * 初始化浏览器
   */
  async init(): Promise<void> {
    if (this.status !== ModuleStatus.IDLE) {
      return;
    }

    this.status = ModuleStatus.INITIALIZING;

    try {
      // 确保puppeteer已安装
      if (!puppeteer) {
        throw new Error('Puppeteer is not installed. Please run: npm install puppeteer');
      }

      this.testQueue = [];
      this.testResults = [];
      this.consoleLogsMap.clear();
      this.activeTests = 0;

      this.status = ModuleStatus.READY;
    } catch (error) {
      this.status = ModuleStatus.ERROR;
      throw error;
    }
  }

  /**
   * 启动浏览器
   */
  async start(): Promise<void> {
    if (this.status !== ModuleStatus.READY) {
      throw new Error('Headless browser is not ready');
    }

    this.status = ModuleStatus.RUNNING;

    try {
      // 启动浏览器
      this.browser = await puppeteer.launch({
        headless: this.config.headless ? 'new' : false,
        timeout: this.config.browserLaunchTimeout,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          ...(this.config.browserArgs || []),
        ],
      });
    } catch (error) {
      this.status = ModuleStatus.ERROR;
      throw error;
    }
  }

  /**
   * 停止浏览器
   */
  async stop(): Promise<void> {
    if (this.status !== ModuleStatus.RUNNING) {
      return;
    }

    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = undefined;
      }

      this.status = ModuleStatus.STOPPED;
    } catch (error) {
      this.status = ModuleStatus.ERROR;
      throw error;
    }
  }

  /**
   * 获取模块状态
   */
  getStatus(): ModuleStatus {
    return this.status;
  }

  /**
   * 获取模块配置
   */
  getConfig(): IHeadlessConfig {
    return { ...this.config };
  }

  /**
   * 更新模块配置
   * @param config 新配置
   */
  updateConfig(config: Partial<IHeadlessConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 添加测试用例到队列
   * @param test 页面测试用例
   */
  addTest(test: IPageTest): void {
    this.testQueue.push(test);
    this.processQueue();
  }

  /**
   * 添加多个测试用例到队列
   * @param tests 页面测试用例列表
   */
  addTests(tests: IPageTest[]): void {
    this.testQueue.push(...tests);
    this.processQueue();
  }

  /**
   * 获取测试结果
   */
  getTestResults(): IHeadlessTestResult {
    const results = [...this.testResults];

    // 计算统计信息
    const totalTests = results.length;
    const passedTests = results.filter((r) => r.status === TestResultStatus.PASSED).length;
    const failedTests = results.filter((r) => r.status === TestResultStatus.FAILED).length;
    const errorTests = results.filter((r) => r.status === TestResultStatus.ERROR).length;

    // 计算安全问题总数
    const totalSecurityIssues = results.reduce(
      (sum, result) => sum + result.securityIssues.length,
      0
    );

    // 计算执行时间
    let startTime = Number.MAX_SAFE_INTEGER;
    let endTime = 0;

    results.forEach((result) => {
      startTime = Math.min(startTime, result.startTime);
      endTime = Math.max(endTime, result.endTime);
    });

    return {
      results,
      totalTests,
      passedTests,
      failedTests,
      errorTests,
      totalSecurityIssues,
      startTime,
      endTime,
      duration: endTime - startTime,
    };
  }

  /**
   * 清除测试结果
   */
  clearTestResults(): void {
    this.testResults = [];
  }

  /**
   * 处理测试队列
   */
  private async processQueue(): Promise<void> {
    if (this.status !== ModuleStatus.RUNNING || !this.browser) {
      return;
    }

    // 检查是否有可用槽位运行测试
    while (this.testQueue.length > 0 && this.activeTests < this.config.maxParallelTests) {
      const test = this.testQueue.shift();
      if (test) {
        this.activeTests++;
        this.runTest(test).finally(() => {
          this.activeTests--;
          this.processQueue();
        });
      }
    }
  }

  /**
   * 运行测试用例
   * @param test 页面测试用例
   */
  private async runTest(test: IPageTest): Promise<void> {
    if (!this.browser) {
      throw new Error('Browser is not initialized');
    }

    const startTime = Date.now();

    const testResult: ITestResult = {
      testId: test.id,
      name: test.name,
      status: TestResultStatus.PASSED,
      steps: [],
      securityIssues: [],
      startTime,
      endTime: 0,
      duration: 0,
      consoleLogs: [],
      networkLogs: [],
    };

    let page: PuppeteerPage | undefined;

    try {
      // 创建新页面
      page = await this.browser.newPage();

      // 设置页面超时
      await page.setDefaultTimeout(test.timeout || this.config.pageLoadTimeout);

      // 记录控制台日志
      if (this.config.logConsole) {
        this.consoleLogsMap.set(page, []);
        page.on('console', (message: PuppeteerConsoleMessage) => {
          const logs = this.consoleLogsMap.get(page!) || [];
          logs.push(message);
          this.consoleLogsMap.set(page!, logs);

          // 检查是否包含安全警告
          if (message.type() === 'warning' || message.type() === 'error') {
            const msgText = message.text();
            if (msgText.includes('[SECURITY]')) {
              this.detectSecurityIssue(msgText, testResult);
            }
          }
        });
      }

      // 拦截网络请求
      if (this.config.interceptNetwork) {
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          const url = request.url();
          testResult.networkLogs.push({
            url,
            method: request.method(),
            resourceType: request.resourceType(),
            headers: request.headers(),
          });

          // 检查是否为不安全的请求
          if (test.url.startsWith('https:') && url.startsWith('http:')) {
            testResult.securityIssues.push({
              type: 'mixed-content',
              description: `Mixed content detected: ${url}`,
              severity: RuleSeverity.HIGH,
              category: RuleCategory.SECURITY,
              url,
            });
          }

          request.continue();
        });
      }

      // 导航到起始URL
      const navigationStep: ITestStep = {
        type: TestStepType.NAVIGATE,
        description: `Navigate to ${test.url}`,
        value: test.url,
      };

      await this.executeStep(page, navigationStep, 0, testResult);

      // 注入安全监测脚本
      if (test.injectSafetyMonitor) {
        await page.evaluate(this.safetyMonitorScript);
      }

      // 执行测试步骤
      for (let i = 0; i < test.steps.length; i++) {
        const step = test.steps[i];
        await this.executeStep(page, step, i, testResult);

        // 如果有步骤失败，终止测试
        if (testResult.steps[i].status === TestResultStatus.FAILED) {
          testResult.status = TestResultStatus.FAILED;
          break;
        }
      }

      // 提取控制台日志
      if (this.config.logConsole && page) {
        const logs = this.consoleLogsMap.get(page) || [];
        testResult.consoleLogs = logs.map((log) => `${log.type()}: ${log.text()}`);
      }
    } catch (error: any) {
      testResult.status = TestResultStatus.ERROR;
      testResult.steps.push({
        stepIndex: testResult.steps.length,
        type: TestStepType.CUSTOM,
        status: TestResultStatus.ERROR,
        description: 'Unexpected error',
        error: error.message,
        errorStack: error.stack,
        duration: 0,
      });
    } finally {
      // 关闭页面
      if (page) {
        if (this.consoleLogsMap.has(page)) {
          this.consoleLogsMap.delete(page);
        }
        await page.close();
      }

      // 更新测试结果
      const endTime = Date.now();
      testResult.endTime = endTime;
      testResult.duration = endTime - startTime;

      // 添加到测试结果列表
      this.testResults.push(testResult);

      // 调用测试完成回调
      if (this.config.onTestComplete) {
        this.config.onTestComplete(this.getTestResults());
      }
    }
  }

  /**
   * 执行测试步骤
   * @param page 页面实例
   * @param step 测试步骤
   * @param index 步骤索引
   * @param testResult 测试结果
   */
  private async executeStep(
    page: PuppeteerPage,
    step: ITestStep,
    index: number,
    testResult: ITestResult
  ): Promise<void> {
    const stepResult: ITestStepResult = {
      stepIndex: index,
      type: step.type,
      status: TestResultStatus.PASSED,
      description: step.description,
      duration: 0,
    };

    const startTime = Date.now();

    try {
      switch (step.type) {
        case TestStepType.NAVIGATE:
          await page.goto(step.value as string, {
            timeout: step.timeout || this.config.pageLoadTimeout,
            waitUntil: 'networkidle2',
          });
          break;

        case TestStepType.CLICK:
          if (step.selector) {
            await page.waitForSelector(step.selector, { timeout: step.timeout });
            await page.click(step.selector);
          } else {
            throw new Error('Selector is required for click step');
          }
          break;

        case TestStepType.TYPE:
          if (step.selector && step.value) {
            await page.waitForSelector(step.selector, { timeout: step.timeout });
            await page.type(step.selector, step.value as string);
          } else {
            throw new Error('Selector and value are required for type step');
          }
          break;

        case TestStepType.WAIT_FOR:
          if (step.selector) {
            await page.waitForSelector(step.selector, { timeout: step.timeout });
          } else {
            throw new Error('Selector is required for wait_for step');
          }
          break;

        case TestStepType.SCREENSHOT:
          if (this.config.enableScreenshots) {
            const fileName = step.screenshotName || `test-${testResult.testId}-step-${index}.png`;
            const path = `${this.config.screenshotDir || './screenshots'}/${fileName}`;
            await page.screenshot({ path, fullPage: true });
            stepResult.screenshotPath = path;
          }
          break;

        case TestStepType.EVALUATE:
          await page.evaluate(step.value as string);
          break;

        case TestStepType.ASSERT:
          if (!step.assertType) {
            throw new Error('Assert type is required for assert step');
          }

          switch (step.assertType) {
            case TestAssertType.ELEMENT_EXISTS:
              if (step.selector) {
                const element = await page.$(step.selector);
                stepResult.assertResult = !!element;
                if (!element) {
                  throw new Error(`Element not found: ${step.selector}`);
                }
              } else {
                throw new Error('Selector is required for element_exists assertion');
              }
              break;

            case TestAssertType.ELEMENT_NOT_EXISTS:
              if (step.selector) {
                const element = await page.$(step.selector);
                stepResult.assertResult = !element;
                if (element) {
                  throw new Error(`Element found but should not exist: ${step.selector}`);
                }
              } else {
                throw new Error('Selector is required for element_not_exists assertion');
              }
              break;

            case TestAssertType.ELEMENT_CONTAINS:
              if (step.selector && step.value) {
                const textContent = await page.$eval(
                  step.selector,
                  (el, value) => el.textContent?.includes(value),
                  step.value
                );
                stepResult.assertResult = !!textContent;
                if (!textContent) {
                  throw new Error(`Element does not contain text: ${step.value}`);
                }
              } else {
                throw new Error('Selector and value are required for element_contains assertion');
              }
              break;

            case TestAssertType.URL_MATCHES:
              if (step.value) {
                const url = page.url();
                const matches = url.includes(step.value as string);
                stepResult.assertResult = matches;
                if (!matches) {
                  throw new Error(`URL does not match: ${url} vs ${step.value}`);
                }
              } else {
                throw new Error('Value is required for url_matches assertion');
              }
              break;

            case TestAssertType.NO_CONSOLE_ERRORS:
              if (this.config.logConsole) {
                const logs = this.consoleLogsMap.get(page) || [];
                const errors = logs.filter((log) => log.type() === 'error');
                stepResult.assertResult = errors.length === 0;
                if (errors.length > 0) {
                  throw new Error(`Console errors found: ${errors.length}`);
                }
              }
              break;

            case TestAssertType.CUSTOM:
              if (step.customFn) {
                const result = await step.customFn(page);
                stepResult.assertResult = !!result;
                if (!result) {
                  throw new Error('Custom assertion failed');
                }
              } else {
                throw new Error('Custom function is required for custom assertion');
              }
              break;
          }
          break;

        case TestStepType.CUSTOM:
          if (step.customFn) {
            await step.customFn(page);
          } else {
            throw new Error('Custom function is required for custom step');
          }
          break;
      }
    } catch (error: any) {
      stepResult.status = TestResultStatus.FAILED;
      stepResult.error = error.message;
      stepResult.errorStack = error.stack;

      // 如果配置了截图，捕获失败步骤的截图
      if (this.config.enableScreenshots) {
        try {
          const fileName = `error-${testResult.testId}-step-${index}.png`;
          const path = `${this.config.screenshotDir || './screenshots'}/${fileName}`;
          await page.screenshot({ path, fullPage: true });
          stepResult.screenshotPath = path;
        } catch (screenshotError) {
          // 截图失败不影响测试结果
          console.error('Failed to capture error screenshot:', screenshotError);
        }
      }
    } finally {
      stepResult.duration = Date.now() - startTime;
      testResult.steps.push(stepResult);
    }
  }

  /**
   * 从控制台消息检测安全问题
   * @param message 控制台消息
   * @param testResult 测试结果
   */
  private detectSecurityIssue(message: string, testResult: ITestResult): void {
    // 提取[SECURITY]标记后的内容
    const match = message.match(/\[SECURITY\]\s+(.*?):/);
    if (!match) return;

    const issueType = match[1].toLowerCase().trim();

    let severity: RuleSeverity;
    const category: RuleCategory = RuleCategory.SECURITY;

    // 根据消息类型确定严重程度
    switch (issueType) {
      case 'potential xss detected':
        severity = RuleSeverity.CRITICAL;
        break;
      case 'mixed content detected':
        severity = RuleSeverity.HIGH;
        break;
      case 'eval() called with':
        severity = RuleSeverity.HIGH;
        break;
      case 'access to sensitive api':
        severity = RuleSeverity.MEDIUM;
        break;
      default:
        severity = RuleSeverity.LOW;
    }

    // 创建安全问题记录
    testResult.securityIssues.push({
      type: issueType,
      description: message,
      severity,
      category,
      stepIndex: testResult.steps.length > 0 ? testResult.steps.length - 1 : undefined,
      url: undefined, // 在实际实现中可以从page.url()获取
      details: message,
    });
  }
}

/**
 * 创建浏览器无头测试实例
 * @param config 配置
 */
export function createHeadlessBrowser(config?: Partial<IHeadlessConfig>): HeadlessBrowser {
  return new HeadlessBrowser(config);
}
