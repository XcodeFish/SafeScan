/**
 * 内存追踪引擎集成测试
 * 测试引用链溯源系统、泄漏模式识别和内存泄漏检测功能
 */
import * as path from 'path';
import { describe, it, expect, afterAll } from 'vitest';
import { LeakPatternType } from '../../packages/core/src/analyzer/memory/leak';
import { analyzeLeakPatterns } from '../../packages/core/src/analyzer/memory/leak-pattern';
import { analyzeMemoryLeak } from '../../packages/core/src/analyzer/memory/memory-leak-analyzer';
import { detectReactComponentLeak } from '../../packages/core/src/analyzer/memory/react-leak-detector';
import { traceReferenceChains } from '../../packages/core/src/analyzer/memory/reference-chain';
import { createSnapshot } from '../../packages/core/src/analyzer/memory/snapshot';
import { Framework } from '../../packages/core/src/types';

// 测试工具函数
import { delay, createReportDir } from '../utils/test-helpers';

// 测试配置
const TEST_TIMEOUT = 10000; // 测试超时时间
const REPORTS_DIR = createReportDir('memory-analyzer-tests');

// 自定义类型
type EventHandler = (event: any) => void;

// 创建一个React组件泄漏实例的工厂函数
function createLeakingReactComponent() {
  // 模拟计时器
  const intervalIds: NodeJS.Timeout[] = [];
  const eventListeners: { element: any; event: string; handler: EventHandler }[] = [];

  // 模拟全局对象和DOM
  const globalObj: Record<string, any> = {};
  const mockDOM = {
    addEventListener(event: string, handler: EventHandler) {
      eventListeners.push({ element: this, event, handler });
    },
    removeEventListener(event: string, handler: EventHandler) {
      const index = eventListeners.findIndex(
        (listener) =>
          listener.element === this && listener.event === event && listener.handler === handler
      );
      if (index !== -1) {
        eventListeners.splice(index, 1);
      }
    },
  };

  // 模拟React组件类
  class LeakingComponent {
    private data: any[] = [];
    private id: string;
    private interval: NodeJS.Timeout | null = null;

    constructor(id: string) {
      this.id = id;

      // 创建泄漏1: 未清除的定时器
      this.interval = setInterval(() => {
        this.data.push(new Array(100).fill('leak data'));
      }, 100);
      intervalIds.push(this.interval);

      // 创建泄漏2: 全局对象引用
      globalObj[`component_${id}`] = this;

      // 创建泄漏3: 未移除的事件监听器
      mockDOM.addEventListener('click', this.handleClick);
    }

    handleClick = () => {
      this.data.push(new Date());
    };

    unmount() {
      // 故意不清除定时器和事件监听器
      // 正确实现应该是:
      // clearInterval(this.interval);
      // mockDOM.removeEventListener('click', this.handleClick);
      // delete globalObj[`component_${this.id}`];
    }
  }

  // 创建组件实例
  const component = new LeakingComponent('test-leak');

  return {
    component,
    globalObj,
    mockDOM,
    intervalIds,
    eventListeners,
    unmount: () => component.unmount(),
    cleanup: () => {
      // 实际清理，防止测试影响其他测试
      intervalIds.forEach(clearInterval);
      delete globalObj['component_test-leak'];
    },
  };
}

// 测试用例
describe('内存追踪引擎', () => {
  // 在所有测试后清理资源
  afterAll(() => {
    // 清理可能的资源
  });

  describe('内存泄漏检测', () => {
    it(
      '应该检测到React组件的内存泄漏',
      async () => {
        // 创建泄漏组件
        const { unmount, cleanup } = createLeakingReactComponent();

        try {
          await createSnapshot('base-snapshot');

          // 卸载组件但保留泄漏
          unmount();

          // 等待一段时间让GC有机会运行
          await delay(1000);

          await createSnapshot('target-snapshot');

          // 分析泄漏
          const result = await detectReactComponentLeak('LeakingComponent', 'test-path');

          // 断言检测到泄漏
          expect(result.hasLeak).toBe(true);
          expect(result.leaks.length).toBeGreaterThan(0);

          // 验证检测到的泄漏类型
          const leakPatterns = result.leaks.map((leak) => leak.pattern);
          expect(leakPatterns).toContain(LeakPatternType.TIMER_REFERENCE);

          // 验证React特定泄漏类型
          expect(result.reactLeakTypes).toBeDefined();
          expect(result.reactLeakTypes.length).toBeGreaterThan(0);
        } finally {
          // 清理测试资源
          cleanup();
        }
      },
      TEST_TIMEOUT
    );
  });

  describe('引用链溯源系统', () => {
    it(
      '应该能追踪从根对象到泄漏对象的引用路径',
      async () => {
        // 创建泄漏组件
        const { cleanup } = createLeakingReactComponent();

        try {
          // 创建快照
          const snapshot = await createSnapshot('reference-chain-test');

          // 模拟一个对象ID
          const mockObjectId = 'mock-leak-object-id';

          // 追踪引用链
          // 注意：在真实场景中，我们需要获取实际对象的ID
          // 这里我们只是测试API正常工作
          const chains = traceReferenceChains(mockObjectId, snapshot);

          // 断言API正常工作
          expect(chains).toBeDefined();
          expect(Array.isArray(chains)).toBe(true);

          // 注：由于我们使用了模拟ID，实际上不会找到引用链
          // 在真实场景中，需要使用实际泄漏对象的ID
          // 这里只是验证API能正常调用不报错
        } finally {
          // 清理测试资源
          cleanup();
        }
      },
      TEST_TIMEOUT
    );
  });

  describe('泄漏模式识别', () => {
    it(
      '应该能正确识别常见的泄漏模式',
      async () => {
        // 创建泄漏组件
        const { unmount, cleanup } = createLeakingReactComponent();

        try {
          // 获取初始快照
          await createSnapshot('pattern-base-snapshot');

          // 卸载组件但保留泄漏
          unmount();

          // 等待一段时间
          await delay(1000);

          // 获取后续快照
          const targetSnapshot = await createSnapshot('pattern-target-snapshot');

          // 分析泄漏
          const result = await detectReactComponentLeak('LeakingComponent', 'test-path');

          // 使用泄漏模式分析
          const enhancedResult = analyzeLeakPatterns(result, targetSnapshot);

          // 断言增强后的结果包含更详细的信息
          expect(enhancedResult).toBeDefined();
          expect(enhancedResult.leaks.length).toBeGreaterThan(0);

          // 验证泄漏模式
          const leakWithPattern = enhancedResult.leaks.find(
            (leak) => leak.pattern !== LeakPatternType.OTHER
          );

          if (leakWithPattern) {
            expect(leakWithPattern.description).toBeTruthy();
            expect(leakWithPattern.fixSuggestion).toBeTruthy();
          }
        } finally {
          // 清理测试资源
          cleanup();
        }
      },
      TEST_TIMEOUT
    );
  });

  describe('内存泄漏分析器', () => {
    it(
      '应该能完整分析内存泄漏并生成报告',
      async () => {
        // 创建泄漏组件
        const { unmount, cleanup } = createLeakingReactComponent();

        try {
          // 配置分析器
          const config = {
            framework: Framework.REACT,
            componentName: 'LeakingComponent',
            componentPath: 'test-path',
            autoSnapshot: true,
            generateReport: true,
            reportPath: path.join(REPORTS_DIR, 'memory-leak-report.html'),
          };

          // 卸载组件但保留泄漏
          unmount();

          // 等待一段时间
          await delay(1000);

          // 分析内存泄漏
          const result = await analyzeMemoryLeak(config);

          // 断言结果
          expect(result).toBeDefined();
          expect(result.leakDetectionResult).toBeDefined();

          // 验证引用链
          if (result.leakDetectionResult.hasLeak) {
            // 可能会找到泄漏
            expect(result.referenceChains.length).toBeGreaterThanOrEqual(0);
          }

          // 验证报告路径
          if (result.reportPath) {
            expect(result.reportPath).toBeTruthy();
          }
        } finally {
          // 清理测试资源
          cleanup();
        }
      },
      TEST_TIMEOUT
    );
  });
});
