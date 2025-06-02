/**
 * 文件哈希相关工具函数
 */
import { createHash } from 'crypto';

/**
 * 计算字符串内容的哈希值
 * @param content 需要计算哈希的内容
 * @returns 哈希值字符串
 */
export function calculateHash(content: string): string {
  return createHash('md5').update(content).digest('hex');
}

/**
 * 计算文件内容的哈希值
 * @param filePath 文件路径
 * @param content 文件内容
 * @returns 哈希值字符串
 */
export function calculateFileHash(filePath: string, content: string): string {
  // 将文件路径和内容一起计算，确保路径不同但内容相同的文件有不同的哈希值
  return calculateHash(`${filePath}:${content}`);
}
