import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { memoryAnalyzer } from '../../analyzer';
import { resolveConfig } from '../utils/config-loader';
import { formatMemoryResults } from '../utils/format-results';
import { generateHTMLReport, generateJSONReport } from '../utils/report-generator';

/**
 * 内存泄漏检测命令选项接口
 */
interface MemoryLeakOptions {
  path: string;
  threshold: string;
  snapshots: string;
  interval: string;
  headless: boolean;
  config?: string;
  verbose?: boolean;
  json?: boolean;
}

/**
 * 执行内存泄漏检测
 * 通过比较多个内存快照检测并定位可能的内存泄漏
 *
 * @param options 内存泄漏检测选项
 */
export async function memoryLeak(options: MemoryLeakOptions): Promise<void> {
  const spinner = ora('正在准备内存泄漏检测...').start();

  try {
    // 解析项目路径
    const projectPath = path.resolve(options.path);

    // 检查路径是否存在
    if (!fs.existsSync(projectPath)) {
      throw new Error(`路径不存在: ${projectPath}`);
    }

    // 加载配置
    const config = await resolveConfig(options.config);

    // 解析选项
    const threshold = parseFloat(options.threshold);
    const snapshotCount = parseInt(options.snapshots, 10);
    const intervalSeconds = parseInt(options.interval, 10);

    if (isNaN(threshold) || threshold <= 0) {
      throw new Error('泄漏阈值必须是大于0的数字');
    }

    if (isNaN(snapshotCount) || snapshotCount < 2) {
      throw new Error('快照数量必须至少为2');
    }

    if (isNaN(intervalSeconds) || intervalSeconds <= 0) {
      throw new Error('快照间隔必须是大于0的秒数');
    }

    // 执行内存分析
    spinner.text = '正在执行内存分析...';
    const startTime = Date.now();

    // 内存分析需要入口点
    const entryPoints = config.entryPoints || [];
    if (entryPoints.length === 0) {
      throw new Error('未找到入口点，请在配置文件中指定entryPoints或提供--entry选项');
    }

    const memoryResults = await memoryAnalyzer({
      rootDir: projectPath,
      entryPoints,
      threshold: threshold * 1024 * 1024, // 转换MB为字节
      snapshotCount,
      interval: intervalSeconds * 1000, // 转换秒为毫秒
      headless: options.headless,
    });

    const duration = Date.now() - startTime;

    if (memoryResults.leaks.length === 0) {
      spinner.succeed(chalk.green('内存分析完成，未发现泄漏'));
      return;
    }

    spinner.info(`分析完成 (${(duration / 1000).toFixed(2)}s)`);

    // 按泄漏大小排序
    memoryResults.leaks.sort((a: any, b: any) => b.size - a.size);

    // 显示结果摘要
    console.log(chalk.bold('\n内存泄漏检测结果:'));
    console.log(chalk.yellow(`发现 ${memoryResults.leaks.length} 个可能的内存泄漏`));
    console.log(
      chalk.gray(`总计泄漏: ${(memoryResults.totalLeakSize / 1024 / 1024).toFixed(2)} MB`)
    );

    // 格式化并显示详细结果
    if (!options.json) {
      formatMemoryResults(memoryResults, {
        showDetails: options.verbose,
        colorize: true,
      });
    } else {
      console.log(JSON.stringify(memoryResults, null, 2));
    }

    // 生成报告
    spinner.text = '正在生成内存泄漏报告...';

    const outputDir = path.join(process.cwd(), 'safescan-reports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const baseFilename = `memory-leak-report-${timestamp}`;

    // 生成JSON报告（用于存档）
    const jsonReportPath = path.join(outputDir, `${baseFilename}.json`);
    await generateJSONReport(memoryResults, jsonReportPath);

    // 生成HTML报告（带可视化）
    const htmlReportPath = path.join(outputDir, `${baseFilename}.html`);
    await generateHTMLReport(memoryResults, htmlReportPath, 'memory-leak');
    console.log(chalk.green(`\n内存泄漏报告已生成: ${htmlReportPath}`));

    // 提供扫描结论
    const criticalLeaks = memoryResults.leaks.filter((leak: any) => leak.severity === 'critical');
    const majorLeaks = memoryResults.leaks.filter((leak: any) => leak.severity === 'major');

    if (criticalLeaks.length > 0) {
      console.log(chalk.bgRed.white('\n发现严重内存泄漏，请立即修复!'));
      process.exitCode = 2;
    } else if (majorLeaks.length > 0) {
      console.log(chalk.yellow('\n发现重要内存泄漏，建议尽快修复。'));
      process.exitCode = 1;
    } else {
      console.log(chalk.blue('\n发现轻微内存泄漏，建议在下一迭代中修复。'));
    }
  } catch (error: unknown) {
    spinner.fail(chalk.red(`内存泄漏检测失败: ${(error as Error).message}`));
    throw error;
  }
}
