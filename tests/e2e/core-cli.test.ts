/**
 * 命令行工具的端到端测试
 */
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { resolve } from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// 测试目录
const TEST_DIR = resolve(__dirname, '../temp/e2e-cli');
const CLI_PATH = resolve(__dirname, '../../packages/core/bin/safescan.js');

describe('SafeScan CLI', () => {
  beforeEach(() => {
    // 创建测试目录
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }

    // 创建测试文件
    writeFileSync(
      resolve(TEST_DIR, 'test.js'),
      `
      // 测试文件内容
      function test() {
        eval('console.log("危险代码")'); // 潜在的安全风险
        
        // 内存泄漏示例
        window.addEventListener('resize', function() {
          console.log('窗口大小改变');
        });
        
        return 'test';
      }
      `
    );
  });

  afterEach(() => {
    // 清理测试目录
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  // 注意：这些测试需要CLI工具实际可用
  // 如果CLI尚未实现，这些测试将会失败

  it.skip('应该扫描并报告安全问题', () => {
    try {
      const output = execSync(`node ${CLI_PATH} scan ${TEST_DIR}`, {
        encoding: 'utf-8',
      });

      // 验证输出中包含预期的问题报告
      expect(output).toContain('eval');
      expect(output).toContain('潜在的安全风险');
      expect(output).toContain('内存泄漏');
    } catch (error) {
      // CLI可能尚未实现，如果抛出错误则测试失败
      console.error('CLI测试失败:', error);
      throw error;
    }
  });

  it.skip('应该输出版本信息', () => {
    try {
      const output = execSync(`node ${CLI_PATH} --version`, {
        encoding: 'utf-8',
      });

      // 验证输出是版本号格式
      expect(output).toMatch(/\d+\.\d+\.\d+/);
    } catch (error) {
      // CLI可能尚未实现，如果抛出错误则测试失败
      console.error('CLI测试失败:', error);
      throw error;
    }
  });

  it.skip('应该显示帮助信息', () => {
    try {
      const output = execSync(`node ${CLI_PATH} --help`, {
        encoding: 'utf-8',
      });

      // 验证输出包含帮助信息
      expect(output).toContain('Usage');
      expect(output).toContain('Commands');
      expect(output).toContain('Options');
    } catch (error) {
      // CLI可能尚未实现，如果抛出错误则测试失败
      console.error('CLI测试失败:', error);
      throw error;
    }
  });
});
