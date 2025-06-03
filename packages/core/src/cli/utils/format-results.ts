import path from 'path';
import chalk from 'chalk';
import { Severity } from '../../types';

/**
 * 格式化选项接口
 */
interface FormatOptions {
  showCode?: boolean;
  colorize?: boolean;
  maxIssues?: number;
  showDetails?: boolean;
}

/**
 * 格式化扫描结果并输出到控制台
 *
 * @param results 扫描结果数组
 * @param options 格式化选项
 */
export function formatResults(results: any[], options: FormatOptions = {}): void {
  const { showCode = false, colorize = true, maxIssues = 100 } = options;

  // 设置颜色函数
  const color = {
    file: colorize ? chalk.cyan : (text: string) => text,
    line: colorize ? chalk.yellow : (text: string) => text,
    critical: colorize ? chalk.bgRed.white : (text: string) => text,
    error: colorize ? chalk.red : (text: string) => text,
    warning: colorize ? chalk.yellow : (text: string) => text,
    info: colorize ? chalk.blue : (text: string) => text,
    code: colorize ? chalk.gray : (text: string) => text,
    highlight: colorize ? chalk.bgYellow.black : (text: string) => text,
    rule: colorize ? chalk.magenta : (text: string) => text,
  };

  // 获取工作目录，用于显示相对路径
  const workDir = process.cwd();

  // 统计问题总数
  const totalIssues = results.reduce((count, result) => count + result.issues.length, 0);

  // 对问题进行排序 - 按严重性降序
  const sortedResults = [...results].sort((a, b) => {
    const aMaxSeverity = Math.max(...a.issues.map((issue: any) => issue.severity));
    const bMaxSeverity = Math.max(...b.issues.map((issue: any) => issue.severity));
    return bMaxSeverity - aMaxSeverity;
  });

  // 保持跟踪显示的问题数量
  let displayedIssues = 0;

  // 遍历结果并格式化输出
  for (const result of sortedResults) {
    if (displayedIssues >= maxIssues) {
      console.log(color.info(`\n... 还有 ${totalIssues - maxIssues} 个问题未显示`));
      break;
    }

    const relPath = path.relative(workDir, result.file);

    // 按严重性对问题进行排序
    const sortedIssues = [...result.issues].sort((a: any, b: any) => b.severity - a.severity);

    for (const issue of sortedIssues) {
      if (displayedIssues >= maxIssues) break;
      displayedIssues++;

      // 确定问题级别的颜色
      let severityText;
      switch (issue.severity) {
        case Severity.CRITICAL:
          severityText = color.critical(' 严重 ');
          break;
        case Severity.ERROR:
          severityText = color.error('错误');
          break;
        case Severity.WARNING:
          severityText = color.warning('警告');
          break;
        default:
          severityText = color.info('信息');
      }

      // 输出问题位置和描述
      console.log(
        `${severityText} ${color.file(relPath)}:${color.line(issue.line)}:${color.line(issue.column)} - ${issue.message}`
      );

      // 输出规则ID和链接
      if (issue.ruleId) {
        console.log(`  ${color.rule(`规则: ${issue.ruleId}`)}`);
      }

      // 如果需要显示代码
      if (showCode && issue.code) {
        console.log(color.code('\n  ' + issue.code.trim().replace(/\n/g, '\n  ')));

        // 如果有指示器，显示问题位置
        if (issue.pointer) {
          console.log(color.highlight('  ' + issue.pointer));
        }
        console.log(''); // 空行分隔
      }

      // 如果有修复建议
      if (issue.fixable) {
        console.log(color.info('  ✓ 此问题可自动修复'));
      }
    }
  }
}

/**
 * 格式化内存泄漏结果并输出到控制台
 *
 * @param results 内存泄漏分析结果
 * @param options 格式化选项
 */
export function formatMemoryResults(results: any, options: FormatOptions = {}): void {
  const { showDetails = false, colorize = true } = options;

  // 设置颜色函数
  const color = {
    title: colorize ? chalk.bold : (text: string) => text,
    critical: colorize ? chalk.red : (text: string) => text,
    major: colorize ? chalk.yellow : (text: string) => text,
    minor: colorize ? chalk.blue : (text: string) => text,
    component: colorize ? chalk.cyan : (text: string) => text,
    size: colorize ? chalk.green : (text: string) => text,
    detail: colorize ? chalk.gray : (text: string) => text,
    growth: colorize ? chalk.magenta : (text: string) => text,
  };

  // 按泄漏大小排序
  const sortedLeaks = [...results.leaks].sort((a: any, b: any) => b.size - a.size);

  // 遍历泄漏并格式化输出
  for (const leak of sortedLeaks) {
    // 确定泄漏严重性颜色
    let severityColor;
    switch (leak.severity) {
      case 'critical':
        severityColor = color.critical;
        break;
      case 'major':
        severityColor = color.major;
        break;
      default:
        severityColor = color.minor;
    }

    // 输出泄漏组件和大小
    console.log(
      `${severityColor('•')} ${color.component(leak.component)} - ${color.size((leak.size / 1024 / 1024).toFixed(2) + ' MB')}`
    );

    // 如果有增长率，显示增长率
    if (leak.growthRate) {
      console.log(`  ${color.growth(`增长率: ${leak.growthRate.toFixed(2)}% / 分钟`)}`);
    }

    // 如果需要显示详情
    if (showDetails) {
      // 显示泄漏类型
      console.log(`  ${color.detail(`泄漏类型: ${leak.type}`)}`);

      // 显示引用链
      if (leak.referenceChain && leak.referenceChain.length > 0) {
        console.log(`  ${color.title('引用链:')}`);
        for (const ref of leak.referenceChain) {
          console.log(`    ${color.detail(ref)}`);
        }
      }

      // 显示泄漏对象示例
      if (leak.example) {
        console.log(`  ${color.title('示例:')}`);
        console.log(
          `    ${color.detail(JSON.stringify(leak.example, null, 2).replace(/\n/g, '\n    '))}`
        );
      }

      // 如果有修复建议
      if (leak.recommendation) {
        console.log(`  ${color.title('修复建议:')}`);
        console.log(`    ${color.detail(leak.recommendation)}`);
      }
    }

    console.log(''); // 空行分隔
  }
}
