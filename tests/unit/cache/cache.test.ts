/**
 * 缓存系统测试
 * 测试内存LRU缓存和磁盘持久化缓存功能
 */
import { existsSync } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DiskCache } from '../../../packages/core/src/cache/disk';
import { LRUCache, estimateObjectSize } from '../../../packages/core/src/cache/memory';

describe('内存LRU缓存测试', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    // 创建测试缓存实例
    cache = new LRUCache<string>({
      maxSize: 10,
      ttl: 100, // 100ms过期
      enableStats: true,
      trackMemoryUsage: true,
    });
  });

  it('应该能够设置和获取缓存项', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('应该遵循LRU逻辑', () => {
    // 填满缓存
    for (let i = 0; i < 10; i++) {
      cache.set(`key${i}`, `value${i}`);
    }

    // 所有项都应存在
    for (let i = 0; i < 10; i++) {
      expect(cache.get(`key${i}`)).toBe(`value${i}`);
    }

    // 添加新项，最早访问的项应被淘汰
    cache.set('key10', 'value10');
    expect(cache.get('key0')).toBeUndefined();
    expect(cache.get('key10')).toBe('value10');
  });

  it('应该正确处理项过期', async () => {
    cache.set('expireKey', 'expireValue', 50);
    expect(cache.get('expireKey')).toBe('expireValue');

    // 等待过期
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(cache.get('expireKey')).toBeUndefined();
  });

  it('应该正确计算对象大小', () => {
    const obj = {
      name: 'test',
      value: 123,
      nested: { a: 1, b: 'string' },
      array: [1, 2, 3, 4],
    };

    const size = estimateObjectSize(obj);
    expect(size).toBeGreaterThan(0);
  });

  it('应该提供正确的统计信息', () => {
    cache.set('stat1', 'value1');
    cache.get('stat1');
    cache.get('nonexistent');

    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.size).toBe(1);
  });

  it('应该能够清空缓存', () => {
    cache.set('clearKey', 'clearValue');
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('应该优先淘汰低效率的缓存项', () => {
    // 使用自定义LRU缓存，启用内存追踪
    const memoryCache = new LRUCache<{ value: string }>({
      maxSize: 3,
      trackMemoryUsage: true,
    });

    // 添加一个大项，低访问次数
    memoryCache.set('large', { value: 'a'.repeat(10000) }, undefined, 10000);
    memoryCache.get('large'); // 访问1次

    // 添加一个小项，高访问次数
    memoryCache.set('small', { value: 'small' }, undefined, 100);
    for (let i = 0; i < 10; i++) {
      memoryCache.get('small'); // 访问10次
    }

    // 添加第三个项
    memoryCache.set('medium', { value: 'medium' }, undefined, 500);

    // 触发淘汰机制，应该淘汰大项
    memoryCache.set('new', { value: 'new' }, undefined, 200);

    expect(memoryCache.get('small')).not.toBeUndefined();
    expect(memoryCache.get('medium')).not.toBeUndefined();
    expect(memoryCache.get('new')).not.toBeUndefined();
    expect(memoryCache.get('large')).toBeUndefined();
  });
});

describe('磁盘缓存测试', () => {
  // 创建临时缓存目录
  const tempDir = path.join(os.tmpdir(), 'safescan-test-cache-' + Date.now());
  let diskCache: DiskCache;

  beforeEach(async () => {
    if (!existsSync(tempDir)) {
      await fs.mkdir(tempDir, { recursive: true });
    }

    diskCache = new DiskCache({
      cacheDir: tempDir,
      version: 'test',
      ttl: 100, // 100ms过期
      compression: true,
      enableStats: true,
    });
  });

  afterEach(async () => {
    // 清理缓存目录
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error('清理测试缓存目录失败:', e);
    }
  });

  it('应该能够设置和获取缓存项', async () => {
    const testValue = { data: 'value1', number: 123 };
    await diskCache.set('key1', testValue);
    const result = await diskCache.get('key1');
    expect(result).toEqual(testValue);
  });

  it('应该正确处理项过期', async () => {
    await diskCache.set('expireKey', 'expireValue');
    expect(await diskCache.get('expireKey')).toBe('expireValue');

    // 等待过期
    await new Promise((resolve) => setTimeout(resolve, 110));
    expect(await diskCache.get('expireKey')).toBeNull();
  });

  it('应该能够删除缓存项', async () => {
    await diskCache.set('deleteKey', 'deleteValue');
    expect(await diskCache.get('deleteKey')).toBe('deleteValue');

    const deleted = await diskCache.delete('deleteKey');
    expect(deleted).toBeTruthy();
    expect(await diskCache.get('deleteKey')).toBeNull();
  });

  it('应该能够清空缓存', async () => {
    await diskCache.set('key1', 'value1');
    await diskCache.set('key2', 'value2');

    const cleared = await diskCache.clear();
    expect(cleared).toBeTruthy();
    expect(await diskCache.get('key1')).toBeNull();
    expect(await diskCache.get('key2')).toBeNull();
  });

  it('应该提供正确的统计信息', async () => {
    await diskCache.set('stat1', 'value1');
    await diskCache.get('stat1');
    await diskCache.get('nonexistent');

    const stats = await diskCache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.writes).toBe(1);
  });

  it('应该支持压缩数据', async () => {
    // 创建一个大数据项，应该被压缩
    const largeData = 'a'.repeat(10000);

    await diskCache.set('largeKey', largeData);
    const retrieved = await diskCache.get<string>('largeKey');

    expect(retrieved).toBe(largeData);
  });
});

describe('集成测试：解析结果缓存', () => {
  // 模拟解析结果
  const mockParseResult = {
    success: true,
    filePath: '/test/file.ts',
    hash: '123456',
    ast: { type: 'Module', body: [] },
  };

  it('测试解析结果内存缓存', () => {
    const cache = new LRUCache<typeof mockParseResult>();

    const key = `${mockParseResult.filePath}:${mockParseResult.hash}`;
    cache.set(key, mockParseResult);

    const result = cache.get(key);
    expect(result).toEqual(mockParseResult);
  });

  it('测试解析结果磁盘缓存', async () => {
    // 创建临时测试目录
    const tempCacheDir = path.join(os.tmpdir(), 'safescan-parse-test-' + Date.now());

    const diskCache = new DiskCache({
      cacheDir: tempCacheDir,
      compression: true,
    });

    const key = `${mockParseResult.filePath}:${mockParseResult.hash}`;
    await diskCache.set(key, mockParseResult);

    const result = await diskCache.get(key);
    expect(result).toEqual(mockParseResult);

    // 清理
    await fs.rm(tempCacheDir, { recursive: true, force: true });
  });
});
