/**
 * SafeScan Webpack插件类型定义
 */

/**
 * SafeScan Webpack插件配置选项
 */
export interface SafeScanWebpackPluginOptions {
  /**
   * 是否启用生产构建检查
   * @default true
   */
  productionCheck: boolean;

  /**
   * 是否启用包大小监控
   * @default true
   */
  bundleSizeMonitor: boolean;

  /**
   * 是否生成可视化报告
   * @default true
   */
  visualReport: boolean;

  /**
   * 报告输出路径
   * @default 'safescan-report.html'
   */
  reportOutputPath: string;

  /**
   * 包大小警告阈值(字节)
   * @default 250 * 1024 (250KB)
   */
  sizeLimit: number;

  /**
   * 自定义规则配置
   */
  rules?: {
    /**
     * 忽略的规则ID
     */
    ignoreRules?: string[];

    /**
     * 自定义规则严重级别
     */
    customSeverity?: Record<string, 'error' | 'warning' | 'info'>;
  };

  /**
   * 报告生成选项
   */
  reportOptions?: {
    /**
     * 是否开启自动打开报告
     */
    openReport?: boolean;

    /**
     * 报告标题
     */
    title?: string;

    /**
     * 展示趋势历史数量
     */
    historyCount?: number;
  };
}

/**
 * 安全问题信息
 */
export interface SecurityIssue {
  /**
   * 问题ID
   */
  id: string;

  /**
   * 问题严重程度
   */
  severity: 'critical' | 'error' | 'warning' | 'info';

  /**
   * 问题描述
   */
  message: string;

  /**
   * 问题位置
   */
  location?: {
    file: string;
    line?: number;
    column?: number;
  };

  /**
   * 问题修复建议
   */
  suggestion?: string;

  /**
   * 问题详情链接
   */
  docsUrl?: string;
}

/**
 * 构建大小信息
 */
export interface BundleSizeInfo {
  /**
   * 资源名称
   */
  name: string;

  /**
   * 原始大小(字节)
   */
  size: number;

  /**
   * Gzip后大小(字节)
   */
  gzipSize?: number;

  /**
   * 是否超过阈值
   */
  isOverSizeLimit: boolean;

  /**
   * 与上次构建大小比较(百分比)
   */
  changePercentage?: number;

  /**
   * 文件路径
   */
  path: string;
}

/**
 * 报告数据
 */
export interface ReportData {
  /**
   * 构建时间
   */
  buildTime: Date;

  /**
   * 构建环境
   */
  environment: string;

  /**
   * 安全问题列表
   */
  securityIssues: SecurityIssue[];

  /**
   * 包大小信息
   */
  bundleSizes: BundleSizeInfo[];

  /**
   * 项目信息
   */
  projectInfo: {
    name: string;
    version: string;
    nodeVersion: string;
    webpackVersion: string;
  };
}
