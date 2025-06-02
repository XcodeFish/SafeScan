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
  size?: number; // 缓存项大小估算（字节）
  accessCount?: number; // 访问次数
  lastAccessTime?: number; // 最后访问时间
}

/**
 * LRU缓存配置
 */
export interface ILRUCacheOptions {
  /** 最大缓存项数量 */
  maxSize?: number;
  /** 缓存项默认过期时间（毫秒） */
  ttl?: number;
  /** 最大内存使用量（字节） */
  maxMemorySize?: number;
  /** 自动清理间隔（毫秒） */
  autoPruneInterval?: number;
  /** 缓存命中率低于此值时触发优化 */
  optimizeThreshold?: number;
  /** 是否启用缓存统计 */
  enableStats?: boolean;
  /** 是否跟踪内存使用 */
  trackMemoryUsage?: boolean;
}

/**
 * 缓存统计信息
 */
export interface ICacheStats {
  /** 缓存总大小 */
  size: number;
  /** 缓存项总数 */
  itemCount: number;
  /** 命中次数 */
  hits: number;
  /** 未命中次数 */
  misses: number;
  /** 命中率 */
  hitRatio: number;
  /** 估计内存使用量（字节） */
  estimatedMemoryUsage: number;
  /** 淘汰次数 */
  evictions: number;
  /** 过期清理次数 */
  prunes: number;
  /** 平均访问时间（毫秒） */
  averageAccessTime: number;
  /** 统计开始时间 */
  statsStartTime: number;
  /** 最常访问的键（前5个） */
  topKeys: Array<{ key: string; accessCount: number }>;
}

/**
 * LRU缓存实现类
 */
export class LRUCache<T> {
  private cache: Map<string, ICacheItem<T>>;
  private maxSize: number;
  private defaultTTL?: number;
  private maxMemorySize?: number;
  private estimatedMemoryUsage: number;
  private autoPruneInterval?: number;
  private pruneIntervalId?: NodeJS.Timeout;
  private optimizeThreshold: number;
  private enableStats: boolean;
  private trackMemoryUsage: boolean;

  // 统计数据
  private hits: number;
  private misses: number;
  private evictions: number;
  private prunes: number;
  private accessTimes: number[];
  private statsStartTime: number;

  /**
   * 创建LRU缓存实例
   * @param options 缓存配置
   */
  constructor(options: ILRUCacheOptions = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 1000; // 默认最大1000项
    this.defaultTTL = options.ttl; // 默认过期时间
    this.maxMemorySize = options.maxMemorySize; // 最大内存使用量
    this.estimatedMemoryUsage = 0;
    this.autoPruneInterval = options.autoPruneInterval;
    this.optimizeThreshold = options.optimizeThreshold || 0.5; // 默认命中率低于50%时优化
    this.enableStats = options.enableStats !== false;
    this.trackMemoryUsage = options.trackMemoryUsage === true;

    // 初始化统计数据
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.prunes = 0;
    this.accessTimes = [];
    this.statsStartTime = Date.now();

    // 设置自动清理
    if (this.autoPruneInterval) {
      this.pruneIntervalId = setInterval(() => {
        this.prune();
        this.optimizeIfNeeded();
      }, this.autoPruneInterval);
    }
  }

  /**
   * 获取缓存项
   * @param key 缓存键
   * @returns 缓存值或undefined（如果不存在或已过期）
   */
  get(key: string): T | undefined {
    const startTime = this.enableStats ? performance.now() : 0;
    const item = this.cache.get(key);

    // 检查项是否存在
    if (!item) {
      if (this.enableStats) {
        this.misses++;
      }
      return undefined;
    }

    // 检查是否过期
    if (item.expiry && item.expiry < Date.now()) {
      this.cache.delete(key);
      if (this.enableStats) {
        this.misses++;
        if (this.trackMemoryUsage && item.size) {
          this.estimatedMemoryUsage -= item.size;
        }
      }
      return undefined;
    }

    // 更新访问时间戳和计数（LRU逻辑）
    item.timestamp = Date.now();
    item.lastAccessTime = Date.now();
    item.accessCount = (item.accessCount || 0) + 1;
    this.cache.set(key, item);

    if (this.enableStats) {
      this.hits++;
      const accessTime = performance.now() - startTime;
      this.accessTimes.push(accessTime);
      // 只保留最近100次访问的时间
      if (this.accessTimes.length > 100) {
        this.accessTimes.shift();
      }
    }

    return item.value;
  }

  /**
   * 设置缓存项
   * @param key 缓存键
   * @param value 缓存值
   * @param ttl 过期时间（毫秒），不设置则使用默认值
   * @param estimatedSize 估计的缓存项大小（字节）
   */
  set(key: string, value: T, ttl?: number, estimatedSize?: number): void {
    // 检查内存限制
    if (this.maxMemorySize && this.trackMemoryUsage && estimatedSize) {
      // 如果添加新项会超出内存限制，先清理一些项
      if (this.estimatedMemoryUsage + estimatedSize > this.maxMemorySize) {
        this.evictByMemory(estimatedSize);
      }
    }

    // 如果达到最大容量，清除最早访问的项
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    // 计算过期时间
    const expiry = ttl || this.defaultTTL ? Date.now() + (ttl || this.defaultTTL!) : undefined;

    // 获取旧项（如果存在）
    const existingItem = this.cache.get(key);
    if (existingItem && this.trackMemoryUsage && existingItem.size) {
      this.estimatedMemoryUsage -= existingItem.size;
    }

    // 创建缓存项
    const item: ICacheItem<T> = {
      key,
      value,
      timestamp: Date.now(),
      expiry,
      size: estimatedSize,
      accessCount: 1,
      lastAccessTime: Date.now(),
    };

    this.cache.set(key, item);

    // 更新内存使用估计
    if (this.trackMemoryUsage && estimatedSize) {
      this.estimatedMemoryUsage += estimatedSize;
    }
  }

  /**
   * 删除缓存项
   * @param key 缓存键
   * @returns 是否成功删除
   */
  delete(key: string): boolean {
    const item = this.cache.get(key);
    if (item && this.trackMemoryUsage && item.size) {
      this.estimatedMemoryUsage -= item.size;
    }
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
    this.estimatedMemoryUsage = 0;

    if (this.enableStats) {
      // 重置统计数据但保留命中/未命中计数
      this.evictions = 0;
      this.prunes = 0;
      this.accessTimes = [];
    }
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
        // 更新内存使用估计
        if (this.trackMemoryUsage && item.size) {
          this.estimatedMemoryUsage -= item.size;
        }

        this.cache.delete(key);
        count++;
      }
    }

    if (this.enableStats && count > 0) {
      this.prunes++;
    }

    return count;
  }

  /**
   * 获取缓存统计信息
   * @returns 缓存统计
   */
  getStats(): ICacheStats {
    // 计算平均访问时间
    const avgAccessTime =
      this.accessTimes.length > 0
        ? this.accessTimes.reduce((sum, time) => sum + time, 0) / this.accessTimes.length
        : 0;

    // 获取最常访问的键
    const topKeys: Array<{ key: string; accessCount: number }> = [];
    if (this.enableStats) {
      const entries = Array.from(this.cache.entries())
        .map(([key, item]) => ({
          key,
          accessCount: item.accessCount || 0,
        }))
        .sort((a, b) => b.accessCount - a.accessCount)
        .slice(0, 5);

      topKeys.push(...entries);
    }

    return {
      size: this.cache.size,
      itemCount: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRatio: this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0,
      estimatedMemoryUsage: this.estimatedMemoryUsage,
      evictions: this.evictions,
      prunes: this.prunes,
      averageAccessTime: avgAccessTime,
      statsStartTime: this.statsStartTime,
      topKeys,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    this.prunes = 0;
    this.accessTimes = [];
    this.statsStartTime = Date.now();
  }

  /**
   * 停止自动清理
   */
  stopAutoPrune(): void {
    if (this.pruneIntervalId) {
      clearInterval(this.pruneIntervalId);
      this.pruneIntervalId = undefined;
    }
  }

  /**
   * 优化缓存
   * 如果命中率低于阈值，尝试优化缓存
   */
  private optimizeIfNeeded(): void {
    if (!this.enableStats) return;

    const hitRatio = this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 1;

    // 如果命中率低于阈值，尝试优化
    if (hitRatio < this.optimizeThreshold) {
      // 清除长时间未访问的项（超过平均TTL两倍的项）
      const now = Date.now();
      const avgTTL = this.defaultTTL || 60 * 60 * 1000; // 默认1小时

      for (const [key, item] of this.cache.entries()) {
        if (item.lastAccessTime && now - item.lastAccessTime > avgTTL * 2) {
          if (this.trackMemoryUsage && item.size) {
            this.estimatedMemoryUsage -= item.size;
          }
          this.cache.delete(key);
          if (this.enableStats) {
            this.evictions++;
          }
        }
      }

      // 重置统计数据以开始新的优化周期
      this.resetStats();
    }
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
      const item = this.cache.get(oldestKey);
      if (this.trackMemoryUsage && item?.size) {
        this.estimatedMemoryUsage -= item.size;
      }
      this.cache.delete(oldestKey);

      if (this.enableStats) {
        this.evictions++;
      }
    }
  }

  /**
   * 基于内存需求淘汰缓存项
   * @param neededSpace 需要释放的内存空间（字节）
   * @private
   */
  private evictByMemory(neededSpace: number): void {
    // 如果未跟踪内存使用，则使用普通的LRU淘汰
    if (!this.trackMemoryUsage) {
      this.evictLRU();
      return;
    }

    // 对缓存项进行排序：先按访问时间，再按大小/访问次数比率
    const items = Array.from(this.cache.entries())
      .map(([key, item]) => ({
        key,
        timestamp: item.timestamp,
        size: item.size || 0,
        accessCount: item.accessCount || 1,
        valueRatio: (item.size || 0) / (item.accessCount || 1), // 大小/访问次数比率
      }))
      .sort((a, b) => {
        // 首先按访问时间排序
        const timeDiff = a.timestamp - b.timestamp;
        if (timeDiff !== 0) return timeDiff;

        // 然后按照大小/访问次数比率排序（优先移除效率低的项）
        return b.valueRatio - a.valueRatio;
      });

    let freedSpace = 0;
    let i = 0;

    // 淘汰缓存项直到释放足够空间
    while (freedSpace < neededSpace && i < items.length) {
      const { key, size } = items[i];
      const item = this.cache.get(key);

      if (item) {
        this.cache.delete(key);
        freedSpace += size;

        if (this.enableStats) {
          this.evictions++;
        }
      }

      i++;
    }
  }
}

/**
 * 估计对象内存大小
 * @param obj 要估计大小的对象
 * @returns 估计的字节大小
 */
export function estimateObjectSize(obj: any): number {
  const objectList = new Set();
  return calculateSize(obj);

  function calculateSize(object: any): number {
    // 基本类型直接返回近似大小
    if (object === null) return 0;
    if (typeof object !== 'object') {
      if (typeof object === 'string') return object.length * 2;
      if (typeof object === 'boolean') return 4;
      if (typeof object === 'number') return 8;
      return 0;
    }

    // 避免循环引用
    if (objectList.has(object)) return 0;
    objectList.add(object);

    // 数组
    if (Array.isArray(object)) {
      return object.reduce((acc, item) => acc + calculateSize(item), 0) + 40; // 数组有额外开销
    }

    // 普通对象
    return Object.entries(object).reduce((acc, [key, value]) => {
      return acc + key.length * 2 + calculateSize(value) + 8; // 键值对有额外开销
    }, 40); // 对象有额外开销
  }
}

/**
 * 解析结果缓存实例
 * 用于缓存文件解析结果
 */
export const parseResultCache = new LRUCache<TParseResult>({
  maxSize: 500, // 默认缓存500个文件的解析结果
  ttl: 30 * 60 * 1000, // 默认30分钟过期
  enableStats: true,
  trackMemoryUsage: true,
  autoPruneInterval: 5 * 60 * 1000, // 5分钟自动清理一次
  maxMemorySize: 100 * 1024 * 1024, // 最大使用100MB内存
});
