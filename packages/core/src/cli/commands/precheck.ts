import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { staticAnalyzer } from '../../analyzer/';
import { createCache } from '../../cache/memory';
import { applyFixes } from '../../fix/engine';
import { Severity } from '../../types';
import { resolveConfig } from '../utils/config-loader';
import { formatResults } from '../utils/format-results';

/**
 * Precheck命令选项接口
 */
interface PrecheckOptions {
  path: string;
  fix: boolean;
  ignore?: string;
  cache?: boolean;
  config?: string;
  verbose?: boolean;
  json?: boolean;
}

/**
 * 执行项目预检查
 * 快速扫描常见安全问题和代码质量问题
 *
 * @param options 预检查选项
 */
export async function precheck(options: PrecheckOptions): Promise<void> {
  const spinner = ora('正在准备预检查...').start();

  try {
    // 解析项目路径
    const projectPath = path.resolve(options.path);

    // 检查路径是否存在
    if (!fs.existsSync(projectPath)) {
      throw new Error(`路径不存在: ${projectPath}`);
    }

    // 加载配置
    const config = await resolveConfig(options.config);

    // 创建缓存
    const cache = options.cache ? createCache() : undefined;

    // 转换忽略模式
    const ignorePatterns = options.ignore ? options.ignore.split(',') : config.ignorePatterns || [];

    // 执行静态分析
    spinner.text = '正在执行快速扫描...';
    const startTime = Date.now();

    const results = await staticAnalyzer({
      rootDir: projectPath,
      ignorePatterns,
      cache: cache,
      ruleSet: 'quickscan', // 使用快速扫描规则集
      maxWorkers: 4, // 限制工作线程数量提高速度
    });

    const duration = Date.now() - startTime;

    // 统计问题数量
    const issueCount = results.reduce((count, result) => count + result.issues.length, 0);
    const criticalCount = results.reduce(
      (count, result) =>
        count + result.issues.filter((issue) => issue.severity === Severity.CRITICAL).length,
      0
    );
    const errorCount = results.reduce(
      (count, result) =>
        count + result.issues.filter((issue) => issue.severity === Severity.ERROR).length,
      0
    );
    const warningCount = results.reduce(
      (count, result) =>
        count + result.issues.filter((issue) => issue.severity === Severity.WARNING).length,
      0
    );

    if (issueCount === 0) {
      spinner.succeed(chalk.green('预检查完成，未发现问题'));
      return;
    }

    spinner.info(`扫描完成 (${(duration / 1000).toFixed(2)}s)`);

    // 显示结果摘要
    console.log(chalk.bold('\n扫描结果摘要:'));
    console.log(chalk.red(`  严重问题: ${criticalCount}`));
    console.log(chalk.yellow(`  错误: ${errorCount}`));
    console.log(chalk.blue(`  警告: ${warningCount}`));
    console.log(chalk.gray(`  总问题数: ${issueCount}`));

    // 格式化并显示详细结果
    if (!options.json) {
      formatResults(results, {
        showCode: options.verbose,
        colorize: true,
      });
    } else {
      console.log(JSON.stringify(results, null, 2));
    }

    // 应用修复如果需要
    if (options.fix && (criticalCount > 0 || errorCount > 0)) {
      const fixSpinner = ora('正在应用自动修复...').start();

      try {
        // 过滤可自动修复的问题
        const fixableIssues = results
          .flatMap((result) =>
            result.issues.map((issue) => ({
              file: result.file,
              issue,
            }))
          )
          .filter((item) => item.issue.fixable);

        if (fixableIssues.length === 0) {
          fixSpinner.info('没有可自动修复的问题');
        } else {
          const fixResults = await applyFixes(
            fixableIssues.map((item) => ({
              file: item.file,
              issueId: item.issue.id,
              fix: item.issue.fix || '',
            }))
          );

          fixSpinner.succeed(`成功修复 ${fixResults.successCount}/${fixableIssues.length} 个问题`);
        }
      } catch (error: unknown) {
        fixSpinner.fail(`修复过程出错: ${(error as Error).message}`);
      }
    }

    // 提供扫描结论
    if (criticalCount > 0) {
      console.log(chalk.bgRed.white('\n发现严重安全问题，请立即修复!'));
    } else if (errorCount > 0) {
      console.log(chalk.yellow('\n发现安全隐患，建议尽快修复。'));
    } else {
      console.log(chalk.green('\n未发现严重问题，但有一些警告需要关注。'));
    }

    // 如果有严重问题，设置退出码为1
    if (criticalCount > 0) {
      process.exitCode = 1;
    }
  } catch (error: unknown) {
    spinner.fail(chalk.red(`预检查失败: ${(error as Error).message}`));
    throw error;
  }
}
