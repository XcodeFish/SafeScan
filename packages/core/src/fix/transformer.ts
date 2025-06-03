import * as swc from '@swc/core';
import { ISourceLocation } from './types';

/**
 * 转换参数接口
 */
export interface ITransformation {
  /** 转换类型 */
  type: 'replace' | 'insert' | 'delete' | 'wrapper';
  /** 目标位置 */
  location: ISourceLocation;
  /** 新代码内容(对于replace和insert) */
  code?: string;
  /** 包装前缀(对于wrapper) */
  prefix?: string;
  /** 包装后缀(对于wrapper) */
  suffix?: string;
}

/**
 * 使用SWC转换AST
 * @param code 源代码
 * @param visitor 访问器
 * @returns 转换后代码
 */
export async function transformWithSWC(code: string, visitor: swc.Visitor): Promise<string> {
  try {
    // 解析代码生成AST
    const ast = await swc.parse(code, {
      syntax: 'typescript',
      tsx: code.endsWith('.tsx'),
      target: 'es2022',
    });

    // 转换AST
    const transformed = swc.transform(ast, {
      plugin: (m) => visitor.visitProgram(m),
    });

    return transformed.code;
  } catch (error) {
    console.error('SWC转换失败:', error);
    throw new Error('代码转换失败');
  }
}

/**
 * 应用文本级别的转换
 * @param code 源代码
 * @param transformations 转换列表
 * @returns 转换后代码
 */
export function applyTextTransformations(code: string, transformations: ITransformation[]): string {
  // 将源代码分割成行
  const lines = code.split('\n');

  // 按位置从后向前排序转换,避免位置偏移问题
  const sortedTransformations = [...transformations].sort((a, b) => {
    return (
      b.location.startLine - a.location.startLine || b.location.startColumn - a.location.startColumn
    );
  });

  for (const transformation of sortedTransformations) {
    const { type, location, code: newCode, prefix, suffix } = transformation;
    const { startLine, startColumn, endLine, endColumn } = location;

    // 转换索引(0-based)
    const startLineIndex = startLine - 1;
    const endLineIndex = endLine - 1;

    switch (type) {
      case 'replace': {
        if (startLine === endLine) {
          // 单行替换
          const line = lines[startLineIndex];
          lines[startLineIndex] =
            line.substring(0, startColumn) + newCode + line.substring(endColumn);
        } else {
          // 多行替换
          const startLineContent = lines[startLineIndex];
          const endLineContent = lines[endLineIndex];

          // 保留首尾行的前后部分
          const startLinePrefix = startLineContent.substring(0, startColumn);
          const endLineSuffix = endLineContent.substring(endColumn);

          // 合并首尾行
          lines[startLineIndex] = startLinePrefix + newCode + endLineSuffix;

          // 移除中间行
          lines.splice(startLineIndex + 1, endLineIndex - startLineIndex);
        }
        break;
      }

      case 'insert': {
        const line = lines[startLineIndex];
        lines[startLineIndex] =
          line.substring(0, startColumn) + newCode + line.substring(startColumn);
        break;
      }

      case 'delete': {
        if (startLine === endLine) {
          // 单行删除
          const line = lines[startLineIndex];
          lines[startLineIndex] = line.substring(0, startColumn) + line.substring(endColumn);
        } else {
          // 多行删除
          const startLineContent = lines[startLineIndex];
          const endLineContent = lines[endLineIndex];

          // 保留首尾行的前后部分
          const startLinePrefix = startLineContent.substring(0, startColumn);
          const endLineSuffix = endLineContent.substring(endColumn);

          // 合并首尾行
          lines[startLineIndex] = startLinePrefix + endLineSuffix;

          // 移除中间行
          lines.splice(startLineIndex + 1, endLineIndex - startLineIndex);
        }
        break;
      }

      case 'wrapper': {
        if (startLine === endLine) {
          // 单行包装
          const line = lines[startLineIndex];
          const content = line.substring(startColumn, endColumn);
          lines[startLineIndex] =
            line.substring(0, startColumn) + prefix + content + suffix + line.substring(endColumn);
        } else {
          // 多行包装
          const startLineContent = lines[startLineIndex];
          const endLineContent = lines[endLineIndex];

          // 提取需要包装的内容
          const startFragment = startLineContent.substring(startColumn);
          const endFragment = endLineContent.substring(0, endColumn);
          const middleLines = lines.slice(startLineIndex + 1, endLineIndex);

          // 组合包装后的内容
          const wrappedContent =
            prefix + [startFragment, ...middleLines, endFragment].join('\n') + suffix;

          // 更新首行
          lines[startLineIndex] =
            startLineContent.substring(0, startColumn) +
            wrappedContent +
            endLineContent.substring(endColumn);

          // 移除后续行
          lines.splice(startLineIndex + 1, endLineIndex - startLineIndex);
        }
        break;
      }
    }
  }

  return lines.join('\n');
}

/**
 * 转换代码
 * @param sourceCode 源代码
 * @param transformations 转换列表
 * @returns 转换后代码
 */
export async function transformCode(
  sourceCode: string,
  transformations: ITransformation[]
): Promise<string> {
  // 应用文本转换
  return applyTextTransformations(sourceCode, transformations);
}
