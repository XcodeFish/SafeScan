/**
 * 生产构建检查
 * 检测构建过程中的安全问题并生成报告
 */

import * as path from 'path';
import type { Compilation } from 'webpack';
import { SafeScanWebpackPluginOptions, SecurityIssue } from './types';
import { getLogger } from './utils/logger';

// 导入静态分析引擎（假设已存在于core包）
// 在实际实现中需要导入SafeScan的核心分析引擎
let staticAnalyzer: any;
try {
  // 这里应该导入实际的静态分析引擎
  staticAnalyzer = require('@safescan/core/analyzer/static');
} catch (err) {
  // 处理导入失败情况
  staticAnalyzer = null;
}

/**
 * 运行生产构建检查
 *
 * @param compilation Webpack编译对象
 * @param options 插件选项
 * @returns 检查到的安全问题
 */
export function runProductionCheck(
  compilation: Compilation,
  options: SafeScanWebpackPluginOptions
): SecurityIssue[] {
  const logger = getLogger('SafeScan:ProductionCheck');

  logger.info('开始生产构建安全检查...');

  const startTime = Date.now();
  const issues: SecurityIssue[] = [];

  try {
    if (!staticAnalyzer) {
      logger.warn('未找到静态分析引擎，跳过安全检查');
      return issues;
    }

    // 获取所有生成的资源文件
    const outputPath = compilation.outputOptions.path || '';
    const assets = Object.keys(compilation.assets);

    // 检测JavaScript文件
    const jsAssets = assets.filter((asset) => /\.js$/.test(asset));

    // 进度信息
    let processedCount = 0;
    const totalCount = jsAssets.length;

    logger.info(`开始检查 ${totalCount} 个JS资源文件...`);

    for (const asset of jsAssets) {
      processedCount++;

      if (processedCount % 10 === 0) {
        logger.info(`已检查 ${processedCount}/${totalCount} 个文件...`);
      }

      const assetPath = path.join(outputPath, asset);
      const source = compilation.assets[asset].source();

      // 检查当前文件是否包含安全问题
      const fileIssues = analyzeFileContent(assetPath, source, options);

      // 收集问题
      if (fileIssues && fileIssues.length > 0) {
        issues.push(...fileIssues);
      }
    }

    // 检查是否存在严重问题
    const criticalIssues = issues.filter((issue) => issue.severity === 'critical');
    const errorIssues = issues.filter((issue) => issue.severity === 'error');

    // 汇总结果
    logger.info(`安全检查完成，耗时: ${(Date.now() - startTime) / 1000}秒`);
    logger.info(
      `发现 ${issues.length} 个问题 (${criticalIssues.length} 个严重问题, ${errorIssues.length} 个错误)`
    );

    // 在控制台中展示严重问题
    if (criticalIssues.length > 0) {
      logger.error('发现严重安全问题:');

      criticalIssues.forEach((issue) => {
        logger.error(`[${issue.id}] ${issue.message} ${formatLocation(issue)}`);
        if (issue.suggestion) {
          logger.info(`  建议: ${issue.suggestion}`);
        }
      });
    }

    // 如果存在严重问题，可以考虑终止构建过程
    if (criticalIssues.length > 0 && process.env.SAFESCAN_FAIL_ON_CRITICAL === 'true') {
      compilation.errors.push(
        new Error(
          `SafeScan发现${criticalIssues.length}个严重安全问题，构建已中止。使用SAFESCAN_IGNORE_ERRORS=true环境变量可忽略此错误。`
        )
      );
    }

    // 将错误级别问题添加到webpack警告
    errorIssues.forEach((issue) => {
      compilation.warnings.push(
        new Error(`[SafeScan] ${issue.id}: ${issue.message} ${formatLocation(issue)}`)
      );
    });
  } catch (error) {
    const err = error as Error;
    logger.error(`安全检查过程中发生错误: ${err.message}`);
    compilation.errors.push(new Error(`SafeScan安全检查失败: ${err.message}`));
  }

  return issues;
}

/**
 * 分析文件内容，检测安全问题
 */
function analyzeFileContent(
  filePath: string,
  content: string,
  options: SafeScanWebpackPluginOptions
): SecurityIssue[] {
  if (!staticAnalyzer) {
    return [];
  }

  try {
    // 调用静态分析引擎分析当前文件
    // 在实际实现中，这里会调用SafeScan的核心API
    // 这只是一个示例实现
    const results = staticAnalyzer.analyzeSource(content, {
      filePath,
      ignoreRules: options.rules?.ignoreRules || [],
      customSeverity: options.rules?.customSeverity || {},
    });

    // 示例检测XSS漏洞的简单实现 (实际项目中会使用更复杂的分析)
    const issues: SecurityIssue[] = [];

    // 简单的DOM XSS检测示例
    if (content.includes('innerHTML') || content.includes('outerHTML')) {
      issues.push({
        id: 'SAFESCAN-XSS-001',
        severity: 'warning',
        message: '可能存在DOM-XSS漏洞，检测到不安全的innerHTML/outerHTML使用',
        location: {
          file: path.basename(filePath),
          // 实际实现中应该提供准确的行号和列号
        },
        suggestion: '使用安全的DOM API如textContent或考虑使用DOMPurify库',
        docsUrl: 'https://safescan.dev/docs/rules/xss-001',
      });
    }

    // eval调用检测
    if (content.includes('eval(')) {
      issues.push({
        id: 'SAFESCAN-EVAL-001',
        severity: 'critical',
        message: '检测到eval()使用，可能导致代码注入风险',
        location: {
          file: path.basename(filePath),
        },
        suggestion: '避免使用eval，使用更安全的替代方案',
        docsUrl: 'https://safescan.dev/docs/rules/eval-001',
      });
    }

    // 整合其他分析结果
    if (results && Array.isArray(results.issues)) {
      issues.push(...results.issues);
    }

    return issues;
  } catch (error) {
    const logger = getLogger('SafeScan:Analyzer');
    logger.error(`分析文件 ${filePath} 时出错: ${(error as Error).message}`);
    return [];
  }
}

/**
 * 格式化问题位置信息
 */
function formatLocation(issue: SecurityIssue): string {
  if (!issue.location) {
    return '';
  }

  let location = `at ${issue.location.file}`;

  if (issue.location.line !== undefined) {
    location += `:${issue.location.line}`;

    if (issue.location.column !== undefined) {
      location += `:${issue.location.column}`;
    }
  }

  return location;
}
