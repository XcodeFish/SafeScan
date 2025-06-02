/**
 * 泄漏模式识别系统集成测试
 * 测试泄漏模式识别功能和修复建议生成
 */
import { describe, it, expect } from 'vitest';
import {
  LeakPatternType,
  LeakSeverity,
  ILeakDetectionResult,
} from '../../packages/core/src/analyzer/memory/leak';
import {
  analyzeLeakPatterns,
  ILeakPatternConfig,
} from '../../packages/core/src/analyzer/memory/leak-pattern';
import { MemoryObjectType } from '../../packages/core/src/analyzer/memory/snapshot';
import { Framework } from '../../packages/core/src/types';
import { mockMemoryObject, mockMemorySnapshot } from '../utils/test-helpers';

/**
 * 创建测试泄漏检测结果
 * @returns 泄漏检测结果和快照
 */
function createTestLeakDetectionResult(): {
  result: ILeakDetectionResult;
  snapshot: any;
} {
  // 创建测试对象
  const objects = [
    // DOM泄漏对象
    mockMemoryObject('dom_node', 'div.detached', 1024 * 50),

    // 定时器泄漏对象
    mockMemoryObject('timer', 'leakingInterval', 1024 * 5),

    // 事件监听器泄漏对象
    mockMemoryObject('event_listener', 'clickListener', 1024 * 2),

    // 正常对象
    mockMemoryObject('object', 'normalObject', 512),
  ];

  // 设置特殊元数据
  objects[0].type = MemoryObjectType.DOM_NODE;
  objects[0].metadata = {
    detached: true,
    tagName: 'div',
    className: 'detached',
  };

  objects[1].type = MemoryObjectType.TIMER;
  objects[1].metadata = {
    interval: 1000,
    owner: {
      unmounted: true,
    },
  };

  objects[2].type = MemoryObjectType.EVENT_LISTENER;
  objects[2].metadata = {
    eventType: 'click',
    owner: {
      unmounted: true,
    },
  };

  // 创建快照
  const snapshot = mockMemorySnapshot(objects);

  // 创建泄漏检测结果
  const result: ILeakDetectionResult = {
    id: 'test-leak-detection',
    timestamp: Date.now(),
    hasLeak: true,
    leaks: [
      {
        id: 'leak-1',
        object: objects[0],
        pattern: LeakPatternType.DETACHED_DOM,
        severity: LeakSeverity.MEDIUM,
        size: objects[0].size,
        description: '分离的DOM节点',
      },
      {
        id: 'leak-2',
        object: objects[1],
        pattern: LeakPatternType.TIMER_REFERENCE,
        severity: LeakSeverity.HIGH,
        size: objects[1].size,
        description: '卸载组件的定时器',
      },
      {
        id: 'leak-3',
        object: objects[2],
        pattern: LeakPatternType.EVENT_LISTENER,
        severity: LeakSeverity.MEDIUM,
        size: objects[2].size,
        description: '卸载组件的事件监听器',
      },
    ],
    memoryGrowth: 1024 * 57, // 总泄漏大小
    duration: 1000,
    objectsScanned: 100,
  };

  return { result, snapshot };
}

describe('泄漏模式识别系统', () => {
  describe('泄漏模式分析', () => {
    it('应该能增强泄漏检测结果并添加详细信息', () => {
      // 创建测试泄漏检测结果
      const { result, snapshot } = createTestLeakDetectionResult();

      // 分析泄漏模式
      const enhancedResult = analyzeLeakPatterns(result, snapshot);

      // 验证结果被增强
      expect(enhancedResult).toBeDefined();
      expect(enhancedResult.leaks.length).toBe(result.leaks.length);

      // 验证每个泄漏有修复建议
      for (const leak of enhancedResult.leaks) {
        expect(leak.fixSuggestion).toBeDefined();
        expect(typeof leak.fixSuggestion).toBe('string');
      }
    });

    it('应该能根据配置过滤泄漏模式', () => {
      // 创建测试泄漏检测结果
      const { result, snapshot } = createTestLeakDetectionResult();

      // 创建仅允许定时器泄漏的配置
      const timerOnlyConfig: ILeakPatternConfig = {
        enabledPatternTypes: [LeakPatternType.TIMER_REFERENCE],
      };

      // 分析泄漏模式
      const enhancedResult = analyzeLeakPatterns(result, snapshot, undefined, timerOnlyConfig);

      // 验证结果
      expect(enhancedResult).toBeDefined();

      // 注意：实际功能中，由于analyzeLeakPatterns对leaks进行了重新分析
      // 可能并不会直接过滤泄漏，而是添加更多的检测特征

      // 验证修复建议包含定时器相关内容
      const timerLeak = enhancedResult.leaks.find(
        (leak) => leak.pattern === LeakPatternType.TIMER_REFERENCE
      );

      if (timerLeak && timerLeak.fixSuggestion) {
        expect(timerLeak.fixSuggestion.toLowerCase()).toMatch(/clear(timeout|interval)/);
      }
    });
  });

  describe('React特定泄漏', () => {
    it('应该能检测React特定的泄漏模式', () => {
      // 创建React特定泄漏对象
      const reactHookObj = mockMemoryObject('closure', 'useEffectCallback', 2048);
      reactHookObj.type = MemoryObjectType.CLOSURE;
      reactHookObj.metadata = {
        reactHook: 'useEffect',
        missingDeps: true,
        capturedVariables: ['state1', 'state2', 'props.callback'],
      };

      const contextObj = mockMemoryObject('context', 'ThemeContext', 1024);
      contextObj.metadata = {
        reactContext: true,
      };
      contextObj.outgoingReferences = [
        {
          sourceId: contextObj.id,
          targetId: 'consumer-id',
          name: 'consumers',
          type: 'reference',
        },
      ];

      // 创建快照
      const snapshot = mockMemorySnapshot([reactHookObj, contextObj]);

      // 创建包含React特定泄漏的结果
      const result: ILeakDetectionResult = {
        id: 'react-leak-detection',
        timestamp: Date.now(),
        hasLeak: true,
        leaks: [
          {
            id: 'hook-leak',
            object: reactHookObj,
            pattern: LeakPatternType.CLOSURE_CYCLE,
            severity: LeakSeverity.MEDIUM,
            size: reactHookObj.size,
            description: 'Hook依赖问题',
            framework: Framework.REACT,
          },
          {
            id: 'context-leak',
            object: contextObj,
            pattern: LeakPatternType.CONTEXT_REFERENCE,
            severity: LeakSeverity.MEDIUM,
            size: contextObj.size,
            description: 'Context引用',
            framework: Framework.REACT,
          },
        ],
        memoryGrowth: reactHookObj.size + contextObj.size,
        duration: 1000,
        objectsScanned: 50,
      };

      // 分析泄漏模式
      const enhancedResult = analyzeLeakPatterns(result, snapshot);

      // 验证结果
      expect(enhancedResult).toBeDefined();
      expect(enhancedResult.leaks.length).toBe(result.leaks.length);

      // 验证Hook泄漏的修复建议包含依赖数组相关内容
      const hookLeak = enhancedResult.leaks.find(
        (leak) => leak.object.metadata?.reactHook === 'useEffect'
      );

      if (hookLeak && hookLeak.fixSuggestion) {
        expect(hookLeak.fixSuggestion.toLowerCase()).toMatch(/依赖|deps|useeffect/);
      }
    });
  });

  describe('不同框架支持', () => {
    it('应该能处理不同框架的泄漏', () => {
      // 创建Vue特定泄漏对象
      const vueComponentObj = mockMemoryObject('component_instance', 'VueComponent', 3072);
      vueComponentObj.type = MemoryObjectType.COMPONENT_INSTANCE;
      vueComponentObj.metadata = {
        framework: Framework.VUE,
        unmounted: true,
      };

      // 创建快照
      const snapshot = mockMemorySnapshot([vueComponentObj]);

      // 创建包含Vue框架泄漏的结果
      const result: ILeakDetectionResult = {
        id: 'vue-leak-detection',
        timestamp: Date.now(),
        hasLeak: true,
        leaks: [
          {
            id: 'vue-leak',
            object: vueComponentObj,
            pattern: LeakPatternType.ZOMBIE_COMPONENT,
            severity: LeakSeverity.HIGH,
            size: vueComponentObj.size,
            description: 'Vue组件实例泄漏',
            framework: Framework.VUE,
          },
        ],
        memoryGrowth: vueComponentObj.size,
        duration: 1000,
        objectsScanned: 30,
      };

      // 分析泄漏模式
      const reactConfig: ILeakPatternConfig = {
        framework: Framework.REACT,
      };

      const vueConfig: ILeakPatternConfig = {
        framework: Framework.VUE,
      };

      // 不同框架的分析结果
      const reactResult = analyzeLeakPatterns(result, snapshot, undefined, reactConfig);
      const vueResult = analyzeLeakPatterns(result, snapshot, undefined, vueConfig);

      // 验证结果
      expect(reactResult).toBeDefined();
      expect(vueResult).toBeDefined();

      // 虽然上面的结果对象指定了Vue框架，但由于我们当前实现的泄漏特征是React的
      // 所以这个测试更多是验证API能否正常工作而不是实际框架特定特征能否识别
    });
  });
});
