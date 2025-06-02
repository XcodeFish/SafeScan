/**
 * 内存缓存实现
 * 提供基于LRU的内存缓存机制
 */
import type { TParseResult } from '../types';

/**
 * LRU缓存项
 */
interface ICacheItem<T> {
  key: string;
  value: T;
  timestamp: number;
  expiry?: number; // 过期时间戳
}

/**
 * LRU缓存配置
 */
export interface ILRUCacheOptions {
  /** 最大缓存项数量 */
  maxSize?: number;
  /** 缓存项默认过期时间（毫秒） */
  ttl?: number;
}

/**
 * LRU缓存实现类
 */
export class LRUCache<T> {
  private cache: Map<string, ICacheItem<T>>;
  private maxSize: number;
  private defaultTTL?: number;

  /**
   * 创建LRU缓存实例
   * @param options 缓存配置
   */
  constructor(options: ILRUCacheOptions = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 1000; // 默认最大1000项
    this.defaultTTL = options.ttl; // 默认过期时间
  }

  /**
   * 获取缓存项
   * @param key 缓存键
   * @returns 缓存值或undefined（如果不存在或已过期）
   */
  get(key: string): T | undefined {
    const item = this.cache.get(key);

    // 检查项是否存在
    if (!item) {
      return undefined;
    }

    // 检查是否过期
    if (item.expiry && item.expiry < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }

    // 更新访问时间戳（LRU逻辑）
    item.timestamp = Date.now();
    this.cache.set(key, item);

    return item.value;
  }

  /**
   * 设置缓存项
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（毫秒），不设置则使用默认值
   */
  set(key: string, value: T, ttl?: number): void {
    // 如果达到最大容量，清除最早访问的项
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    // 计算过期时间
    const expiry = ttl || this.defaultTTL ? Date.now() + (ttl || this.defaultTTL!) : undefined;

    // 创建缓存项
    const item: ICacheItem<T> = {
      key,
      value,
      timestamp: Date.now(),
      expiry,
    };

    this.cache.set(key, item);
  }

  /**
   * 删除缓存项
   * @param key 缓存键
   * @returns 是否成功删除
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 清理过期缓存项
   * @returns 清理的项数量
   */
  prune(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, item] of this.cache.entries()) {
      if (item.expiry && item.expiry < now) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * 淘汰最早访问的缓存项
   * @private
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    // 找到最早访问的项
    for (const [key, item] of this.cache.entries()) {
      if (item.timestamp < oldestTime) {
        oldestTime = item.timestamp;
        oldestKey = key;
      }
    }

    // 删除最早访问的项
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

/**
 * 解析结果缓存实例
 * 用于缓存文件解析结果
 */
export const parseResultCache = new LRUCache<TParseResult>({
  maxSize: 500, // 默认缓存500个文件的解析结果
  ttl: 30 * 60 * 1000, // 默认30分钟过期
});
