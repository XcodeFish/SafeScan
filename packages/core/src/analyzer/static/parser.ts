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
    /** 强制重新扫描的文件路径模式 */
    forceRescanPatterns?: string[];
    /** 是否包括新添加的文件 */
    includeNewFiles?: boolean;
  };
}

// 解析器默认配置
const DEFAULT_PARSER_CONFIG: IParserConfig = {
  enableCache: true,
  enableDiskCache: true,
  incrementalScan: {
    enabled: true,
    stateFile: '.safescan-state.json',
    includeNewFiles: true,
    forceRescanPatterns: [],
  },
};

// 文件修改状态记录
interface IFileState {
  /** 文件哈希 */
  hash: string;
  /** 最后修改时间 */
  mtime: number;
  /** 文件大小 */
  size?: number;
}

// 增量扫描状态
interface IScanState {
  /** 文件状态映射 */
  files: Record<string, IFileState>;
  /** 状态创建时间 */
  createdAt: number;
  /** 最后更新时间 */
  updatedAt: number;
  /** 上次扫描的文件数量 */
  totalFiles?: number;
  /** 上次扫描的版本号 */
  version?: string;
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
      errors: [error instanceof Error ? error : new Error(String(error))],
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

    // 计算文件哈希用于缓存
    const hash = calculateHash(fileContent);

    // 使用parseCode解析文件内容
    const parseResult = await parseCode(fileContent, options, filePath, parserConfig);

    // 添加文件哈希和源代码
    return {
      ...parseResult,
      hash,
      sourceCode: fileContent, // 添加源代码
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error : new Error(String(error))],
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
    // 解析目录中所有匹配扩展名的文件
    const files = await readDirectoryRecursive(dirPath, extensions);

    // 根据扫描配置确定要扫描的文件
    let filesToScan = files;
    let previousState: IScanState | null = null;
    const stateFilePath = path.join(
      parserConfig.incrementalScan?.baseDir || dirPath,
      parserConfig.incrementalScan?.stateFile || DEFAULT_PARSER_CONFIG.incrementalScan!.stateFile!
    );

    // 增量扫描逻辑
    if (parserConfig.incrementalScan?.enabled) {
      // 加载上次扫描状态
      previousState = await loadScanState(stateFilePath);

      if (previousState) {
        // 过滤出变更的文件
        filesToScan = await filterChangedFiles(
          files,
          previousState,
          parserConfig.incrementalScan.forceRescanPatterns || [],
          parserConfig.incrementalScan.includeNewFiles !== false
        );

        console.log(
          `[增量扫描] 共检测到${files.length}个文件，需要扫描${filesToScan.length}个变更文件`
        );
      } else {
        console.log(`[首次扫描] 共检测到${files.length}个文件`);
      }
    }

    // 解析过滤后的文件
    const parsePromises = filesToScan.map((file) => parseFile(file, options, parserConfig));
    const results = await Promise.all(parsePromises);

    // 增量扫描模式下，合并新结果与先前缓存的结果
    let finalResults = results;
    if (
      parserConfig.incrementalScan?.enabled &&
      previousState &&
      filesToScan.length < files.length
    ) {
      finalResults = await mergeWithPreviousResults(results, files, previousState, parserConfig);
    }

    // 保存当前扫描状态（用于下次增量扫描）
    if (parserConfig.incrementalScan?.enabled) {
      await saveScanState(files, finalResults, stateFilePath);
    }

    return finalResults;
  } catch (error) {
    console.error('解析目录失败:', error);
    return [];
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
    const state = JSON.parse(stateData) as IScanState;
    return state;
  } catch (error) {
    // 状态文件不存在或无法解析
    return null;
  }
}

/**
 * 保存当前的扫描状态
 * @param files 扫描的文件路径
 * @param results 解析结果
 * @param stateFilePath 状态文件路径
 */
async function saveScanState(
  files: string[],
  results: TParseResult[],
  stateFilePath: string
): Promise<void> {
  try {
    // 创建结果映射以便于查找
    const resultMap = new Map<string, TParseResult>();
    results.forEach((result) => {
      if (result.filePath) {
        resultMap.set(result.filePath, result);
      }
    });

    // 收集文件状态
    const fileStates: Record<string, IFileState> = {};

    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        const result = resultMap.get(file);

        fileStates[file] = {
          hash: result?.hash || calculateFileHash(file, ''),
          mtime: Math.floor(stats.mtimeMs),
          size: stats.size,
        };
      } catch (error) {
        // 忽略无法获取状态的文件
      }
    }

    // 创建扫描状态
    const scanState: IScanState = {
      files: fileStates,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      totalFiles: files.length,
      version: '1.0.0',
    };

    // 确保状态文件的目录存在
    const stateFileDir = path.dirname(stateFilePath);
    await fs.mkdir(stateFileDir, { recursive: true });

    // 写入状态文件
    await fs.writeFile(stateFilePath, JSON.stringify(scanState, null, 2), 'utf-8');
  } catch (error) {
    console.error('保存扫描状态失败:', error);
  }
}

/**
 * 过滤出已变更的文件
 * @param files 所有文件路径
 * @param previousState 先前的扫描状态
 * @param forceRescanPatterns 强制重新扫描的文件路径模式
 * @param includeNewFiles 是否包含新添加的文件
 * @returns 需要重新扫描的文件路径数组
 */
async function filterChangedFiles(
  files: string[],
  previousState: IScanState,
  forceRescanPatterns: string[] = [],
  includeNewFiles: boolean = true
): Promise<string[]> {
  const changedFiles: string[] = [];

  for (const file of files) {
    try {
      // 检查是否匹配强制重新扫描的模式
      if (
        forceRescanPatterns.length > 0 &&
        forceRescanPatterns.some((pattern) => file.includes(pattern))
      ) {
        changedFiles.push(file);
        continue;
      }

      // 获取文件状态
      const stats = await fs.stat(file);

      // 检查文件是否在先前的扫描状态中
      const previousFileState = previousState.files[file];

      if (!previousFileState) {
        // 新文件，如果启用了包含新文件，则添加到变更列表
        if (includeNewFiles) {
          changedFiles.push(file);
        }
        continue;
      }

      // 检查文件是否被修改（比较修改时间和文件大小）
      if (
        Math.floor(stats.mtimeMs) > previousFileState.mtime ||
        (previousFileState.size !== undefined && stats.size !== previousFileState.size)
      ) {
        changedFiles.push(file);
      }
    } catch (error) {
      // 无法获取文件状态，保守地添加到变更列表
      changedFiles.push(file);
    }
  }

  return changedFiles;
}

/**
 * 合并新解析结果与先前的结果
 * @param newResults 新解析的结果
 * @param allFiles 所有文件路径
 * @param previousState 先前的扫描状态
 * @param parserConfig 解析器配置
 * @returns 合并后的解析结果
 */
async function mergeWithPreviousResults(
  newResults: TParseResult[],
  allFiles: string[],
  previousState: IScanState,
  parserConfig: IParserConfig
): Promise<TParseResult[]> {
  // 创建映射以快速查找新结果
  const newResultsMap = new Map<string, TParseResult>();
  newResults.forEach((result) => {
    if (result.filePath) {
      newResultsMap.set(result.filePath, result);
    }
  });

  const mergedResults: TParseResult[] = [...newResults];

  // 对于未在新结果中的文件，尝试从缓存加载
  const filesToRestore = allFiles.filter((file) => !newResultsMap.has(file));

  for (const file of filesToRestore) {
    const previousFile = previousState.files[file];

    if (!previousFile) {
      continue;
    }

    // 尝试从内存缓存获取
    const cacheKey = `${file}:${previousFile.hash}`;
    let cachedResult = parseResultCache.get(cacheKey);

    if (!cachedResult && parserConfig.enableDiskCache) {
      // 尝试从磁盘缓存获取
      const diskResult = await getParseResultFromCache(file, previousFile.hash);

      // 如果找到结果，更新内存缓存
      if (diskResult && parserConfig.enableCache) {
        parseResultCache.set(cacheKey, diskResult);
        cachedResult = diskResult;
      }
    }

    // 如果找到缓存的结果，添加到合并结果
    if (cachedResult) {
      mergedResults.push(cachedResult);
    }
  }

  return mergedResults;
}
