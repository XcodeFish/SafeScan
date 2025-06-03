import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { dynamicAnalyzer, staticAnalyzer } from '../../analyzer';
import { createCache } from '../../cache/memory';
import { applyFixes } from '../../fix/engine';
import { Severity } from '../../types';
import { resolveConfig } from '../utils/config-loader';
import { formatResults } from '../utils/format-results';
import {
  generateHTMLReport,
  generatePDFReport,
  generateJSONReport,
} from '../utils/report-generator';

/**
 * Audit命令选项接口
 */
interface AuditOptions {
  path: string;
  fix: boolean;
  level: 'info' | 'warning' | 'error' | 'critical';
  html?: boolean;
  pdf?: boolean;
  config?: string;
  verbose?: boolean;
  json?: boolean;
}

/**
 * 将字符串级别转换为枚举
 */
function levelToSeverity(level: string): Severity {
  switch (level.toLowerCase()) {
    case 'critical':
      return Severity.CRITICAL;
    case 'error':
      return Severity.ERROR;
    case 'warning':
      return Severity.WARNING;
    case 'info':
      return Severity.INFO;
    default:
      return Severity.WARNING;
  }
}

/**
 * 执行项目深度审计
 * 组合静态分析和动态分析以发现安全问题
 *
 * @param options 审计选项
 */
export async function audit(options: AuditOptions): Promise<void> {
  const spinner = ora('正在准备安全审计...').start();

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
    const cache = createCache();

    // 解析最低严重级别
    const minSeverity = levelToSeverity(options.level);

    // 执行静态分析
    spinner.text = '正在执行静态代码分析...';
    const startTime = Date.now();

    const staticResults = await staticAnalyzer({
      rootDir: projectPath,
      ignorePatterns: config.ignorePatterns || [],
      cache: cache,
      ruleSet: 'full', // 使用完整规则集
      maxWorkers: 0, // 使用所有可用工作线程
    });

    // 执行动态分析
    spinner.text = '正在执行动态分析...';

    const dynamicResults = await dynamicAnalyzer({
      rootDir: projectPath,
      entryPoints: config.entryPoints || [],
      timeouts: config.timeouts || { navigation: 30000, idle: 5000 },
      headless: true,
    });

    // 合并结果
    const results = [...staticResults, ...dynamicResults];

    // 按照最低严重级别过滤
    const filteredResults = results
      .map((result) => ({
        ...result,
        issues: result.issues.filter((issue: any) => issue.severity >= minSeverity),
      }))
      .filter((result) => result.issues.length > 0);

    const duration = Date.now() - startTime;

    // 统计问题数量
    const issueCount = filteredResults.reduce((count, result) => count + result.issues.length, 0);
    const criticalCount = filteredResults.reduce(
      (count, result) =>
        count + result.issues.filter((issue: any) => issue.severity === Severity.CRITICAL).length,
      0
    );
    const errorCount = filteredResults.reduce(
      (count, result) =>
        count + result.issues.filter((issue: any) => issue.severity === Severity.ERROR).length,
      0
    );
    const warningCount = filteredResults.reduce(
      (count, result) =>
        count + result.issues.filter((issue: any) => issue.severity === Severity.WARNING).length,
      0
    );

    if (issueCount === 0) {
      spinner.succeed(chalk.green('安全审计完成，未发现问题'));
      return;
    }

    spinner.info(`审计完成 (${(duration / 1000).toFixed(2)}s)`);

    // 显示结果摘要
    console.log(chalk.bold('\n审计结果摘要:'));
    console.log(chalk.red(`  严重问题: ${criticalCount}`));
    console.log(chalk.yellow(`  错误: ${errorCount}`));
    console.log(chalk.blue(`  警告: ${warningCount}`));
    console.log(chalk.gray(`  总问题数: ${issueCount}`));

    // 格式化并显示详细结果
    if (!options.json) {
      formatResults(filteredResults, {
        showCode: options.verbose,
        colorize: true,
      });
    } else {
      console.log(JSON.stringify(filteredResults, null, 2));
    }

    // 生成报告
    if (options.html || options.pdf) {
      spinner.text = '正在生成报告...';

      const outputDir = path.join(process.cwd(), 'safescan-reports');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseFilename = `audit-report-${timestamp}`;

      // 生成JSON报告（用于存档）
      const jsonReportPath = path.join(outputDir, `${baseFilename}.json`);
      await generateJSONReport(filteredResults, jsonReportPath);

      if (options.html) {
        const htmlReportPath = path.join(outputDir, `${baseFilename}.html`);
        await generateHTMLReport(filteredResults, htmlReportPath);
        console.log(chalk.green(`\nHTML报告已生成: ${htmlReportPath}`));
      }

      if (options.pdf) {
        const pdfReportPath = path.join(outputDir, `${baseFilename}.pdf`);
        await generatePDFReport(filteredResults, pdfReportPath);
        console.log(chalk.green(`\nPDF报告已生成: ${pdfReportPath}`));
      }
    }

    // 应用修复如果需要
    if (options.fix) {
      const fixSpinner = ora('正在应用自动修复...').start();

      try {
        // 过滤可自动修复的问题
        const fixableIssues = filteredResults
          .flatMap((result) =>
            result.issues.map((issue: any) => ({
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
      console.log(chalk.bgRed.white('\n发现严重安全漏洞，请立即修复!'));
      process.exitCode = 2;
    } else if (errorCount > 0) {
      console.log(chalk.yellow('\n发现安全隐患，建议尽快修复。'));
      process.exitCode = 1;
    } else {
      console.log(chalk.green('\n未发现严重问题，但有一些警告需要关注。'));
    }
  } catch (error: unknown) {
    spinner.fail(chalk.red(`安全审计失败: ${(error as Error).message}`));
    throw error;
  }
}
