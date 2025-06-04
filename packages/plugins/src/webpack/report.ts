/**
 * 可视化报告生成
 * 生成包含安全检查结果和包大小分析的HTML报告
 */

import * as fs from 'fs';
import * as path from 'path';
import open from 'open';
import { Compiler, Stats } from 'webpack';
import { SafeScanWebpackPluginOptions, SecurityIssue, BundleSizeInfo, ReportData } from './types';
import { getLogger } from './utils/logger';

/**
 * 生成报告
 * @param stats Webpack统计数据
 * @param compiler Webpack编译器
 * @param options 插件选项
 */
export function generateReport(
  stats: Stats,
  compiler: Compiler,
  options: SafeScanWebpackPluginOptions
): void {
  const logger = getLogger('SafeScan:Report');
  logger.info('开始生成安全与性能报告...');

  try {
    const startTime = Date.now();
    const outputPath = stats.compilation.outputOptions.path || '';
    const reportPath = path.join(outputPath, options.reportOutputPath);

    // 获取全局安全问题和包大小信息
    // 这里获取安全问题需要与其他模块集成
    // 实际项目中应该从共享存储中获取这些数据
    const securityIssues = getSecurityIssuesFromReport(outputPath);
    const bundleSizes = getBundleSizesFromReport(outputPath);

    // 生成报告数据
    const reportData: ReportData = {
      buildTime: new Date(),
      environment: compiler.options.mode || 'development',
      securityIssues,
      bundleSizes,
      projectInfo: {
        name: getProjectName(compiler),
        version: getProjectVersion(),
        nodeVersion: process.version,
        webpackVersion: getWebpackVersion(),
      },
    };

    // 生成HTML报告
    const html = generateHtmlReport(reportData, options);

    // 保存报告
    fs.writeFileSync(reportPath, html);

    logger.info(`报告已生成: ${reportPath} (耗时: ${(Date.now() - startTime) / 1000}秒)`);

    // 自动打开报告
    if (options.reportOptions?.openReport) {
      try {
        open(reportPath);
        logger.info('已自动打开报告');
      } catch (error) {
        logger.warn(`无法自动打开报告: ${(error as Error).message}`);
      }
    }
  } catch (error) {
    const err = error as Error;
    logger.error(`生成报告时发生错误: ${err.message}`);
  }
}

/**
 * 获取项目名称
 */
function getProjectName(compiler: Compiler): string {
  try {
    // 尝试从package.json获取
    const packageJsonPath = path.join(compiler.context, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson.name) {
        return packageJson.name;
      }
    }
  } catch (error) {
    // 忽略错误
  }

  // 使用目录名作为后备
  return path.basename(compiler.context);
}

/**
 * 获取项目版本
 */
function getProjectVersion(): string {
  try {
    // 尝试从package.json获取
    const packageJsonPath = path.resolve('package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson.version) {
        return packageJson.version;
      }
    }
  } catch (error) {
    // 忽略错误
  }

  return '0.0.0';
}

/**
 * 获取Webpack版本
 */
function getWebpackVersion(): string {
  try {
    const packageJsonPath = path.join(require.resolve('webpack'), '../../package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson.version) {
        return packageJson.version;
      }
    }
  } catch (error) {
    // 忽略错误
  }

  return 'unknown';
}

/**
 * 获取安全问题
 */
function getSecurityIssuesFromReport(outputPath: string): SecurityIssue[] {
  const issuesPath = path.join(outputPath, '.safescan-security-issues.json');

  try {
    if (fs.existsSync(issuesPath)) {
      return JSON.parse(fs.readFileSync(issuesPath, 'utf-8'));
    }
  } catch (error) {
    const logger = getLogger('SafeScan:Report');
    logger.warn(`无法加载安全问题: ${(error as Error).message}`);
  }

  return [];
}

/**
 * 获取包大小信息
 */
function getBundleSizesFromReport(outputPath: string): BundleSizeInfo[] {
  const sizesPath = path.join(outputPath, '.safescan-bundle-sizes.json');

  try {
    if (fs.existsSync(sizesPath)) {
      return JSON.parse(fs.readFileSync(sizesPath, 'utf-8'));
    }
  } catch (error) {
    const logger = getLogger('SafeScan:Report');
    logger.warn(`无法加载包大小信息: ${(error as Error).message}`);
  }

  return [];
}

/**
 * 生成HTML报告
 */
function generateHtmlReport(data: ReportData, options: SafeScanWebpackPluginOptions): string {
  const title = options.reportOptions?.title || 'SafeScan 安全与性能报告';

  // 安全问题统计
  const totalIssues = data.securityIssues.length;
  const criticalIssues = data.securityIssues.filter(
    (issue) => issue.severity === 'critical'
  ).length;
  const errorIssues = data.securityIssues.filter((issue) => issue.severity === 'error').length;
  const warningIssues = data.securityIssues.filter((issue) => issue.severity === 'warning').length;

  // 包大小统计
  const totalSize = data.bundleSizes.reduce((acc, file) => acc + file.size, 0);
  const totalGzipSize = data.bundleSizes
    .filter((file) => file.gzipSize !== undefined)
    .reduce((acc, file) => acc + (file.gzipSize || 0), 0);
  const oversizedFiles = data.bundleSizes.filter((file) => file.isOverSizeLimit).length;

  // 安全问题表格HTML
  let securityTableHtml = '';
  if (data.securityIssues.length > 0) {
    securityTableHtml = `
      <table class="issues-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>严重程度</th>
            <th>问题描述</th>
            <th>位置</th>
            <th>修复建议</th>
          </tr>
        </thead>
        <tbody>
          ${data.securityIssues
            .map(
              (issue) => `
            <tr class="severity-${issue.severity}">
              <td>${issue.id}</td>
              <td>${getSeverityLabel(issue.severity)}</td>
              <td>${issue.message}</td>
              <td>${formatLocation(issue)}</td>
              <td>${issue.suggestion || '无'}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  } else {
    securityTableHtml = '<div class="empty-state">未发现安全问题</div>';
  }

  // 包大小表格HTML
  let bundleSizeTableHtml = '';
  if (data.bundleSizes.length > 0) {
    bundleSizeTableHtml = `
      <table class="bundle-table">
        <thead>
          <tr>
            <th>文件名</th>
            <th>大小</th>
            <th>Gzip大小</th>
            <th>变化</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          ${data.bundleSizes
            .map(
              (file) => `
            <tr class="${file.isOverSizeLimit ? 'oversized' : ''}">
              <td>${file.name}</td>
              <td>${formatSize(file.size)}</td>
              <td>${file.gzipSize ? formatSize(file.gzipSize) : '未知'}</td>
              <td>${
                file.changePercentage !== undefined
                  ? `${file.changePercentage > 0 ? '+' : ''}${file.changePercentage.toFixed(2)}%`
                  : '首次构建'
              }</td>
              <td>${
                file.isOverSizeLimit
                  ? `<span class="warning">超过限制</span>`
                  : '<span class="success">正常</span>'
              }</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  } else {
    bundleSizeTableHtml = '<div class="empty-state">未找到包大小信息</div>';
  }

  // 图表数据
  const severityChartData = `
    {
      labels: ['严重', '错误', '警告', '信息'],
      datasets: [{
        data: [${criticalIssues}, ${errorIssues}, ${warningIssues}, ${totalIssues - criticalIssues - errorIssues - warningIssues}],
        backgroundColor: ['#ff4d4f', '#faad14', '#ffc53d', '#52c41a']
      }]
    }
  `;

  const bundleSizeChartData = `
    {
      labels: [${data.bundleSizes
        .slice(0, 10)
        .map((file) => `'${file.name}'`)
        .join(', ')}],
      datasets: [{
        label: '文件大小 (KB)',
        data: [${data.bundleSizes
          .slice(0, 10)
          .map((file) => (file.size / 1024).toFixed(2))
          .join(', ')}],
        backgroundColor: '#1890ff'
      }]
    }
  `;

  // 完整的HTML模板
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --primary-color: #1890ff;
      --success-color: #52c41a;
      --warning-color: #faad14;
      --error-color: #ff4d4f;
      --bg-color: #f0f2f5;
      --text-color: #333;
      --border-color: #e8e8e8;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
        Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      margin: 0;
      padding: 0;
      background-color: var(--bg-color);
      color: var(--text-color);
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      background-color: #fff;
      padding: 20px;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      margin-bottom: 20px;
    }
    
    h1 {
      margin: 0;
      color: var(--text-color);
      font-size: 24px;
    }
    
    .meta {
      display: flex;
      flex-wrap: wrap;
      margin-top: 15px;
      font-size: 14px;
      color: #666;
    }
    
    .meta-item {
      margin-right: 20px;
      margin-bottom: 5px;
    }
    
    .card {
      background-color: #fff;
      padding: 20px;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      margin-bottom: 20px;
    }
    
    .card-title {
      margin-top: 0;
      margin-bottom: 15px;
      font-size: 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    
    .stat-card {
      background-color: #fff;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 15px;
      text-align: center;
    }
    
    .stat-value {
      font-size: 24px;
      font-weight: 600;
      margin: 5px 0;
    }
    
    .stat-label {
      font-size: 14px;
      color: #666;
    }
    
    .severity-critical { background-color: rgba(255, 77, 79, 0.1); }
    .severity-error { background-color: rgba(250, 173, 20, 0.1); }
    .severity-warning { background-color: rgba(255, 197, 61, 0.1); }
    .severity-info { background-color: rgba(82, 196, 26, 0.1); }
    
    .severity-critical td:first-child { border-left: 4px solid var(--error-color); }
    .severity-error td:first-child { border-left: 4px solid var(--warning-color); }
    .severity-warning td:first-child { border-left: 4px solid #ffc53d; }
    .severity-info td:first-child { border-left: 4px solid var(--success-color); }
    
    .chart-container {
      height: 300px;
      margin-bottom: 20px;
    }
    
    .two-cols {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    
    @media (max-width: 768px) {
      .two-cols {
        grid-template-columns: 1fr;
      }
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
    }
    
    th, td {
      text-align: left;
      padding: 12px 15px;
      border-bottom: 1px solid var(--border-color);
    }
    
    th {
      background-color: #fafafa;
      font-weight: 500;
    }
    
    .oversized {
      background-color: rgba(255, 77, 79, 0.1);
    }
    
    .warning {
      color: var(--warning-color);
    }
    
    .success {
      color: var(--success-color);
    }
    
    .empty-state {
      padding: 30px;
      text-align: center;
      color: #666;
      background-color: #fafafa;
      border-radius: 4px;
    }
    
    .badge {
      display: inline-block;
      padding: 3px 7px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 500;
    }
    
    .badge-critical {
      background-color: var(--error-color);
      color: white;
    }
    
    .badge-error {
      background-color: var(--warning-color);
      color: white;
    }
    
    .badge-warning {
      background-color: #ffc53d;
      color: #333;
    }
    
    .badge-info {
      background-color: var(--success-color);
      color: white;
    }
    
    .summary-list {
      margin: 0;
      padding: 0 0 0 20px;
    }
    
    .summary-list li {
      margin-bottom: 8px;
    }
    
    footer {
      text-align: center;
      padding: 20px;
      font-size: 14px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${title}</h1>
      <div class="meta">
        <div class="meta-item">项目: ${data.projectInfo.name} v${data.projectInfo.version}</div>
        <div class="meta-item">构建环境: ${data.environment}</div>
        <div class="meta-item">构建时间: ${formatDate(data.buildTime)}</div>
        <div class="meta-item">Node.js: ${data.projectInfo.nodeVersion}</div>
        <div class="meta-item">Webpack: ${data.projectInfo.webpackVersion}</div>
      </div>
    </header>
    
    <div class="card">
      <h2 class="card-title">总体概览</h2>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${totalIssues}</div>
          <div class="stat-label">安全问题总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: var(--error-color)">${criticalIssues}</div>
          <div class="stat-label">严重问题</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: var(--warning-color)">${errorIssues}</div>
          <div class="stat-label">错误问题</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${formatSize(totalSize)}</div>
          <div class="stat-label">总构建大小</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${formatSize(totalGzipSize)}</div>
          <div class="stat-label">Gzip后大小</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: ${oversizedFiles > 0 ? 'var(--warning-color)' : 'var(--success-color)'}">
            ${oversizedFiles}
          </div>
          <div class="stat-label">超出大小限制的文件</div>
        </div>
      </div>
      
      <div class="two-cols">
        <div class="chart-container">
          <canvas id="severityChart"></canvas>
        </div>
        <div class="chart-container">
          <canvas id="bundleSizeChart"></canvas>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2 class="card-title">
        安全问题
        <span>
          ${criticalIssues > 0 ? `<span class="badge badge-critical">${criticalIssues} 严重</span>` : ''}
          ${errorIssues > 0 ? `<span class="badge badge-error">${errorIssues} 错误</span>` : ''}
          ${warningIssues > 0 ? `<span class="badge badge-warning">${warningIssues} 警告</span>` : ''}
        </span>
      </h2>
      ${securityTableHtml}
      
      ${
        totalIssues > 0
          ? `
      <div style="margin-top: 20px">
        <h3>安全建议摘要</h3>
        <ul class="summary-list">
          <li>检查所有严重和错误级别问题</li>
          <li>优先处理XSS和注入类漏洞</li>
          <li>确保所有用户输入都经过适当验证和转义</li>
          <li>避免使用不安全的JavaScript API如eval()和innerHTML</li>
          <li>更新有安全漏洞的依赖库</li>
        </ul>
      </div>
      `
          : ''
      }
    </div>
    
    <div class="card">
      <h2 class="card-title">
        包大小分析
        <span>
          ${oversizedFiles > 0 ? `<span class="badge badge-warning">${oversizedFiles} 文件超出限制</span>` : ''}
        </span>
      </h2>
      ${bundleSizeTableHtml}
      
      ${
        oversizedFiles > 0
          ? `
      <div style="margin-top: 20px">
        <h3>优化建议</h3>
        <ul class="summary-list">
          <li>应用代码分割策略，实现懒加载非关键资源</li>
          <li>检查并移除未使用的依赖包</li>
          <li>优化图片和媒体资源</li>
          <li>考虑使用tree-shaking减少包体积</li>
          <li>使用webpack-bundle-analyzer分析具体依赖情况</li>
        </ul>
      </div>
      `
          : ''
      }
    </div>
    
    <footer>
      由SafeScan生成 | ${formatDate(new Date())}
    </footer>
  </div>
  
  <script>
    // 初始化图表
    document.addEventListener('DOMContentLoaded', function() {
      // 安全问题严重程度分布图
      const severityCtx = document.getElementById('severityChart').getContext('2d');
      new Chart(severityCtx, {
        type: 'doughnut',
        data: ${severityChartData},
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom'
            },
            title: {
              display: true,
              text: '安全问题严重程度分布'
            }
          }
        }
      });
      
      // 包大小图表
      const bundleSizeCtx = document.getElementById('bundleSizeChart').getContext('2d');
      new Chart(bundleSizeCtx, {
        type: 'bar',
        data: ${bundleSizeChartData},
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false
            },
            title: {
              display: true,
              text: '前10个最大的文件 (KB)'
            }
          },
          scales: {
            y: {
              beginAtZero: true
            }
          }
        }
      });
    });
  </script>
</body>
</html>
  `;
}

/**
 * 获取严重程度标签
 */
function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'critical':
      return '<span class="badge badge-critical">严重</span>';
    case 'error':
      return '<span class="badge badge-error">错误</span>';
    case 'warning':
      return '<span class="badge badge-warning">警告</span>';
    case 'info':
      return '<span class="badge badge-info">信息</span>';
    default:
      return severity;
  }
}

/**
 * 格式化问题位置
 */
function formatLocation(issue: SecurityIssue): string {
  if (!issue.location) {
    return '未知';
  }

  let location = issue.location.file;

  if (issue.location.line !== undefined) {
    location += `:${issue.location.line}`;

    if (issue.location.column !== undefined) {
      location += `:${issue.location.column}`;
    }
  }

  return location;
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

/**
 * 格式化日期
 */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}
