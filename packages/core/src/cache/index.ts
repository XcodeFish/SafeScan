/**
 * 缓存系统模块
 * 提供多级缓存管理和分配
 */

import { CacheStrategy, ICache, ICacheSetOptions, ICacheStats } from '../types/cache';
import { DiskCache } from './disk';
import { LRUCache } from './memory';

/**
 * 多级缓存管理器配置
 */
export interface IMultiLevelCacheOptions {
  /** 缓存策略 */
  strategy?: CacheStrategy;
  /** 是否启用统计 */
  enableStats?: boolean;
  /** 内存缓存配置 */
  memoryCache?: {
    enabled: boolean;
    maxSize?: number;
    ttl?: number;
  };
  /** 磁盘缓存配置 */
  diskCache?: {
    enabled: boolean;
    cacheDir?: string;
    ttl?: number;
    compression?: boolean;
    maxSize?: number;
  };
  /** 分布式缓存配置 */
  distributedCache?: {
    enabled: boolean;
    servers?: string[];
  };
}

/**
 * 多级缓存管理器
 * 协调内存、磁盘和分布式缓存
 */
export class MultiLevelCache<T = any> implements ICache<T> {
  private strategy: CacheStrategy;
  private enableStats: boolean;
  private memoryCache?: LRUCache<T>;
  private diskCache?: DiskCache;
  private distributedCache?: any; // 分布式缓存实现

  private hits = { memory: 0, disk: 0, distributed: 0 };
  private misses = { memory: 0, disk: 0, distributed: 0 };
  private writes = { memory: 0, disk: 0, distributed: 0 };
  private deletes = { memory: 0, disk: 0, distributed: 0 };
  private accessTimes = {
    memory: [] as number[],
    disk: [] as number[],
    distributed: [] as number[],
  };

  /**
   * 创建多级缓存管理器
   * @param options 配置选项
   */
  constructor(options: IMultiLevelCacheOptions = {}) {
    this.strategy = options.strategy || CacheStrategy.WRITE_THROUGH;
    this.enableStats = options.enableStats !== false;

    // 初始化内存缓存
    if (options.memoryCache?.enabled !== false) {
      this.memoryCache = new LRUCache<T>({
        maxSize: options.memoryCache?.maxSize,
        ttl: options.memoryCache?.ttl,
      });
    }

    // 初始化磁盘缓存
    if (options.diskCache?.enabled === true) {
      this.diskCache = new DiskCache({
        cacheDir: options.diskCache.cacheDir,
        ttl: options.diskCache.ttl,
        compression: options.diskCache.compression,
        maxSize: options.diskCache.maxSize,
        enableStats: this.enableStats,
      });
    }

    // 初始化分布式缓存（可选）
    if (options.distributedCache?.enabled === true && options.distributedCache.servers?.length) {
      // 这里将来可以集成Redis或其他分布式缓存系统
      console.log('分布式缓存未实现');
    }
  }

  /**
   * 获取缓存项，按照内存 -> 磁盘 -> 分布式的顺序查找
   * @param key 缓存键
   * @returns 缓存值或undefined
   */
  async get(key: string): Promise<T | undefined> {
    let value: T | undefined | null = undefined;
    let startTime: number;

    // 尝试从内存缓存获取
    if (this.memoryCache) {
      startTime = this.enableStats ? performance.now() : 0;
      value = this.memoryCache.get(key);

      if (this.enableStats) {
        const accessTime = performance.now() - startTime;
        this.accessTimes.memory.push(accessTime);
        if (this.accessTimes.memory.length > 100) {
          this.accessTimes.memory.shift();
        }
      }

      if (value !== undefined) {
        if (this.enableStats) {
          this.hits.memory++;
        }
        return value;
      } else if (this.enableStats) {
        this.misses.memory++;
      }
    }

    // 尝试从磁盘缓存获取
    if (this.diskCache) {
      startTime = this.enableStats ? performance.now() : 0;
      value = await this.diskCache.get(key);

      if (this.enableStats) {
        const accessTime = performance.now() - startTime;
        this.accessTimes.disk.push(accessTime);
        if (this.accessTimes.disk.length > 100) {
          this.accessTimes.disk.shift();
        }
      }

      if (value !== null) {
        if (this.enableStats) {
          this.hits.disk++;
        }

        // 根据策略回填到内存缓存
        if (this.memoryCache) {
          this.memoryCache.set(key, value as T);
          if (this.enableStats) {
            this.writes.memory++;
          }
        }

        return value as T;
      } else if (this.enableStats) {
        this.misses.disk++;
      }
    }

    // 尝试从分布式缓存获取
    if (this.distributedCache) {
      startTime = this.enableStats ? performance.now() : 0;
      try {
        value = await this.distributedCache.get(key);

        if (this.enableStats) {
          const accessTime = performance.now() - startTime;
          this.accessTimes.distributed.push(accessTime);
          if (this.accessTimes.distributed.length > 100) {
            this.accessTimes.distributed.shift();
          }
        }

        if (value !== null && value !== undefined) {
          if (this.enableStats) {
            this.hits.distributed++;
          }

          // 根据策略回填到更高级别缓存
          if (this.memoryCache) {
            this.memoryCache.set(key, value as T);
            if (this.enableStats) {
              this.writes.memory++;
            }
          }

          if (this.diskCache) {
            await this.diskCache.set(key, value as T);
            if (this.enableStats) {
              this.writes.disk++;
            }
          }

          return value as T;
        } else if (this.enableStats) {
          this.misses.distributed++;
        }
      } catch (error) {
        console.error('分布式缓存获取出错:', error);
        if (this.enableStats) {
          this.misses.distributed++;
        }
      }
    }

    return undefined;
  }

  /**
   * 设置缓存项
   * @param key 缓存键
   * @param value 缓存值
   * @param options 缓存选项
   * @returns 是否成功
   */
  async set(key: string, value: T, options: ICacheSetOptions = {}): Promise<boolean> {
    let success = true;

    // 根据不同策略实现写入逻辑
    switch (this.strategy) {
      case CacheStrategy.WRITE_THROUGH:
        // 写穿策略：同时更新所有级别缓存
        if (this.memoryCache) {
          this.memoryCache.set(key, value);
          if (this.enableStats) {
            this.writes.memory++;
          }
        }

        if (this.diskCache) {
          await this.diskCache.set(key, value);
          if (this.enableStats) {
            this.writes.disk++;
          }
        }

        if (this.distributedCache) {
          try {
            await this.distributedCache.set(key, value, options.ttl);
            if (this.enableStats) {
              this.writes.distributed++;
            }
          } catch (error) {
            console.error('分布式缓存写入出错:', error);
            success = false;
          }
        }
        break;

      case CacheStrategy.WRITE_BACK:
        // 写回策略：只写入最高级别缓存
        if (this.memoryCache) {
          this.memoryCache.set(key, value);
          if (this.enableStats) {
            this.writes.memory++;
          }
        } else if (this.diskCache) {
          await this.diskCache.set(key, value);
          if (this.enableStats) {
            this.writes.disk++;
          }
        } else if (this.distributedCache) {
          try {
            await this.distributedCache.set(key, value, options.ttl);
            if (this.enableStats) {
              this.writes.distributed++;
            }
          } catch (error) {
            console.error('分布式缓存写入出错:', error);
            success = false;
          }
        }
        break;

      case CacheStrategy.WRITE_UPDATE:
      default:
        // 写更新策略：只更新已命中的缓存和最高级别缓存
        if (this.memoryCache) {
          this.memoryCache.set(key, value);
          if (this.enableStats) {
            this.writes.memory++;
          }
        }

        // 下层缓存只在有访问过时更新
        // 由于复杂性，这里简化处理为只写内存缓存
        break;
    }

    return success;
  }

  /**
   * 检查键是否存在于任何级别的缓存中
   * @param key 缓存键
   * @returns 是否存在
   */
  async has(key: string): Promise<boolean> {
    // 检查内存缓存
    if (this.memoryCache && this.memoryCache.has(key)) {
      return true;
    }

    // 检查磁盘缓存
    if (this.diskCache && (await this.diskCache.has(key))) {
      return true;
    }

    // 检查分布式缓存
    if (this.distributedCache) {
      try {
        const exists = await this.distributedCache.exists(key);
        return exists;
      } catch (error) {
        console.error('分布式缓存检查出错:', error);
      }
    }

    return false;
  }

  /**
   * 删除缓存项
   * @param key 缓存键
   * @returns 是否成功
   */
  async delete(key: string): Promise<boolean> {
    let success = true;

    // 从所有级别缓存中删除
    if (this.memoryCache) {
      const result = this.memoryCache.delete(key);
      if (result && this.enableStats) {
        this.deletes.memory++;
      }
      success = success && result;
    }

    if (this.diskCache) {
      const result = await this.diskCache.delete(key);
      if (result && this.enableStats) {
        this.deletes.disk++;
      }
      success = success && result;
    }

    if (this.distributedCache) {
      try {
        const result = await this.distributedCache.del(key);
        if (result && this.enableStats) {
          this.deletes.distributed++;
        }
        success = success && result;
      } catch (error) {
        console.error('分布式缓存删除出错:', error);
        success = false;
      }
    }

    return success;
  }

  /**
   * 清空所有级别的缓存
   * @returns 是否成功
   */
  async clear(): Promise<boolean> {
    let success = true;

    if (this.memoryCache) {
      this.memoryCache.clear();
    }

    if (this.diskCache) {
      const result = await this.diskCache.clear();
      success = success && result;
    }

    if (this.distributedCache) {
      try {
        await this.distributedCache.flushAll();
      } catch (error) {
        console.error('分布式缓存清空出错:', error);
        success = false;
      }
    }

    return success;
  }

  /**
   * 获取缓存项总数
   * @returns 缓存项数量
   */
  async size(): Promise<number> {
    let totalSize = 0;

    if (this.memoryCache) {
      totalSize += this.memoryCache.size();
    }

    if (this.diskCache) {
      const stats = await this.diskCache.getStats();
      totalSize += stats.itemCount;
    }

    if (this.distributedCache) {
      try {
        const info = await this.distributedCache.info();
        totalSize += info.keys || 0;
      } catch (error) {
        console.error('分布式缓存统计出错:', error);
      }
    }

    return totalSize;
  }

  /**
   * 获取缓存统计信息
   * @returns 统计信息
   */
  async getStats(): Promise<ICacheStats> {
    const totalHits = this.hits.memory + this.hits.disk + this.hits.distributed;
    const totalMisses = this.misses.memory + this.misses.disk + this.misses.distributed;
    const totalWrites = this.writes.memory + this.writes.disk + this.writes.distributed;
    const totalDeletes = this.deletes.memory + this.deletes.disk + this.deletes.distributed;

    let memorySize = 0;
    let diskSize = 0;
    let distributedSize = 0;

    if (this.memoryCache) {
      memorySize = this.memoryCache.size();
    }

    if (this.diskCache) {
      const stats = await this.diskCache.getStats();
      diskSize = stats.itemCount;
    }

    if (this.distributedCache) {
      try {
        const info = await this.distributedCache.info();
        distributedSize = info.keys || 0;
      } catch (error) {
        // 忽略错误
      }
    }

    const totalSize = memorySize + diskSize + distributedSize;

    // 计算平均访问时间
    let averageAccessTime = 0;
    let totalTimes = 0;
    let totalCount = 0;

    if (this.accessTimes.memory.length > 0) {
      totalTimes += this.accessTimes.memory.reduce((sum, time) => sum + time, 0);
      totalCount += this.accessTimes.memory.length;
    }

    if (this.accessTimes.disk.length > 0) {
      totalTimes += this.accessTimes.disk.reduce((sum, time) => sum + time, 0);
      totalCount += this.accessTimes.disk.length;
    }

    if (this.accessTimes.distributed.length > 0) {
      totalTimes += this.accessTimes.distributed.reduce((sum, time) => sum + time, 0);
      totalCount += this.accessTimes.distributed.length;
    }

    if (totalCount > 0) {
      averageAccessTime = totalTimes / totalCount;
    }

    return {
      itemCount: totalSize,
      hits: totalHits,
      misses: totalMisses,
      hitRatio: totalHits / (totalHits + totalMisses || 1),
      writes: totalWrites,
      deletes: totalDeletes,
      averageAccessTime,
    };
  }

  /**
   * 重置统计数据
   */
  resetStats(): void {
    this.hits = { memory: 0, disk: 0, distributed: 0 };
    this.misses = { memory: 0, disk: 0, distributed: 0 };
    this.writes = { memory: 0, disk: 0, distributed: 0 };
    this.deletes = { memory: 0, disk: 0, distributed: 0 };
    this.accessTimes = { memory: [], disk: [], distributed: [] };
  }

  /**
   * 调整缓存优先级
   * 将最常命中的键提升到更高级别缓存
   */
  async optimizeCacheLevels(): Promise<void> {
    if (!this.diskCache || !this.memoryCache) return;

    // 获取磁盘缓存最常访问的键
    const diskStats = await this.diskCache.getStats();
    const topAccessedKeys = diskStats.recentAccesses || [];

    // 统计访问频率
    const accessFrequency: Record<string, number> = {};
    topAccessedKeys.forEach((key) => {
      accessFrequency[key] = (accessFrequency[key] || 0) + 1;
    });

    // 按访问频率排序
    const sortedKeys = Object.keys(accessFrequency).sort(
      (a, b) => accessFrequency[b] - accessFrequency[a]
    );

    // 取前N个最常访问的键预加载到内存
    const topN = Math.min(sortedKeys.length, 20);
    for (let i = 0; i < topN; i++) {
      const key = sortedKeys[i];
      const value = await this.diskCache.get(key);
      if (value !== null) {
        this.memoryCache.set(key, value as T);
      }
    }
  }
}

/**
 * 默认全局缓存管理器实例
 */
export const globalCache = new MultiLevelCache({
  strategy: CacheStrategy.WRITE_THROUGH,
  enableStats: true,
  memoryCache: {
    enabled: true,
    maxSize: 1000,
    ttl: 3600000, // 1小时
  },
  diskCache: {
    enabled: true,
    compression: true,
    maxSize: 100 * 1024 * 1024, // 100MB
  },
});

/**
 * 获取特定命名空间的缓存实例
 * @param namespace 缓存命名空间
 */
export function getNamespacedCache<T = any>(namespace: string): MultiLevelCache<T> {
  return new MultiLevelCache<T>({
    strategy: CacheStrategy.WRITE_THROUGH,
    enableStats: true,
    memoryCache: {
      enabled: true,
      maxSize: 500,
      ttl: 3600000,
    },
    diskCache: {
      enabled: true,
      cacheDir: `${namespace}`,
      compression: true,
    },
  });
}

export { LRUCache } from './memory';
export { DiskCache } from './disk';
export { CacheInvalidator, InvalidationStrategy, createInvalidator } from './invalidate';
export { DistributedCache, createDistributedCache } from './distributed';

// 导出缓存类型
export * from '../types/cache';
