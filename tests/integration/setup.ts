/**
 * 集成测试设置文件
 */
import { mkdirSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';
import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

// 测试文件根目录
export const TEST_ROOT = resolve(__dirname, '../temp');

/**
 * 创建测试文件目录
 */
export function createTestDir(suffix: string): string {
  const testDir = resolve(TEST_ROOT, suffix);
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
  return testDir;
}

/**
 * 清理测试文件目录
 */
export function cleanTestDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// 全局测试设置
beforeAll(() => {
  // 确保测试根目录存在
  if (!existsSync(TEST_ROOT)) {
    mkdirSync(TEST_ROOT, { recursive: true });
  }

  // 设置其他全局测试状态
  process.env.NODE_ENV = 'test';
});

// 全局测试清理
afterAll(() => {
  // 清理测试目录
  cleanTestDir(TEST_ROOT);

  // 清理其他全局测试状态
  delete process.env.NODE_ENV;
});

// 每个测试前的设置
beforeEach(() => {
  // 每个测试前的重置逻辑
});

// 每个测试后的清理
afterEach(() => {
  // 每个测试后的清理逻辑
  vi.restoreAllMocks();
});
