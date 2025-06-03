/**
 * 内存缓存模块
 * 为分析过程中的结果提供快速缓存，减少重复计算
 */

/**
 * LRU缓存条目
 */
interface LRUCacheEntry<T> {
  key: string;
  value: T;
  timestamp: number;
}

/**
 * 缓存项接口
 */
interface CacheItem<T> {
  value: T;
  timestamp: number;
  expiry?: number;
}

/**
 * 内存缓存接口
 */
export interface MemoryCache<T = any> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttl?: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  size(): number;
}

/**
 * LRU缓存选项
 */
export interface LRUCacheOptions {
  /**
   * 缓存项最大数量
   * @default 1000
   */
  maxSize?: number;

  /**
   * 缓存过期时间（毫秒）
   * @default 3600000 (1小时)
   */
  ttl?: number;

  /**
   * 缓存命名空间
   * @default 'default'
   */
  namespace?: string;
}

/**
 * LRU缓存实现
 */
export class LRUCache<T = any> {
  private cache: Map<string, LRUCacheEntry<T>> = new Map();
  private maxSize: number;
  private ttl: number;
  private namespace: string;

  /**
   * 创建LRU缓存
   * @param options 缓存选项
   */
  constructor(options: LRUCacheOptions = {}) {
    this.maxSize = options.maxSize || 1000;
    this.ttl = options.ttl || 3600000; // 默认1小时
    this.namespace = options.namespace || 'default';
  }

  /**
   * 生成完整的缓存键
   * @param key 原始键
   * @returns 带命名空间的完整键
   */
  private getFullKey(key: string): string {
    return `${this.namespace}:${key}`;
  }

  /**
   * 获取缓存项
   * @param key 缓存键
   * @returns 缓存值或undefined
   */
  get(key: string): T | undefined {
    const fullKey = this.getFullKey(key);
    const entry = this.cache.get(fullKey);

    if (!entry) {
      return undefined;
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(fullKey);
      return undefined;
    }

    // 更新访问时间
    entry.timestamp = Date.now();
    return entry.value;
  }

  /**
   * 设置缓存项
   * @param key 缓存键
   * @param value 缓存值
   */
  set(key: string, value: T): void {
    const fullKey = this.getFullKey(key);

    // 更新或创建条目
    this.cache.set(fullKey, {
      key: fullKey,
      value,
      timestamp: Date.now(),
    });

    // 如果超出大小限制，删除最旧的条目
    if (this.cache.size > this.maxSize) {
      this.evictOldest();
    }
  }

  /**
   * 检查键是否存在且未过期
   * @param key 缓存键
   * @returns 是否存在有效缓存
   */
  has(key: string): boolean {
    const fullKey = this.getFullKey(key);
    const entry = this.cache.get(fullKey);

    if (!entry) {
      return false;
    }

    // 检查是否过期
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(fullKey);
      return false;
    }

    return true;
  }

  /**
   * 删除缓存项
   * @param key 缓存键
   * @returns 是否成功删除
   */
  delete(key: string): boolean {
    const fullKey = this.getFullKey(key);
    return this.cache.delete(fullKey);
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
  size(): number {
    return this.cache.size;
  }

  /**
   * 驱逐最老的缓存项
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    // 找出最旧的条目
    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestKey = key;
        oldestTime = entry.timestamp;
      }
    }

    // 删除最旧的条目
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 删除所有过期条目
   * @returns 删除的条目数
   */
  prune(): number {
    const now = Date.now();
    let count = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }
}

// 创建预定义的缓存实例
const cacheInstances: Record<string, LRUCache<any>> = {
  // 规则结果缓存
  rules: new LRUCache<any>({ namespace: 'rules', maxSize: 500 }),
  // AST缓存
  ast: new LRUCache<any>({ namespace: 'ast', maxSize: 100 }),
  // 文件哈希缓存
  fileHash: new LRUCache<string>({ namespace: 'fileHash', maxSize: 1000 }),
};

/**
 * 获取指定命名空间的缓存实例
 * @param namespace 缓存命名空间
 * @returns 缓存实例
 */
export function getCache<T = any>(namespace: 'rules' | 'ast' | 'fileHash' | string): LRUCache<T> {
  if (!cacheInstances[namespace]) {
    cacheInstances[namespace] = new LRUCache<T>({ namespace });
  }
  return cacheInstances[namespace] as LRUCache<T>;
}

/**
 * 估算对象在内存中的大小（字节）
 * @param obj 需要估算大小的对象
 * @returns 估算的内存大小（字节）
 */
export function estimateObjectSize(obj: any): number {
  if (obj === null || obj === undefined) {
    return 0;
  }

  // 基本类型大小估算
  if (typeof obj === 'boolean') return 4;
  if (typeof obj === 'number') return 8;
  if (typeof obj === 'string') return obj.length * 2;
  if (typeof obj === 'function') return 0; // 忽略函数

  // 数组和对象大小估算
  if (Array.isArray(obj)) {
    return obj.reduce((size, item) => size + estimateObjectSize(item), 0);
  }

  // 对象大小估算
  if (typeof obj === 'object') {
    let size = 0;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        size += key.length * 2; // 键名大小
        size += estimateObjectSize(obj[key]); // 值大小
      }
    }
    return size;
  }

  return 0;
}

/**
 * LRU缓存选项
 */
interface CacheOptions {
  maxSize?: number; // 最大项目数
  maxMemory?: number; // 最大内存占用(MB)
  defaultTTL?: number; // 默认过期时间(ms)
  cleanupInterval?: number; // 自动清理间隔(ms)
}

/**
 * 内存缓存实现
 */
class MemoryCacheImpl<T = any> implements MemoryCache<T> {
  private cache: Map<string, CacheItem<T>>;
  private maxSize: number;
  private defaultTTL: number | undefined;
  private cleanupTimer: NodeJS.Timeout | undefined;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 1000;
    this.defaultTTL = options.defaultTTL;

    // 设置自动清理
    if (options.cleanupInterval) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup();
      }, options.cleanupInterval);
    }
  }

  /**
   * 获取缓存项
   */
  get(key: string): T | undefined {
    const item = this.cache.get(key);

    if (!item) {
      return undefined;
    }

    // 检查是否过期
    if (item.expiry && item.expiry < Date.now()) {
      this.delete(key);
      return undefined;
    }

    return item.value;
  }

  /**
   * 设置缓存项
   */
  set(key: string, value: T, ttl?: number): void {
    // 确保不超过最大大小
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // 移除最旧的项
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const timestamp = Date.now();
    let expiry: number | undefined = undefined;

    if (ttl !== undefined) {
      expiry = timestamp + ttl;
    } else if (this.defaultTTL !== undefined) {
      expiry = timestamp + this.defaultTTL;
    }

    this.cache.set(key, {
      value,
      timestamp,
      expiry,
    });
  }

  /**
   * 检查是否存在缓存项
   */
  has(key: string): boolean {
    const item = this.cache.get(key);

    if (!item) {
      return false;
    }

    // 检查是否过期
    if (item.expiry && item.expiry < Date.now()) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * 删除缓存项
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
  size(): number {
    return this.cache.size;
  }

  /**
   * 清理过期项
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (item.expiry && item.expiry < now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 销毁缓存，清除定时器
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.clear();
  }
}

/**
 * 创建内存缓存
 */
export function createCache<T = any>(options: CacheOptions = {}): MemoryCache<T> {
  return new MemoryCacheImpl<T>(options);
}
