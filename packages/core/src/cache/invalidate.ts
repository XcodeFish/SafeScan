/**
 * 缓存失效策略实现
 * 提供智能缓存失效管理
 */

import { MultiLevelCache } from './index';

/**
 * 缓存失效策略类型
 */
export enum InvalidationStrategy {
  /** 基于时间：按照固定时间间隔失效 */
  TIME_BASED = 'time_based',
  /** 基于访问模式：根据访问频率自动调整过期时间 */
  PATTERN_BASED = 'pattern_based',
  /** 基于容量：当缓存达到指定容量时清理 */
  CAPACITY_BASED = 'capacity_based',
  /** 基于优先级：优先保留高优先级缓存 */
  PRIORITY_BASED = 'priority_based',
  /** 混合策略：结合多种策略 */
  HYBRID = 'hybrid',
}

/**
 * 缓存失效配置
 */
export interface IInvalidationOptions {
  /** 策略类型 */
  strategy: InvalidationStrategy;
  /** 时间间隔（毫秒）- 用于TIME_BASED */
  interval?: number;
  /** 容量阈值（字节）- 用于CAPACITY_BASED */
  capacityThreshold?: number;
  /** 警告阈值（百分比）- 用于CAPACITY_BASED */
  warningThreshold?: number;
  /** 自动清理 */
  autoPrune?: boolean;
  /** 可观察性回调 */
  onInvalidation?: (keys: string[], reason: string) => void;
}

/**
 * 缓存项使用统计
 */
interface CacheItemMetrics {
  /** 键 */
  key: string;
  /** 访问次数 */
  hits: number;
  /** 上次访问时间 */
  lastAccess: number;
  /** 创建时间 */
  creationTime: number;
  /** 大小估算（字节） */
  size?: number;
  /** 优先级分数 */
  priorityScore?: number;
}

/**
 * 智能缓存失效管理器
 */
export class CacheInvalidator {
  private cache: MultiLevelCache;
  private strategy: InvalidationStrategy;
  private interval: number;
  private capacityThreshold: number;
  private warningThreshold: number;
  private intervalId?: NodeJS.Timeout;
  private metricsMap: Map<string, CacheItemMetrics> = new Map();
  private onInvalidation?: (keys: string[], reason: string) => void;

  /**
   * 创建缓存失效管理器
   * @param cache 目标缓存实例
   * @param options 配置选项
   */
  constructor(cache: MultiLevelCache, options: IInvalidationOptions) {
    this.cache = cache;
    this.strategy = options.strategy;
    this.interval = options.interval || 3600000; // 默认1小时
    this.capacityThreshold = options.capacityThreshold || 100 * 1024 * 1024; // 默认100MB
    this.warningThreshold = options.warningThreshold || 0.8; // 默认80%
    this.onInvalidation = options.onInvalidation;

    // 设置自动清理
    if (options.autoPrune) {
      this.startAutoPrune();
    }
  }

  /**
   * 记录缓存访问
   * @param key 缓存键
   * @param size 缓存项大小（可选）
   */
  recordAccess(key: string, size?: number): void {
    const now = Date.now();
    const metrics = this.metricsMap.get(key);

    if (metrics) {
      metrics.hits++;
      metrics.lastAccess = now;
      if (size !== undefined) {
        metrics.size = size;
      }
    } else {
      this.metricsMap.set(key, {
        key,
        hits: 1,
        lastAccess: now,
        creationTime: now,
        size,
      });
    }

    // 定期更新优先级分数
    if (
      this.strategy === InvalidationStrategy.PRIORITY_BASED ||
      this.strategy === InvalidationStrategy.HYBRID
    ) {
      this.updatePriorityScores();
    }
  }

  /**
   * 更新所有缓存项的优先级分数
   */
  private updatePriorityScores(): void {
    const now = Date.now();

    for (const metrics of this.metricsMap.values()) {
      // 计算基于多因素的优先级分数
      // 1. 访问频率（40%权重）
      // 2. 最近访问（30%权重）
      // 3. 大小（20%权重）- 小的优先保留
      // 4. 年龄（10%权重）- 新的优先保留

      const accessFrequencyScore = Math.min(metrics.hits / 10, 1); // 正则化到[0,1]

      const recencyScore = Math.max(0, 1 - (now - metrics.lastAccess) / 86400000); // 一天内为高分

      let sizeScore = 1;
      if (metrics.size !== undefined) {
        sizeScore = Math.max(0, 1 - metrics.size / (1024 * 1024)); // 1MB以下为高分
      }

      const ageScore = Math.max(0, 1 - (now - metrics.creationTime) / (7 * 86400000)); // 一周内为高分

      // 综合得分
      metrics.priorityScore =
        accessFrequencyScore * 0.4 + recencyScore * 0.3 + sizeScore * 0.2 + ageScore * 0.1;
    }
  }

  /**
   * 启动自动清理
   */
  startAutoPrune(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(async () => {
      await this.pruneCache();
    }, this.interval);
  }

  /**
   * 停止自动清理
   */
  stopAutoPrune(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * 执行缓存清理
   * @returns 删除的键数量
   */
  async pruneCache(): Promise<number> {
    switch (this.strategy) {
      case InvalidationStrategy.TIME_BASED:
        return this.timeBasedPrune();
      case InvalidationStrategy.CAPACITY_BASED:
        return this.capacityBasedPrune();
      case InvalidationStrategy.PATTERN_BASED:
        return this.patternBasedPrune();
      case InvalidationStrategy.PRIORITY_BASED:
        return this.priorityBasedPrune();
      case InvalidationStrategy.HYBRID:
        return this.hybridPrune();
      default:
        return 0;
    }
  }

  /**
   * 基于时间的清理策略
   * 删除超过特定时间未访问的缓存
   */
  private async timeBasedPrune(): Promise<number> {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, metrics] of this.metricsMap.entries()) {
      // 超过1小时未访问的缓存项
      if (now - metrics.lastAccess > this.interval) {
        keysToDelete.push(key);
      }
    }

    await this.invalidateKeys(keysToDelete, '基于时间');
    return keysToDelete.length;
  }

  /**
   * 基于容量的清理策略
   * 当缓存大小达到阈值时删除低价值缓存
   */
  private async capacityBasedPrune(): Promise<number> {
    // 获取缓存统计信息
    const totalSize = this.getEstimatedTotalSize();

    // 未超过容量阈值
    if (totalSize < this.capacityThreshold) {
      return 0;
    }

    // 计算需要删除的容量
    const exceededSize = totalSize - this.capacityThreshold * this.warningThreshold;

    // 按最近访问时间排序
    const sortedItems = [...this.metricsMap.entries()].sort(
      (a, b) => a[1].lastAccess - b[1].lastAccess
    );

    const keysToDelete: string[] = [];
    let freedSize = 0;

    // 从最旧的开始删除，直到释放足够空间
    for (const [key, metrics] of sortedItems) {
      keysToDelete.push(key);
      freedSize += metrics.size || 0;

      if (freedSize >= exceededSize) {
        break;
      }
    }

    await this.invalidateKeys(keysToDelete, '基于容量');
    return keysToDelete.length;
  }

  /**
   * 基于访问模式的清理策略
   * 根据访问频率动态调整缓存项保留时间
   */
  private async patternBasedPrune(): Promise<number> {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, metrics] of this.metricsMap.entries()) {
      // 计算动态过期时间
      // 访问越频繁，过期时间越长
      const dynamicTTL = Math.min(
        this.interval * (1 + Math.log10(metrics.hits + 1)), // 对数增长
        this.interval * 24 // 最多保留24倍基础时间
      );

      if (now - metrics.lastAccess > dynamicTTL) {
        keysToDelete.push(key);
      }
    }

    await this.invalidateKeys(keysToDelete, '基于访问模式');
    return keysToDelete.length;
  }

  /**
   * 基于优先级的清理策略
   * 保留高优先级的缓存项
   */
  private async priorityBasedPrune(): Promise<number> {
    // 确保优先级分数已更新
    this.updatePriorityScores();

    const totalSize = this.getEstimatedTotalSize();
    if (totalSize < this.capacityThreshold) {
      return 0;
    }

    // 按优先级排序（升序，低优先级在前）
    const sortedItems = [...this.metricsMap.entries()].sort(
      (a, b) => (a[1].priorityScore || 0) - (b[1].priorityScore || 0)
    );

    // 计算需要删除的数量（约20%的项）
    const itemsToPrune = Math.ceil(sortedItems.length * 0.2);
    const keysToDelete = sortedItems.slice(0, itemsToPrune).map(([key]) => key);

    await this.invalidateKeys(keysToDelete, '基于优先级');
    return keysToDelete.length;
  }

  /**
   * 混合清理策略
   * 结合多种因素进行智能清理
   */
  private async hybridPrune(): Promise<number> {
    const now = Date.now();
    const totalSize = this.getEstimatedTotalSize();
    const isOverCapacity = totalSize > this.capacityThreshold * this.warningThreshold;

    // 更新所有项的优先级分数
    this.updatePriorityScores();

    const keysToDelete: string[] = [];

    // 基础时间检查：很久未访问的缓存直接删除
    for (const [key, metrics] of this.metricsMap.entries()) {
      // 超过3天未访问的低优先级项
      if (now - metrics.lastAccess > 3 * 86400000 && (metrics.priorityScore || 0) < 0.3) {
        keysToDelete.push(key);
      }
    }

    // 如果空间不足，额外删除一些低优先级项
    if (isOverCapacity && keysToDelete.length < this.metricsMap.size * 0.1) {
      const sortedItems = [...this.metricsMap.entries()]
        .filter(([key]) => !keysToDelete.includes(key)) // 排除已选择的
        .sort((a, b) => (a[1].priorityScore || 0) - (b[1].priorityScore || 0));

      // 删除额外的低优先级项
      const additionalPrune = Math.ceil(sortedItems.length * 0.15);
      keysToDelete.push(...sortedItems.slice(0, additionalPrune).map(([key]) => key));
    }

    await this.invalidateKeys(keysToDelete, '混合策略');
    return keysToDelete.length;
  }

  /**
   * 估算缓存总大小
   */
  private getEstimatedTotalSize(): number {
    let totalSize = 0;
    for (const metrics of this.metricsMap.values()) {
      totalSize += metrics.size || 5000; // 默认估算每项5KB
    }
    return totalSize;
  }

  /**
   * 使指定键集合失效
   * @param keys 要失效的键列表
   * @param reason 失效原因
   */
  private async invalidateKeys(keys: string[], reason: string): Promise<void> {
    if (keys.length === 0) return;

    // 批量删除缓存
    for (const key of keys) {
      await this.cache.delete(key);
      this.metricsMap.delete(key);
    }

    // 通知回调
    if (this.onInvalidation) {
      this.onInvalidation(keys, reason);
    }
  }
}

/**
 * 创建缓存失效管理器
 * @param cache 缓存实例
 * @param options 配置选项
 */
export function createInvalidator(
  cache: MultiLevelCache,
  options: IInvalidationOptions
): CacheInvalidator {
  return new CacheInvalidator(cache, options);
}
