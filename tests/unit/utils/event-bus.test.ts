import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../../../packages/core/src/utils/event-bus';

describe('EventBus', () => {
  let eventBus: EventBus;

  beforeEach(() => {
    // 重置单例
    // @ts-expect-error 访问私有属性进行测试
    EventBus.instance = undefined;
    eventBus = EventBus.getInstance();
  });

  it('应该创建单例实例', () => {
    const instance1 = EventBus.getInstance();
    const instance2 = EventBus.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('应该注册和触发事件处理程序', () => {
    const handler = vi.fn();
    const eventName = 'test-event';
    const payload = { data: 'test-data' };

    eventBus.on(eventName, handler);
    eventBus.emit(eventName, payload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('应该通过返回的函数取消订阅事件', () => {
    const handler = vi.fn();
    const eventName = 'test-event';

    const unsubscribe = eventBus.on(eventName, handler);
    unsubscribe();
    eventBus.emit(eventName, {});

    expect(handler).not.toHaveBeenCalled();
  });

  it('应该通过 off 方法取消订阅事件', () => {
    const handler = vi.fn();
    const eventName = 'test-event';

    eventBus.on(eventName, handler);
    eventBus.off(eventName, handler);
    eventBus.emit(eventName, {});

    expect(handler).not.toHaveBeenCalled();
  });

  it('应该通过 off 方法取消所有特定事件的订阅', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const eventName = 'test-event';

    eventBus.on(eventName, handler1);
    eventBus.on(eventName, handler2);
    eventBus.off(eventName);
    eventBus.emit(eventName, {});

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('应该通过 clear 方法取消所有事件的订阅', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const eventName1 = 'test-event-1';
    const eventName2 = 'test-event-2';

    eventBus.on(eventName1, handler1);
    eventBus.on(eventName2, handler2);
    eventBus.clear();
    eventBus.emit(eventName1, {});
    eventBus.emit(eventName2, {});

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('应该通过 clear 方法取消特定事件的订阅', () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const eventName1 = 'test-event-1';
    const eventName2 = 'test-event-2';

    eventBus.on(eventName1, handler1);
    eventBus.on(eventName2, handler2);
    eventBus.clear(eventName1);
    eventBus.emit(eventName1, {});
    eventBus.emit(eventName2, {});

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('应该处理 once 事件', () => {
    const handler = vi.fn();
    const eventName = 'test-event';
    const payload = { data: 'test-data' };

    eventBus.once(eventName, handler);
    eventBus.emit(eventName, payload);
    eventBus.emit(eventName, payload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('应该通过返回的函数取消 once 事件订阅', () => {
    const handler = vi.fn();
    const eventName = 'test-event';

    const unsubscribe = eventBus.once(eventName, handler);
    unsubscribe();
    eventBus.emit(eventName, {});

    expect(handler).not.toHaveBeenCalled();
  });

  it('应该处理事件处理程序中的错误', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const eventName = 'test-event';
    const error = new Error('测试错误');

    eventBus.on(eventName, () => {
      throw error;
    });

    // 不应抛出错误
    expect(() => eventBus.emit(eventName, {})).not.toThrow();

    // 应该记录错误
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Error in event handler for ${eventName}:`),
      error
    );

    consoleErrorSpy.mockRestore();
  });
});
