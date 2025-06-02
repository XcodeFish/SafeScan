/**
 * 测试辅助工具函数
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { vi } from 'vitest';

/**
 * 创建异步延迟函数
 * @param ms 延迟毫秒数
 */
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 创建一个解决/拒绝的可控制Promise
 */
export interface IControlledPromise<T = void> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error?: any) => void;
}

export function createControlledPromise<T = void>(): IControlledPromise<T> {
  let resolve!: (value: T) => void;
  let reject!: (error?: any) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

/**
 * 创建模拟的事件处理器
 */
export function createMockEventHandler<T = any>() {
  return vi.fn().mockImplementation((_: T) => {});
}

/**
 * 模拟控制台日志
 */
export function mockConsole() {
  // const originalConsole = { ...console };
  const mocks = {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
  };

  return {
    mocks,
    restore: () => {
      Object.keys(mocks).forEach((key) => {
        mocks[key as keyof typeof mocks].mockRestore();
      });
    },
  };
}

/**
 * 捕获抛出的错误
 */
export async function catchError<T = Error>(fn: () => any | Promise<any>): Promise<T | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error as T;
  }
}

/**
 * 创建一个模拟的文件对象
 */
export function createMockFile(options: {
  name: string;
  content?: string;
  type?: string;
  size?: number;
}): File {
  const { name, content = '', type = 'text/plain', size = content.length } = options;

  const file = new File([content], name, { type });

  // 为了测试目的，我们可能需要覆盖一些只读属性
  Object.defineProperty(file, 'size', { value: size });

  return file;
}

/**
 * 模拟网络请求
 */
export function mockFetch(responses: Record<string, any>) {
  const originalFetch = global.fetch;

  const mockFetchImpl = vi.fn().mockImplementation((url: string, _options?: RequestInit) => {
    const urlKey = Object.keys(responses).find((key) => url.includes(key));

    if (!urlKey) {
      return Promise.reject(new Error(`No mock response for URL: ${url}`));
    }

    const response = responses[urlKey];

    if (response instanceof Error) {
      return Promise.reject(response);
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(response),
      text: () => Promise.resolve(JSON.stringify(response)),
      headers: new Headers(),
      statusText: 'OK',
    } as Response);
  });

  global.fetch = mockFetchImpl as any;

  return {
    mockFetch: mockFetchImpl,
    restore: () => {
      global.fetch = originalFetch;
    },
  };
}

/**
 * 创建一个测试存储对象（模拟localStorage）
 */
export function createTestStorage() {
  const store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((key) => delete store[key]);
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
    getAll: () => ({ ...store }),
  };
}

/**
 * 模拟定时器
 */
export function mockTimers() {
  vi.useFakeTimers();

  return {
    advanceTime: (ms: number) => vi.advanceTimersByTime(ms),
    advanceToNextTimer: () => vi.advanceTimersToNextTimer(),
    runAllTimers: () => vi.runAllTimers(),
    restore: () => vi.useRealTimers(),
  };
}

/**
 * 模拟路径和文件系统
 */
export function mockFs(files: Record<string, string | Buffer>) {
  const existsSyncMock = vi.spyOn(fs, 'existsSync').mockImplementation((filePath: fs.PathLike) => {
    return Object.keys(files).some((f) => path.resolve(f) === path.resolve(filePath.toString()));
  });

  const readFileSyncMock = vi
    .spyOn(fs, 'readFileSync')
    .mockImplementation((filePath: fs.PathOrFileDescriptor, _options?: any) => {
      const normalizedPath = path.resolve(filePath.toString());
      const foundKey = Object.keys(files).find((f) => path.resolve(f) === normalizedPath);

      if (!foundKey) {
        throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
      }

      return files[foundKey];
    });

  return {
    mocks: {
      existsSync: existsSyncMock,
      readFileSync: readFileSyncMock,
    },
    restore: () => {
      existsSyncMock.mockRestore();
      readFileSyncMock.mockRestore();
    },
  };
}

/**
 * 创建一个自动恢复的测试环境
 */
export function createTestEnvironment() {
  const cleanupFns: Array<() => void> = [];

  return {
    add: <T>(resource: T, cleanup: (resource: T) => void) => {
      cleanupFns.push(() => cleanup(resource));
      return resource;
    },
    cleanup: () => {
      cleanupFns.forEach((fn) => fn());
      cleanupFns.length = 0;
    },
  };
}

/**
 * 创建临时报告目录
 * @param dirName 目录名称
 * @returns 目录路径
 */
export function createReportDir(dirName: string): string {
  const tmpDir = os.tmpdir();
  const reportDir = path.join(tmpDir, 'safescan-tests', dirName);

  // 创建目录
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  return reportDir;
}

/**
 * 创建临时文件
 * @param fileName 文件名
 * @param content 文件内容
 * @returns 文件路径
 */
export function createTempFile(fileName: string, content: string): string {
  const tmpDir = os.tmpdir();
  const filePath = path.join(tmpDir, 'safescan-tests', fileName);

  // 创建目录
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  // 写入文件
  fs.writeFileSync(filePath, content);

  return filePath;
}

/**
 * 随机生成ID
 * @returns 随机ID
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

/**
 * 模拟内存对象
 * @param type 对象类型
 * @param name 对象名称
 * @param size 对象大小
 * @returns 模拟的内存对象
 */
export function mockMemoryObject(type: string, name: string, size: number = 1024): any {
  return {
    id: generateId(),
    type,
    name,
    size,
    metadata: {},
    outgoingReferences: [],
  };
}

/**
 * 模拟内存快照
 * @param objects 内存对象数组
 * @returns 模拟的内存快照
 */
export function mockMemorySnapshot(objects: any[] = []): any {
  // 从对象中收集所有引用关系
  const references = [];

  // 遍历所有对象，收集outgoingReferences
  for (const obj of objects) {
    if (obj.outgoingReferences && Array.isArray(obj.outgoingReferences)) {
      references.push(...obj.outgoingReferences);
    }
  }

  return {
    id: generateId(),
    timestamp: Date.now(),
    objects,
    references, // 添加引用关系数组
    heapStats: {
      totalSize: objects.reduce((sum, obj) => sum + obj.size, 0),
      objectCount: objects.length,
    },
  };
}
