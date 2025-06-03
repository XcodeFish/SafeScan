import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  generateHTMLReport,
  generatePDFReport,
  generateJSONReport,
} from '../utils/report-generator';

/**
 * 报告生成命令选项接口
 */
interface GenerateReportOptions {
  input: string;
  output?: string;
  format: 'html' | 'pdf' | 'json';
  template?: string;
}

/**
 * 生成安全扫描报告
 * 将扫描结果转换为不同格式的报告
 *
 * @param options 报告生成选项
 */
export async function generateReport(options: GenerateReportOptions): Promise<void> {
  const spinner = ora('正在准备生成报告...').start();

  try {
    // 检查输入文件是否存在
    if (!options.input) {
      throw new Error('必须提供输入结果文件路径');
    }

    const inputPath = path.resolve(options.input);
    if (!fs.existsSync(inputPath)) {
      throw new Error(`输入文件不存在: ${inputPath}`);
    }

    // 读取扫描结果
    spinner.text = '正在读取扫描结果...';
    const resultData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    // 确定输出路径
    const outputDir = options.output
      ? path.resolve(options.output)
      : path.join(process.cwd(), 'safescan-reports');

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // 确定报告文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportType = determineReportType(resultData);
    const baseFilename = `${reportType}-report-${timestamp}`;

    // 根据格式生成报告
    spinner.text = `正在生成${formatToText(options.format)}报告...`;

    let outputPath;

    switch (options.format) {
      case 'html':
        outputPath = path.join(outputDir, `${baseFilename}.html`);
        await generateHTMLReport(resultData, outputPath, reportType, options.template);
        break;

      case 'pdf':
        outputPath = path.join(outputDir, `${baseFilename}.pdf`);
        await generatePDFReport(resultData, outputPath, reportType, options.template);
        break;

      case 'json':
      default:
        outputPath = path.join(outputDir, `${baseFilename}.json`);
        await generateJSONReport(resultData, outputPath);
        break;
    }

    spinner.succeed(chalk.green(`报告已成功生成: ${outputPath}`));

    // 显示报告统计信息
    displayReportStatistics(resultData, reportType);
  } catch (error: unknown) {
    spinner.fail(chalk.red(`报告生成失败: ${(error as Error).message}`));
    throw error;
  }
}

/**
 * 根据数据结构确定报告类型
 */
function determineReportType(data: any): string {
  // 根据数据字段判断报告类型
  if (data.leaks && Array.isArray(data.leaks)) {
    return 'memory-leak';
  } else if (data.some && data.some((r: any) => r.issues && Array.isArray(r.issues))) {
    return 'security-audit';
  } else if (data.metrics && data.metrics.performance) {
    return 'performance';
  } else {
    return 'generic';
  }
}

/**
 * 将格式名称转换为显示文本
 */
function formatToText(format: string): string {
  switch (format) {
    case 'html':
      return 'HTML';
    case 'pdf':
      return 'PDF';
    case 'json':
      return 'JSON';
    default:
      return format.toUpperCase();
  }
}

/**
 * 展示报告统计信息
 */
function displayReportStatistics(data: any, reportType: string): void {
  console.log(chalk.bold('\n报告统计信息:'));

  switch (reportType) {
    case 'memory-leak':
      if (data.leaks && Array.isArray(data.leaks)) {
        console.log(chalk.yellow(`发现 ${data.leaks.length} 个可能的内存泄漏`));
        console.log(chalk.gray(`总计泄漏: ${(data.totalLeakSize / 1024 / 1024).toFixed(2)} MB`));

        const criticalLeaks = data.leaks.filter((leak: any) => leak.severity === 'critical').length;
        if (criticalLeaks > 0) {
          console.log(chalk.red(`严重泄漏: ${criticalLeaks} 个`));
        }
      }
      break;

    case 'security-audit':
      if (Array.isArray(data)) {
        const issueCount = data.reduce(
          (count: number, result: any) => count + (result.issues ? result.issues.length : 0),
          0
        );

        console.log(chalk.gray(`总问题数: ${issueCount}`));

        // 统计不同严重级别的问题
        const criticalCount = data.reduce(
          (count: number, result: any) =>
            count +
            (result.issues
              ? result.issues.filter((i: any) => i.severity === 'CRITICAL').length
              : 0),
          0
        );

        const errorCount = data.reduce(
          (count: number, result: any) =>
            count +
            (result.issues ? result.issues.filter((i: any) => i.severity === 'ERROR').length : 0),
          0
        );

        console.log(chalk.red(`严重问题: ${criticalCount}`));
        console.log(chalk.yellow(`错误: ${errorCount}`));
      }
      break;

    case 'performance':
      if (data.metrics && data.metrics.performance) {
        console.log(chalk.blue(`性能得分: ${data.metrics.performance.score}`));
        console.log(chalk.gray(`首次内容绘制: ${data.metrics.performance.fcp}ms`));
        console.log(chalk.gray(`交互准备时间: ${data.metrics.performance.tti}ms`));
      }
      break;

    default:
      console.log(chalk.gray('通用报告已生成'));
      break;
  }
}
