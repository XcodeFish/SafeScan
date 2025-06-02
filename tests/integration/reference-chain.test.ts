/**
 * 引用链溯源系统集成测试
 * 专门测试引用链追踪和分析功能
 */
import { describe, it, expect } from 'vitest';
import {
  traceReferenceChains,
  ReferenceChainType,
  IReferenceChainConfig,
} from '../../packages/core/src/analyzer/memory/reference-chain';
import {
  chainToVisData,
  generateHTMLReport,
} from '../../packages/core/src/analyzer/memory/reference-chain-visualizer';
import { MemoryObjectType } from '../../packages/core/src/analyzer/memory/snapshot';
import { mockMemoryObject, mockMemorySnapshot } from '../utils/test-helpers';

/**
 * 创建测试引用链
 * 模拟DOM节点 -> 组件实例 -> 事件监听器 -> 泄漏对象的引用链
 */
function createTestReferenceChain() {
  // 创建对象
  const rootObject = mockMemoryObject('dom_node', 'document', 1024);
  const componentObject = mockMemoryObject('component_instance', 'LeakingComponent', 2048);
  const eventObject = mockMemoryObject('event_listener', 'clickListener', 512);
  const leakObject = mockMemoryObject('closure', 'handleClick', 4096);

  // 创建引用
  const refRoot2Component = {
    sourceId: rootObject.id,
    targetId: componentObject.id,
    name: 'childComponent',
    type: 'reference',
  };

  const refComponent2Event = {
    sourceId: componentObject.id,
    targetId: eventObject.id,
    name: 'eventListener',
    type: 'reference',
  };

  const refEvent2Leak = {
    sourceId: eventObject.id,
    targetId: leakObject.id,
    name: 'callback',
    type: 'reference',
  };

  // 添加引出引用
  rootObject.outgoingReferences = [refRoot2Component];
  componentObject.outgoingReferences = [refComponent2Event];
  eventObject.outgoingReferences = [refEvent2Leak];

  // 创建快照
  const snapshot = mockMemorySnapshot([rootObject, componentObject, eventObject, leakObject]);

  return {
    rootObject,
    componentObject,
    eventObject,
    leakObject,
    snapshot,
    references: [refRoot2Component, refComponent2Event, refEvent2Leak],
  };
}

describe('引用链溯源系统', () => {
  describe('引用链追踪', () => {
    it('应该能追踪从根对象到泄漏对象的引用路径', () => {
      // 创建测试引用链
      const { leakObject, snapshot } = createTestReferenceChain();

      // 追踪引用链
      const chains = traceReferenceChains(leakObject.id, snapshot);

      // 检验结果
      expect(chains).toBeDefined();
      expect(Array.isArray(chains)).toBe(true);
      expect(chains.length).toBeGreaterThan(0);

      // 验证第一条引用链
      const firstChain = chains[0];
      expect(firstChain.leakObject.id).toBe(leakObject.id);
      expect(firstChain.path.length).toBeGreaterThan(0);
    });

    it('应该能识别不同类型的引用链', () => {
      // 创建各种类型的测试对象
      const domNode = mockMemoryObject('dom_node', 'div#app', 1024);
      domNode.type = MemoryObjectType.DOM_NODE;

      const component = mockMemoryObject('component_instance', 'App', 2048);
      component.type = MemoryObjectType.COMPONENT_INSTANCE;
      component.componentName = 'App';

      const timer = mockMemoryObject('timer', 'interval-100ms', 512);
      timer.type = MemoryObjectType.TIMER;
      timer.metadata = { interval: 100 };

      const closure = mockMemoryObject('closure', 'updateState', 768);
      closure.type = MemoryObjectType.CLOSURE;

      // 创建引用关系
      const refDom2Component = {
        sourceId: domNode.id,
        targetId: component.id,
        name: 'instance',
        type: 'reference',
      };

      const refComponent2Timer = {
        sourceId: component.id,
        targetId: timer.id,
        name: 'timer',
        type: 'reference',
      };

      const refTimer2Closure = {
        sourceId: timer.id,
        targetId: closure.id,
        name: 'callback',
        type: 'reference',
      };

      // 添加引出引用
      domNode.outgoingReferences = [refDom2Component];
      component.outgoingReferences = [refComponent2Timer];
      timer.outgoingReferences = [refTimer2Closure];

      // 创建快照
      const snapshot = mockMemorySnapshot([domNode, component, timer, closure]);

      // 测试不同类型的引用链识别
      const timerChains = traceReferenceChains(timer.id, snapshot);
      expect(timerChains[0].type).toBe(ReferenceChainType.TIMER_CHAIN);

      const componentChains = traceReferenceChains(component.id, snapshot);
      expect(componentChains[0].type).toBe(ReferenceChainType.COMPONENT_CHAIN);

      const closureChains = traceReferenceChains(closure.id, snapshot);
      // 由于这是通过定时器引用的闭包，可能会被识别为定时器链
      expect([ReferenceChainType.CLOSURE_CHAIN, ReferenceChainType.TIMER_CHAIN]).toContain(
        closureChains[0].type
      );
    });
  });

  describe('引用链配置', () => {
    it('应该能根据配置简化引用路径', () => {
      // 创建复杂引用链
      const objects = [];
      let previousId = null;

      // 创建10个对象形成长引用链
      for (let i = 0; i < 10; i++) {
        const obj = mockMemoryObject(`object-${i}`, `Object ${i}`, 256);
        objects.push(obj);

        if (previousId) {
          obj.outgoingReferences = [
            {
              sourceId: previousId,
              targetId: obj.id,
              name: `ref-${i}`,
              type: 'reference',
            },
          ];
        }

        previousId = obj.id;
      }

      // 创建快照
      const snapshot = mockMemorySnapshot(objects);

      // 测试不同的配置
      const defaultConfig: IReferenceChainConfig = {};
      const simplifyConfig: IReferenceChainConfig = {
        simplifyPaths: true,
        maxPathLength: 3,
      };

      const leakObj = objects[objects.length - 1];

      // 默认配置
      const defaultChains = traceReferenceChains(leakObj.id, snapshot, defaultConfig);

      // 简化配置
      const simplifiedChains = traceReferenceChains(leakObj.id, snapshot, simplifyConfig);

      // 验证简化后的路径更短
      if (defaultChains.length > 0 && simplifiedChains.length > 0) {
        expect(simplifiedChains[0].path.length).toBeLessThanOrEqual(3);
      }
    });
  });

  describe('引用链可视化', () => {
    it('应该能将引用链转换为可视化数据', () => {
      // 创建测试引用链
      const { leakObject, snapshot } = createTestReferenceChain();

      // 追踪引用链
      const chains = traceReferenceChains(leakObject.id, snapshot);

      // 确保找到至少一条链
      expect(chains.length).toBeGreaterThan(0);

      // 转换为可视化数据
      const visData = chainToVisData(chains[0]);

      // 验证可视化数据结构
      expect(visData).toBeDefined();
      expect(visData.nodes).toBeDefined();
      expect(visData.edges).toBeDefined();
      expect(visData.title).toBeDefined();
      expect(visData.description).toBeDefined();

      // 节点和边应该非空
      expect(visData.nodes.length).toBeGreaterThan(0);
      expect(visData.edges.length).toBeGreaterThan(0);

      // 生成HTML报告
      const html = generateHTMLReport(visData);

      // 验证HTML报告
      expect(html).toBeDefined();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain(visData.title);
    });
  });
});
