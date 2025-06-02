/**
 * SWC解析器封装
 * 提供高性能AST生成功能
 */
import fs from 'fs/promises';
import path from 'path';
import { parse as swcParse } from '@swc/core';
import type { Module } from '@swc/core';
import type { TParseOptions, TParseResult } from '../../types';
import { calculateFileHash } from '../../utils/hash';

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
 * @returns 解析结果
 */
export async function parseCode(
  code: string,
  options?: TParseOptions,
  filePath?: string
): Promise<TParseResult> {
  try {
    const swcOptions = convertToSwcOptions(options, filePath);
    const ast = (await swcParse(code, swcOptions)) as unknown as Module;

    return {
      success: true,
      ast,
      filePath: filePath || 'unknown',
      hash: filePath ? calculateFileHash(filePath, code) : undefined,
    };
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
 * @returns 解析结果
 */
export async function parseFile(filePath: string, options?: TParseOptions): Promise<TParseResult> {
  try {
    // 读取文件内容
    const fileContent = await fs.readFile(filePath, 'utf-8');

    // 使用parseCode解析文件内容
    return parseCode(fileContent, options, filePath);
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
 * @returns 解析结果数组的Promise
 */
export async function parseDirectory(
  dirPath: string,
  extensions: string[] = ['.js', '.jsx', '.ts', '.tsx'],
  options?: TParseOptions
): Promise<TParseResult[]> {
  try {
    const files = await readDirectoryRecursive(dirPath, extensions);

    // 并行解析所有文件
    const parsePromises = files.map((file) => parseFile(file, options));
    return await Promise.all(parsePromises);
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
