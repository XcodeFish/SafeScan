/**
 * 磁盘缓存实现
 * 提供基于文件系统的持久化缓存
 */
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { TParseResult } from '../types';
import { calculateHash } from '../utils/hash';

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
}

/**
 * 磁盘缓存实现类
 */
export class DiskCache {
  private cacheDir: string;
  private version: string;
  private ttl?: number;

  /**
   * 创建磁盘缓存实例
   * @param options 缓存配置
   */
  constructor(options: IDiskCacheOptions = {}) {
    this.cacheDir = options.cacheDir || DEFAULT_CACHE_DIR;
    this.version = options.version || '1.0.0';
    this.ttl = options.ttl;

    // 确保版本化缓存目录存在
    this.ensureCacheDirAsync().catch((err) => {
      console.error('Failed to create cache directory:', err);
    });
  }

  /**
   * 获取缓存项
   * @param key 缓存键
   * @returns Promise<缓存值或null（如果不存在或已过期）>
   */
  async get<T>(key: string): Promise<T | null> {
    const cacheFilePath = this.getCacheFilePath(key);

    try {
      // 检查文件是否存在
      await fs.access(cacheFilePath);

      // 读取缓存文件
      const cacheData = await fs.readFile(cacheFilePath, 'utf-8');
      const { value, timestamp } = JSON.parse(cacheData);

      // 检查是否过期
      if (this.ttl && Date.now() - timestamp > this.ttl) {
        // 删除过期缓存
        await fs.unlink(cacheFilePath).catch(() => {});
        return null;
      }

      return value as T;
    } catch (error) {
      // 文件不存在或读取失败
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
    const cacheFilePath = this.getCacheFilePath(key);

    try {
      // 确保缓存目录存在
      await this.ensureCacheDirAsync();

      // 创建缓存数据
      const cacheData = {
        value,
        timestamp: Date.now(),
      };

      // 写入缓存文件
      await fs.writeFile(cacheFilePath, JSON.stringify(cacheData), 'utf-8');

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

      for (const file of files) {
        const filePath = path.join(versionDir, file);

        try {
          const stats = await fs.stat(filePath);

          // 检查文件修改时间是否超过TTL
          if (now - stats.mtimeMs > this.ttl) {
            await fs.unlink(filePath);
            count++;
          }
        } catch (err) {
          // 忽略单个文件的错误
        }
      }

      return count;
    } catch (error) {
      console.error('Failed to prune cache:', error);
      return 0;
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
}

/**
 * 文件解析结果缓存
 * 单例实例，用于整个应用共享
 */
export const fileParseCache = new DiskCache({
  cacheDir: path.join(os.homedir(), '.safescan', 'parse-cache'),
  version: '1.0.0',
  ttl: 7 * 24 * 60 * 60 * 1000, // 默认7天过期
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
  return await fileParseCache.get<TParseResult>(cacheKey);
}
