import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';

/**
 * 生成JSON格式的报告
 *
 * @param data 报告数据
 * @param outputPath 输出文件路径
 */
export async function generateJSONReport(data: any, outputPath: string): Promise<void> {
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 写入JSON文件
  await promisify(fs.writeFile)(outputPath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 生成HTML格式的报告
 *
 * @param data 报告数据
 * @param outputPath 输出文件路径
 * @param reportType 报告类型
 * @param templatePath 可选的自定义模板路径
 */
export async function generateHTMLReport(
  data: any,
  outputPath: string,
  reportType: string = 'security-audit',
  templatePath?: string
): Promise<void> {
  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 读取模板
  let templateContent: string;

  if (templatePath && fs.existsSync(templatePath)) {
    templateContent = await promisify(fs.readFile)(templatePath, 'utf8');
  } else {
    // 使用内置的模板
    templateContent = getDefaultTemplate(reportType);
  }

  // 编译模板
  const template = Handlebars.compile(templateContent);

  // 注册辅助函数
  Handlebars.registerHelper('severityColor', (severity: string) => {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'red';
      case 'error':
        return 'darkorange';
      case 'warning':
        return 'gold';
      case 'info':
        return 'steelblue';
      default:
        return 'gray';
    }
  });

  Handlebars.registerHelper('formatDate', (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  });

  Handlebars.registerHelper('formatBytes', (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  });

  // 准备报告数据
  const reportData = {
    data,
    reportType,
    generatedAt: new Date().toISOString(),
    summary: generateSummary(data, reportType),
  };

  // 生成HTML内容
  const html = template(reportData);

  // 写入文件
  await promisify(fs.writeFile)(outputPath, html, 'utf8');
}

/**
 * 生成PDF格式的报告
 *
 * @param data 报告数据
 * @param outputPath 输出文件路径
 * @param reportType 报告类型
 * @param templatePath 可选的自定义模板路径
 */
export async function generatePDFReport(
  data: any,
  outputPath: string,
  reportType: string = 'security-audit',
  templatePath?: string
): Promise<void> {
  // 先生成HTML报告
  const tempHtmlPath = outputPath.replace(/\.pdf$/i, '.temp.html');
  await generateHTMLReport(data, tempHtmlPath, reportType, templatePath);

  try {
    // 启动浏览器
    const browser = await puppeteer.launch({
      headless: true,
    });

    // 创建新页面
    const page = await browser.newPage();

    // 加载HTML文件
    await page.goto(`file://${path.resolve(tempHtmlPath)}`, {
      waitUntil: 'networkidle2',
    });

    // 生成PDF
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '1cm',
        right: '1cm',
        bottom: '1cm',
        left: '1cm',
      },
    });

    // 关闭浏览器
    await browser.close();
  } finally {
    // 删除临时HTML文件
    if (fs.existsSync(tempHtmlPath)) {
      fs.unlinkSync(tempHtmlPath);
    }
  }
}

/**
 * 生成报告摘要
 *
 * @param data 报告数据
 * @param reportType 报告类型
 */
function generateSummary(data: any, reportType: string): any {
  switch (reportType) {
    case 'memory-leak':
      return {
        leakCount: data.leaks ? data.leaks.length : 0,
        totalLeakSize: data.totalLeakSize || 0,
        criticalLeaks: data.leaks
          ? data.leaks.filter((l: any) => l.severity === 'critical').length
          : 0,
        majorLeaks: data.leaks ? data.leaks.filter((l: any) => l.severity === 'major').length : 0,
        minorLeaks: data.leaks ? data.leaks.filter((l: any) => l.severity === 'minor').length : 0,
      };

    case 'security-audit':
      if (Array.isArray(data)) {
        const issueCount = data.reduce(
          (count: number, result: any) => count + (result.issues ? result.issues.length : 0),
          0
        );

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

        const warningCount = data.reduce(
          (count: number, result: any) =>
            count +
            (result.issues ? result.issues.filter((i: any) => i.severity === 'WARNING').length : 0),
          0
        );

        const infoCount = data.reduce(
          (count: number, result: any) =>
            count +
            (result.issues ? result.issues.filter((i: any) => i.severity === 'INFO').length : 0),
          0
        );

        return {
          issueCount,
          criticalCount,
          errorCount,
          warningCount,
          infoCount,
          fileCount: data.length,
        };
      }
      return {};

    default:
      return {};
  }
}

/**
 * 获取默认模板内容
 *
 * @param reportType 报告类型
 */
function getDefaultTemplate(_reportType: string): string {
  // 这里只返回基本模板，实际项目中应该有更丰富的内置模板
  return `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SafeScan 安全报告</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        line-height: 1.6;
        color: #333;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }
      header {
        background-color: #2c3e50;
        color: white;
        padding: 20px;
        margin-bottom: 20px;
      }
      h1 {
        margin: 0;
        font-size: 24px;
      }
      .summary {
        background-color: #f8f9fa;
        border-left: 4px solid #2c3e50;
        padding: 15px;
        margin-bottom: 20px;
      }
      .issue {
        border-left: 4px solid #e74c3c;
        padding: 10px 15px;
        margin-bottom: 15px;
        background-color: #fff;
      }
      .issue h3 {
        margin-top: 0;
      }
      .issue.critical { border-color: #e74c3c; }
      .issue.error { border-color: #e67e22; }
      .issue.warning { border-color: #f1c40f; }
      .issue.info { border-color: #3498db; }
      
      .badge {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 3px;
        color: white;
        font-size: 12px;
        font-weight: bold;
      }
      .badge.critical { background-color: #e74c3c; }
      .badge.error { background-color: #e67e22; }
      .badge.warning { background-color: #f1c40f; color: #333; }
      .badge.info { background-color: #3498db; }
      
      .code {
        font-family: monospace;
        background-color: #f8f9fa;
        padding: 10px;
        border-radius: 3px;
        overflow-x: auto;
      }
      
      footer {
        margin-top: 30px;
        text-align: center;
        font-size: 12px;
        color: #777;
      }
      
      .chart-container {
        max-width: 600px;
        margin: 20px auto;
      }
    </style>
  </head>
  <body>
    <header>
      <div class="container">
        <h1>SafeScan 安全报告</h1>
        <p>生成时间: {{formatDate generatedAt}}</p>
      </div>
    </header>
    
    <div class="container">
      <div class="summary">
        <h2>报告摘要</h2>
        {{#if summary.issueCount}}
          <p>发现 <strong>{{summary.issueCount}}</strong> 个安全问题：</p>
          <ul>
            <li><span class="badge critical">严重</span> {{summary.criticalCount}} 个</li>
            <li><span class="badge error">错误</span> {{summary.errorCount}} 个</li>
            <li><span class="badge warning">警告</span> {{summary.warningCount}} 个</li>
            <li><span class="badge info">信息</span> {{summary.infoCount}} 个</li>
          </ul>
        {{/if}}
        
        {{#if summary.leakCount}}
          <p>发现 <strong>{{summary.leakCount}}</strong> 个内存泄漏，总计 {{formatBytes summary.totalLeakSize}}：</p>
          <ul>
            <li><span class="badge critical">严重</span> {{summary.criticalLeaks}} 个</li>
            <li><span class="badge error">重要</span> {{summary.majorLeaks}} 个</li>
            <li><span class="badge warning">轻微</span> {{summary.minorLeaks}} 个</li>
          </ul>
        {{/if}}
      </div>
      
      <div class="content">
        <!-- 在这里根据reportType添加不同的内容模板 -->
      </div>
    </div>
    
    <footer>
      <div class="container">
        <p>由 SafeScan 前端安全扫描工具生成</p>
      </div>
    </footer>
  </body>
  </html>
  `;
}
