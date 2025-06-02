/**
 * SWC解析器封装
 * 提供高性能AST生成功能
 */
import fs from 'fs/promises';
import path from 'path';
import { parse as swcParse } from '@swc/core';
import type { Module } from '@swc/core';
import { getParseResultFromCache, saveParseResultToCache } from '../../cache/disk';
import { parseResultCache } from '../../cache/memory';
import type { TParseOptions, TParseResult } from '../../types';
import { calculateFileHash, calculateHash } from '../../utils/hash';

/**
 * 解析配置
 */
export interface IParserConfig {
  /** 是否启用缓存 */
  enableCache?: boolean;
  /** 是否使用磁盘缓存 */
  enableDiskCache?: boolean;
  /** 扫描文件时的增量模式配置 */
  incrementalScan?: {
    /** 是否启用增量扫描 */
    enabled: boolean;
    /** 基准文件路径（用于对比变更） */
    baseDir?: string;
    /** 增量扫描的记录文件 */
    stateFile?: string;
  };
}

// 解析器默认配置
const DEFAULT_PARSER_CONFIG: IParserConfig = {
  enableCache: true,
  enableDiskCache: true,
  incrementalScan: {
    enabled: true,
    stateFile: '.safescan-state.json',
  },
};

// 文件修改状态记录
interface IFileState {
  /** 文件哈希 */
  hash: string;
  /** 最后修改时间 */
  mtime: number;
}

// 增量扫描状态
interface IScanState {
  /** 文件状态映射 */
  files: Record<string, IFileState>;
  /** 状态创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
}

/**
 * 根据文件扩展名推断解析配置
 * @param filePath 文件路径
 * @returns 解析配置
 */
function inferParseOptions(filePath: string): any {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.ts':
      return {
        syntax: 'typescript',
        tsx: false,
      };
    case '.tsx':
      return {
        syntax: 'typescript',
        tsx: true,
      };
    case '.jsx':
      return {
        syntax: 'ecmascript',
        jsx: true,
      };
    case '.js':
    default:
      return {
        syntax: 'ecmascript',
        jsx: false,
      };
  }
}

/**
 * 转换内部解析选项为SWC选项
 * @param options 内部解析选项
 * @param filePath 文件路径
 * @returns SWC解析选项
 */
function convertToSwcOptions(options?: TParseOptions, filePath?: string): any {
  // 基础配置
  const baseOptions: any = {
    decorators: true,
    dynamicImport: true,
  };

  // 根据文件扩展名或语言选择语法配置
  if (filePath) {
    Object.assign(baseOptions, inferParseOptions(filePath));
  } else if (options?.language) {
    switch (options.language) {
      case 'typescript':
        Object.assign(baseOptions, { syntax: 'typescript', tsx: false });
        break;
      case 'tsx':
        Object.assign(baseOptions, { syntax: 'typescript', tsx: true });
        break;
      case 'jsx':
        Object.assign(baseOptions, { syntax: 'ecmascript', jsx: true });
        break;
      case 'javascript':
      default:
        Object.assign(baseOptions, { syntax: 'ecmascript', jsx: false });
        break;
    }
  } else {
    // 默认使用TypeScript
    Object.assign(baseOptions, { syntax: 'typescript', tsx: false });
  }

  // 应用用户自定义选项
  if (options?.parserOptions) {
    Object.assign(baseOptions, options.parserOptions);
  }

  return baseOptions;
}

/**
 * 解析代码字符串生成AST
 * @param code 代码字符串
 * @param options 解析选项
 * @param filePath 文件路径（可选）
 * @param parserConfig 解析器配置
 * @returns 解析结果
 */
export async function parseCode(
  code: string,
  options?: TParseOptions,
  filePath?: string,
  parserConfig: IParserConfig = DEFAULT_PARSER_CONFIG
): Promise<TParseResult> {
  try {
    // 计算内容哈希
    const hash = filePath ? calculateFileHash(filePath, code) : calculateHash(code);

    // 检查内存缓存
    if (parserConfig.enableCache) {
      const cacheKey = filePath ? `${filePath}:${hash}` : hash;
      const cachedResult = parseResultCache.get(cacheKey);

      if (cachedResult) {
        return cachedResult;
      }

      // 检查磁盘缓存
      if (parserConfig.enableDiskCache && filePath) {
        const diskCachedResult = await getParseResultFromCache(filePath, hash);
        if (diskCachedResult) {
          // 更新内存缓存
          parseResultCache.set(cacheKey, diskCachedResult);
          return diskCachedResult;
        }
      }
    }

    // 没有缓存命中，执行实际解析
    const swcOptions = convertToSwcOptions(options, filePath);
    const ast = (await swcParse(code, swcOptions)) as unknown as Module;

    const result: TParseResult = {
      success: true,
      ast,
      filePath: filePath || 'unknown',
      hash,
    };

    // 更新缓存
    if (parserConfig.enableCache) {
      const cacheKey = filePath ? `${filePath}:${hash}` : hash;
      parseResultCache.set(cacheKey, result);

      // 更新磁盘缓存
      if (parserConfig.enableDiskCache && filePath) {
        await saveParseResultToCache(filePath, hash, result);
      }
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      filePath: filePath || 'unknown',
    };
  }
}

/**
 * 从文件中读取并解析代码生成AST
 * @param filePath 文件路径
 * @param options 解析选项
 * @param parserConfig 解析器配置
 * @returns 解析结果
 */
export async function parseFile(
  filePath: string,
  options?: TParseOptions,
  parserConfig: IParserConfig = DEFAULT_PARSER_CONFIG
): Promise<TParseResult> {
  try {
    // 读取文件内容
    const fileContent = await fs.readFile(filePath, 'utf-8');

    // 使用parseCode解析文件内容
    return parseCode(fileContent, options, filePath, parserConfig);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      filePath,
    };
  }
}

/**
 * 解析目录中的所有匹配文件
 * @param dirPath 目录路径
 * @param extensions 要处理的文件扩展名数组
 * @param options 解析选项
 * @param parserConfig 解析器配置
 * @returns 解析结果数组的Promise
 */
export async function parseDirectory(
  dirPath: string,
  extensions: string[] = ['.js', '.jsx', '.ts', '.tsx'],
  options?: TParseOptions,
  parserConfig: IParserConfig = DEFAULT_PARSER_CONFIG
): Promise<TParseResult[]> {
  try {
    // 如果启用增量扫描，加载之前的状态
    let previousState: IScanState | null = null;
    if (parserConfig.incrementalScan?.enabled) {
      previousState = await loadScanState(
        parserConfig.incrementalScan.stateFile || path.join(dirPath, '.safescan-state.json')
      );
    }

    // 读取目录中的所有文件
    const files = await readDirectoryRecursive(dirPath, extensions);

    // 如果启用增量扫描，筛选出变更的文件
    let filesToParse = files;
    if (previousState && parserConfig.incrementalScan?.enabled) {
      filesToParse = await filterChangedFiles(files, previousState);
    }

    // 并行解析所有文件
    const parsePromises = filesToParse.map((file) => parseFile(file, options, parserConfig));
    const newResults = await Promise.all(parsePromises);

    // 如果启用增量扫描，合并之前的结果
    let results = newResults;
    if (previousState && parserConfig.incrementalScan?.enabled) {
      results = await mergeWithPreviousResults(newResults, files, previousState, parserConfig);
    }

    // 更新扫描状态
    if (parserConfig.incrementalScan?.enabled) {
      await saveScanState(
        files,
        results,
        parserConfig.incrementalScan.stateFile || path.join(dirPath, '.safescan-state.json')
      );
    }

    return results;
  } catch (error) {
    // 返回一个只包含错误信息的解析结果
    return [
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        filePath: dirPath,
      },
    ];
  }
}

/**
 * 递归读取目录中的所有匹配文件
 * @param dirPath 目录路径
 * @param extensions 要处理的文件扩展名数组
 * @returns 文件路径数组的Promise
 */
async function readDirectoryRecursive(dirPath: string, extensions: string[]): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // 递归处理子目录
      const subDirFiles = await readDirectoryRecursive(fullPath, extensions);
      results.push(...subDirFiles);
    } else if (entry.isFile()) {
      // 检查文件扩展名是否匹配
      const ext = path.extname(entry.name).toLowerCase();
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

/**
 * 加载增量扫描状态
 * @param stateFilePath 状态文件路径
 * @returns 扫描状态或null
 */
async function loadScanState(stateFilePath: string): Promise<IScanState | null> {
  try {
    const stateData = await fs.readFile(stateFilePath, 'utf-8');
    return JSON.parse(stateData) as IScanState;
  } catch (error) {
    // 状态文件不存在或无法解析
    return null;
  }
}

/**
 * 保存增量扫描状态
 * @param files 文件列表
 * @param results 解析结果
 * @param stateFilePath 状态文件路径
 */
async function saveScanState(
  files: string[],
  results: TParseResult[],
  stateFilePath: string
): Promise<void> {
  try {
    // 创建文件状态映射
    const fileStates: Record<string, IFileState> = {};

    // 获取成功解析的结果
    const successResults = results.filter((result) => result.success);

    // 获取所有文件的哈希和修改时间
    for (const file of files) {
      try {
        // 寻找对应的解析结果
        const result = successResults.find((r) => r.filePath === file);

        if (result && result.hash) {
          const stats = await fs.stat(file);

          fileStates[file] = {
            hash: result.hash,
            mtime: stats.mtimeMs,
          };
        }
      } catch (err) {
        // 忽略单个文件的错误
      }
    }

    // 创建状态对象
    const state: IScanState = {
      files: fileStates,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // 确保状态文件目录存在
    const stateDir = path.dirname(stateFilePath);
    await fs.mkdir(stateDir, { recursive: true });

    // 写入状态文件
    await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save scan state:', error);
  }
}

/**
 * 筛选出已更改的文件
 * @param files 所有文件列表
 * @param previousState 之前的扫描状态
 * @returns 已更改的文件列表
 */
async function filterChangedFiles(files: string[], previousState: IScanState): Promise<string[]> {
  const changedFiles: string[] = [];

  for (const file of files) {
    try {
      const stats = await fs.stat(file);
      const prevState = previousState.files[file];

      // 如果文件是新增的或修改时间变更，认为文件已更改
      if (!prevState || stats.mtimeMs > prevState.mtime) {
        changedFiles.push(file);
        continue;
      }

      // 进一步检查文件内容是否变更
      const content = await fs.readFile(file, 'utf-8');
      const currentHash = calculateFileHash(file, content);

      if (currentHash !== prevState.hash) {
        changedFiles.push(file);
      }
    } catch (error) {
      // 文件访问错误，将其添加到变更列表中
      changedFiles.push(file);
    }
  }

  return changedFiles;
}

/**
 * 合并新旧解析结果
 * @param newResults 新的解析结果
 * @param allFiles 所有文件列表
 * @param previousState 之前的扫描状态
 * @param parserConfig 解析器配置
 * @returns 合并后的解析结果
 */
async function mergeWithPreviousResults(
  newResults: TParseResult[],
  allFiles: string[],
  previousState: IScanState,
  parserConfig: IParserConfig
): Promise<TParseResult[]> {
  const results = [...newResults];
  const processedFiles = new Set(newResults.map((r) => r.filePath));

  // 对于未处理的文件，尝试从缓存中获取之前的结果
  for (const file of allFiles) {
    if (processedFiles.has(file)) {
      continue;
    }

    const prevState = previousState.files[file];
    if (!prevState) {
      continue;
    }

    // 尝试从缓存中获取之前的解析结果
    if (parserConfig.enableCache && parserConfig.enableDiskCache) {
      const cachedResult = await getParseResultFromCache(file, prevState.hash);
      if (cachedResult) {
        results.push(cachedResult);
        continue;
      }
    }

    // 如果缓存中没有，重新解析文件
    const result = await parseFile(file, undefined, parserConfig);
    results.push(result);
  }

  return results;
}
