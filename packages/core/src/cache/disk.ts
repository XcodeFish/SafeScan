/**
 * 磁盘缓存实现
 * 提供基于文件系统的持久化缓存
 */
import { existsSync } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import { TParseResult } from '../types';
import { calculateHash } from '../utils/hash';
import { estimateObjectSize } from './memory';

// 异步压缩/解压函数
const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// 默认缓存目录
const DEFAULT_CACHE_DIR = path.join(os.homedir(), '.safescan', 'cache');

/**
 * 磁盘缓存配置
 */
export interface IDiskCacheOptions {
  /** 缓存目录路径 */
  cacheDir?: string;
  /** 缓存版本，用于区分不同版本的缓存 */
  version?: string;
  /** 缓存过期时间（毫秒） */
  ttl?: number;
  /** 是否压缩缓存数据 */
  compression?: boolean;
  /** 是否启用缓存统计 */
  enableStats?: boolean;
  /** 最大缓存大小（字节） */
  maxSize?: number;
  /** 自动清理间隔（毫秒） */
  autoPruneInterval?: number;
  /** 是否使用分片存储（适用于大文件） */
  useSharding?: boolean;
}

/**
 * 磁盘缓存统计信息
 */
export interface IDiskCacheStats {
  /** 缓存项数量 */
  itemCount: number;
  /** 缓存总大小（字节） */
  totalSize: number;
  /** 命中次数 */
  hits: number;
  /** 未命中次数 */
  misses: number;
  /** 命中率 */
  hitRatio: number;
  /** 写入次数 */
  writes: number;
  /** 删除次数 */
  deletes: number;
  /** 统计开始时间 */
  statsStartTime: number;
  /** 最近访问的项 */
  recentAccesses: string[];
  /** 平均读取时间（毫秒） */
  averageReadTime: number;
  /** 平均写入时间（毫秒） */
  averageWriteTime: number;
}

/**
 * 磁盘缓存实现类
 */
export class DiskCache {
  private cacheDir: string;
  private version: string;
  private ttl?: number;
  private compression: boolean;
  private enableStats: boolean;
  private maxSize?: number;
  private autoPruneInterval?: number;
  private pruneIntervalId?: NodeJS.Timeout;
  private useSharding: boolean;
  private metadataFile: string;
  private initialized: boolean = false;

  // 缓存统计
  private hits: number = 0;
  private misses: number = 0;
  private writes: number = 0;
  private deletes: number = 0;
  private statsStartTime: number = Date.now();
  private recentAccesses: string[] = [];
  private readTimes: number[] = [];
  private writeTimes: number[] = [];

  /**
   * 创建磁盘缓存实例
   * @param options 缓存配置
   */
  constructor(options: IDiskCacheOptions = {}) {
    this.cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;
    this.version = options.version || '1.0.0';
    this.ttl = options.ttl;
    this.compression = options.compression !== false;
    this.enableStats = options.enableStats !== false;
    this.maxSize = options.maxSize;
    this.autoPruneInterval = options.autoPruneInterval;
    this.useSharding = options.useSharding === true;
    this.metadataFile = path.join(this.getVersionCacheDir(), '.metadata.json');

    // 确保版本化缓存目录存在
    this.ensureCacheDirAsync()
      .then(() => {
        this.initialized = true;
        this.loadStats();

        // 设置自动清理
        if (this.autoPruneInterval) {
          this.pruneIntervalId = setInterval(() => {
            this.prune().catch((err) => {
              console.error('Cache pruning error:', err);
            });

            // 自动检查和管理缓存大小
            if (this.maxSize) {
              this.enforceMaxSize().catch((err) => {
                console.error('Cache size enforcement error:', err);
              });
            }
          }, this.autoPruneInterval);
        }
      })
      .catch((err) => {
        console.error('Failed to initialize disk cache:', err);
      });
  }

  /**
   * 获取缓存项
   * @param key 缓存键
   * @returns Promise<缓存值或null（如果不存在或已过期）>
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = this.enableStats ? performance.now() : 0;
    const cacheFilePath = this.getCacheFilePath(key);

    try {
      // 检查文件是否存在
      await fs.access(cacheFilePath);

      // 读取缓存文件
      let cacheData: string;

      if (this.compression) {
        // 读取压缩数据
        const compressedData = await fs.readFile(cacheFilePath);
        const decompressed = await gunzipAsync(compressedData);
        cacheData = decompressed.toString('utf-8');
      } else {
        // 直接读取文本数据
        cacheData = await fs.readFile(cacheFilePath, 'utf-8');
      }

      const { value, timestamp } = JSON.parse(cacheData);

      // 检查是否过期
      if (this.ttl && Date.now() - timestamp > this.ttl) {
        // 删除过期缓存
        await fs.unlink(cacheFilePath).catch(() => {});

        if (this.enableStats) {
          this.misses++;
        }
        return null;
      }

      if (this.enableStats) {
        this.hits++;
        this.recentAccesses.push(key);
        // 只保留最近100次访问记录
        if (this.recentAccesses.length > 100) {
          this.recentAccesses.shift();
        }

        const accessTime = performance.now() - startTime;
        this.readTimes.push(accessTime);
        // 只保留最近50次读取时间
        if (this.readTimes.length > 50) {
          this.readTimes.shift();
        }

        // 定期保存统计信息
        if (this.hits % 100 === 0) {
          this.saveStats().catch(() => {});
        }
      }

      return value as T;
    } catch (error) {
      // 文件不存在或读取失败
      if (this.enableStats) {
        this.misses++;
      }
      return null;
    }
  }

  /**
   * 设置缓存项
   * @param key 缓存键
   * @param value 缓存值
   * @returns Promise<是否成功>
   */
  async set<T>(key: string, value: T): Promise<boolean> {
    const startTime = this.enableStats ? performance.now() : 0;
    const cacheFilePath = this.getCacheFilePath(key);

    try {
      // 确保缓存目录存在
      await this.ensureCacheDirAsync();

      // 如果已达到最大缓存大小，先清理一些空间
      if (this.maxSize) {
        const valueSize = estimateObjectSize(value);
        await this.makeSpace(valueSize);
      }

      // 创建缓存数据
      const cacheData = {
        value,
        timestamp: Date.now(),
      };

      // 转换为JSON字符串
      const jsonData = JSON.stringify(cacheData);

      if (this.compression) {
        // 压缩并写入
        const compressed = await gzipAsync(Buffer.from(jsonData, 'utf-8'));
        await fs.writeFile(cacheFilePath, compressed);
      } else {
        // 直接写入文本
        await fs.writeFile(cacheFilePath, jsonData, 'utf-8');
      }

      if (this.enableStats) {
        this.writes++;

        const writeTime = performance.now() - startTime;
        this.writeTimes.push(writeTime);
        // 只保留最近50次写入时间
        if (this.writeTimes.length > 50) {
          this.writeTimes.shift();
        }

        // 定期保存统计信息
        if (this.writes % 50 === 0) {
          this.saveStats().catch(() => {});
        }
      }

      return true;
    } catch (error) {
      console.error('Failed to write cache file:', error);
      return false;
    }
  }

  /**
   * 删除缓存项
   * @param key 缓存键
   * @returns Promise<是否成功>
   */
  async delete(key: string): Promise<boolean> {
    const cacheFilePath = this.getCacheFilePath(key);

    try {
      await fs.unlink(cacheFilePath);

      if (this.enableStats) {
        this.deletes++;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 清空所有缓存
   * @returns Promise<是否成功>
   */
  async clear(): Promise<boolean> {
    try {
      const versionDir = this.getVersionCacheDir();
      await fs.rm(versionDir, { recursive: true, force: true });
      await this.ensureCacheDirAsync();

      if (this.enableStats) {
        // 重置统计信息
        this.resetStats();
      }

      return true;
    } catch (error) {
      console.error('Failed to clear cache:', error);
      return false;
    }
  }

  /**
   * 清理过期缓存
   * @returns Promise<清理的项数量>
   */
  async prune(): Promise<number> {
    if (!this.ttl) {
      return 0;
    }

    try {
      const versionDir = this.getVersionCacheDir();
      const files = await fs.readdir(versionDir);

      let count = 0;
      const now = Date.now();
      const prunePromises: Promise<void>[] = [];

      for (const file of files) {
        // 跳过元数据文件
        if (file === '.metadata.json') continue;

        const filePath = path.join(versionDir, file);

        const prunePromise = async () => {
          try {
            const stats = await fs.stat(filePath);

            // 检查文件修改时间是否超过TTL
            if (now - stats.mtimeMs > this.ttl!) {
              await fs.unlink(filePath);
              count++;
            }
          } catch (err) {
            // 忽略单个文件的错误
          }
        };

        prunePromises.push(prunePromise());
      }

      // 并行处理所有清理任务
      await Promise.all(prunePromises);

      return count;
    } catch (error) {
      console.error('Failed to prune cache:', error);
      return 0;
    }
  }

  /**
   * 获取缓存统计信息
   * @returns Promise<缓存统计>
   */
  async getStats(): Promise<IDiskCacheStats> {
    // 获取总缓存大小
    let totalSize = 0;
    let itemCount = 0;

    try {
      const versionDir = this.getVersionCacheDir();
      const files = await fs.readdir(versionDir);

      // 过滤掉元数据文件
      const cacheFiles = files.filter((file) => file !== '.metadata.json');
      itemCount = cacheFiles.length;

      // 计算总大小
      for (const file of cacheFiles) {
        const filePath = path.join(versionDir, file);
        try {
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        } catch (err) {
          // 忽略单个文件错误
        }
      }
    } catch (err) {
      console.error('Failed to get cache stats:', err);
    }

    // 计算平均读取和写入时间
    const averageReadTime =
      this.readTimes.length > 0
        ? this.readTimes.reduce((sum, time) => sum + time, 0) / this.readTimes.length
        : 0;

    const averageWriteTime =
      this.writeTimes.length > 0
        ? this.writeTimes.reduce((sum, time) => sum + time, 0) / this.writeTimes.length
        : 0;

    return {
      itemCount,
      totalSize,
      hits: this.hits,
      misses: this.misses,
      hitRatio: this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0,
      writes: this.writes,
      deletes: this.deletes,
      statsStartTime: this.statsStartTime,
      recentAccesses: [...this.recentAccesses],
      averageReadTime,
      averageWriteTime,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.writes = 0;
    this.deletes = 0;
    this.statsStartTime = Date.now();
    this.recentAccesses = [];
    this.readTimes = [];
    this.writeTimes = [];

    // 保存重置后的统计
    this.saveStats().catch(() => {});
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
   * 获取版本化缓存目录
   * @private
   */
  private getVersionCacheDir(): string {
    return path.join(this.cacheDir, this.version);
  }

  /**
   * 获取缓存文件路径
   * @param key 缓存键
   * @private
   */
  private getCacheFilePath(key: string): string {
    // 哈希化key，避免文件系统不支持的字符
    const hashedKey = calculateHash(key);

    if (this.useSharding) {
      // 使用前两个字符作为目录，实现分片存储
      const shardDir = hashedKey.substring(0, 2);
      const shardPath = path.join(this.getVersionCacheDir(), shardDir);

      // 尝试创建分片目录（异步，不等待）
      fs.mkdir(shardPath, { recursive: true }).catch(() => {});

      return path.join(shardPath, hashedKey.substring(2));
    }

    return path.join(this.getVersionCacheDir(), hashedKey);
  }

  /**
   * 确保缓存目录存在
   * @private
   */
  private async ensureCacheDirAsync(): Promise<void> {
    const versionDir = this.getVersionCacheDir();

    try {
      await fs.mkdir(versionDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create cache directory: ${versionDir}`);
    }
  }

  /**
   * 检查并强制执行最大缓存大小限制
   * @private
   */
  private async enforceMaxSize(): Promise<void> {
    if (!this.maxSize) return;

    try {
      // 获取当前缓存大小
      const stats = await this.getStats();

      if (stats.totalSize > this.maxSize) {
        // 需要释放的空间
        const spaceToFree = stats.totalSize - this.maxSize + 1024 * 1024; // 额外释放1MB作为缓冲
        await this.makeSpace(spaceToFree);
      }
    } catch (err) {
      console.error('Failed to enforce max cache size:', err);
    }
  }

  /**
   * 为新数据腾出空间
   * @param neededSpace 需要的空间（字节）
   * @private
   */
  private async makeSpace(neededSpace: number): Promise<void> {
    if (!this.maxSize) return;

    try {
      const versionDir = this.getVersionCacheDir();
      const files = await fs.readdir(versionDir);

      // 跳过元数据文件
      const cacheFiles = files.filter((file) => file !== '.metadata.json');

      // 获取所有文件的信息
      const fileInfos = await Promise.all(
        cacheFiles.map(async (file) => {
          const filePath = path.join(versionDir, file);
          try {
            const stats = await fs.stat(filePath);
            return {
              path: filePath,
              size: stats.size,
              mtime: stats.mtime.getTime(),
            };
          } catch (err) {
            return null;
          }
        })
      );

      // 过滤掉无法获取信息的文件
      const validFiles = fileInfos.filter(
        (info): info is NonNullable<typeof info> => info !== null
      );

      // 按访问时间排序（最早的先删除）
      validFiles.sort((a, b) => a.mtime - b.mtime);

      let freedSpace = 0;
      for (const file of validFiles) {
        if (freedSpace >= neededSpace) break;

        try {
          await fs.unlink(file.path);
          freedSpace += file.size;
        } catch (err) {
          // 忽略单个文件删除错误
        }
      }
    } catch (err) {
      console.error('Failed to make space in cache:', err);
    }
  }

  /**
   * 加载统计信息
   * @private
   */
  private async loadStats(): Promise<void> {
    if (!this.enableStats || !this.initialized) return;

    try {
      if (existsSync(this.metadataFile)) {
        const data = await fs.readFile(this.metadataFile, 'utf-8');
        const stats = JSON.parse(data);

        this.hits = stats.hits || 0;
        this.misses = stats.misses || 0;
        this.writes = stats.writes || 0;
        this.deletes = stats.deletes || 0;
        this.statsStartTime = stats.statsStartTime || Date.now();
        this.recentAccesses = stats.recentAccesses || [];
        this.readTimes = stats.readTimes || [];
        this.writeTimes = stats.writeTimes || [];
      }
    } catch (err) {
      console.error('Failed to load cache stats:', err);
      // 错误时使用默认值
      this.resetStats();
    }
  }

  /**
   * 保存统计信息
   * @private
   */
  private async saveStats(): Promise<void> {
    if (!this.enableStats || !this.initialized) return;

    try {
      const stats = {
        hits: this.hits,
        misses: this.misses,
        writes: this.writes,
        deletes: this.deletes,
        statsStartTime: this.statsStartTime,
        recentAccesses: this.recentAccesses,
        readTimes: this.readTimes,
        writeTimes: this.writeTimes,
        lastUpdated: Date.now(),
      };

      await fs.writeFile(this.metadataFile, JSON.stringify(stats), 'utf-8');
    } catch (err) {
      console.error('Failed to save cache stats:', err);
    }
  }

  /**
   * 检查缓存项是否存在
   * @param key 缓存键
   * @returns Promise<是否存在>
   */
  async has(key: string): Promise<boolean> {
    const cacheFilePath = this.getCacheFilePath(key);
    try {
      await fs.access(cacheFilePath);

      // 如果文件存在，还需要检查是否过期
      if (this.ttl) {
        const stat = await fs.stat(cacheFilePath);
        const fileTime = stat.mtime.getTime();
        if (Date.now() - fileTime > this.ttl) {
          // 文件已过期，可以删除
          await fs.unlink(cacheFilePath).catch(() => {});
          return false;
        }
      }

      return true;
    } catch (error) {
      // 文件不存在或无法访问
      return false;
    }
  }
}

/**
 * 文件解析结果缓存
 * 单例实例，用于整个应用共享
 */
export const fileParseCache = new DiskCache({
  cacheDir: path.join(os.homedir(), '.safescan', 'parse-cache'),
  version: '1.0.0',
  ttl: 7 * 24 * 60 * 60 * 1000, // 默认7天过期
  compression: true,
  enableStats: true,
  maxSize: 500 * 1024 * 1024, // 最大500MB
  autoPruneInterval: 30 * 60 * 1000, // 30分钟自动清理
  useSharding: true,
});

/**
 * 保存解析结果到磁盘缓存
 * @param filePath 文件路径
 * @param hash 文件哈希
 * @param result 解析结果
 */
export async function saveParseResultToCache(
  filePath: string,
  hash: string,
  result: TParseResult
): Promise<void> {
  // 缓存键格式: 文件路径:文件哈希
  const cacheKey = `${filePath}:${hash}`;
  await fileParseCache.set(cacheKey, result);
}

/**
 * 从磁盘缓存获取解析结果
 * @param filePath 文件路径
 * @param hash 文件哈希
 * @returns Promise<解析结果或null>
 */
export async function getParseResultFromCache(
  filePath: string,
  hash: string
): Promise<TParseResult | null> {
  // 缓存键格式: 文件路径:文件哈希
  const cacheKey = `${filePath}:${hash}`;
  return fileParseCache.get<TParseResult>(cacheKey);
}
