/**
 * 事件总线实现模块间通信
 */
export type EventHandler<T = any> = (payload: T) => void;

export interface IEventBus {
  on<T>(event: string, handler: EventHandler<T>): () => void;
  once<T>(event: string, handler: EventHandler<T>): () => void;
  emit<T>(event: string, payload: T): void;
  off(event: string, handler?: EventHandler): void;
  clear(event?: string): void;
}

/**
 * 事件总线实现
 */
export class EventBus implements IEventBus {
  private handlers: Map<string, Set<EventHandler>>;
  private onceHandlers: Map<string, Set<EventHandler>>;
  private static instance: EventBus;

  private constructor() {
    this.handlers = new Map();
    this.onceHandlers = new Map();
  }

  /**
   * 获取事件总线单例
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * 监听事件
   * @param event 事件名称
   * @param handler 处理函数
   * @returns 取消订阅函数
   */
  public on<T>(event: string, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // 返回取消订阅函数
    return () => {
      this.off(event, handler);
    };
  }

  /**
   * 监听事件一次
   * @param event 事件名称
   * @param handler 处理函数
   * @returns 取消订阅函数
   */
  public once<T>(event: string, handler: EventHandler<T>): () => void {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set());
    }
    this.onceHandlers.get(event)!.add(handler);

    // 返回取消订阅函数
    return () => {
      this.off(event, handler);
    };
  }

  /**
   * 触发事件
   * @param event 事件名称
   * @param payload 事件数据
   */
  public emit<T>(event: string, payload: T): void {
    // 处理普通事件
    if (this.handlers.has(event)) {
      this.handlers.get(event)!.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }

    // 处理一次性事件
    if (this.onceHandlers.has(event)) {
      const handlers = this.onceHandlers.get(event)!;
      this.onceHandlers.delete(event);
      handlers.forEach((handler) => {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in once event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * 取消事件监听
   * @param event 事件名称
   * @param handler 处理函数(可选)，不提供时移除该事件所有处理函数
   */
  public off(event: string, handler?: EventHandler): void {
    // 移除普通事件处理函数
    if (this.handlers.has(event)) {
      if (handler) {
        this.handlers.get(event)!.delete(handler);
        // 如果没有处理函数了，移除整个事件
        if (this.handlers.get(event)!.size === 0) {
          this.handlers.delete(event);
        }
      } else {
        this.handlers.delete(event);
      }
    }

    // 移除一次性事件处理函数
    if (this.onceHandlers.has(event)) {
      if (handler) {
        this.onceHandlers.get(event)!.delete(handler);
        // 如果没有处理函数了，移除整个事件
        if (this.onceHandlers.get(event)!.size === 0) {
          this.onceHandlers.delete(event);
        }
      } else {
        this.onceHandlers.delete(event);
      }
    }
  }

  /**
   * 清除所有事件监听
   * @param event 事件名称(可选)，不提供时清除所有事件
   */
  public clear(event?: string): void {
    if (event) {
      this.handlers.delete(event);
      this.onceHandlers.delete(event);
    } else {
      this.handlers.clear();
      this.onceHandlers.clear();
    }
  }
}
