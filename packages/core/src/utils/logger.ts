/**
 * 日志级别定义
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * 日志配置接口
 */
export interface ILoggerConfig {
  level: LogLevel;
  prefix?: string;
  enableColors?: boolean;
  silent?: boolean;
}

/**
 * 默认日志配置
 */
const DEFAULT_CONFIG: ILoggerConfig = {
  level: LogLevel.INFO,
  enableColors: true,
  silent: false,
};

/**
 * 日志级别优先级
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
};

/**
 * 日志颜色配置
 */
const LOG_COLORS = {
  [LogLevel.DEBUG]: '\x1b[36m', // 青色
  [LogLevel.INFO]: '\x1b[32m', // 绿色
  [LogLevel.WARN]: '\x1b[33m', // 黄色
  [LogLevel.ERROR]: '\x1b[31m', // 红色
  reset: '\x1b[0m',
};

/**
 * 核心日志工具类
 */
export class Logger {
  private config: ILoggerConfig;

  constructor(config: Partial<ILoggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 判断是否应该记录当前级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    if (this.config.silent) return false;
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
  }

  /**
   * 格式化日志消息
   */
  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    const prefix = this.config.prefix ? `[${this.config.prefix}] ` : '';

    if (this.config.enableColors) {
      const color = LOG_COLORS[level];
      return `${color}${timestamp} ${level.toUpperCase()} ${prefix}${message}${LOG_COLORS.reset}`;
    }

    return `${timestamp} ${level.toUpperCase()} ${prefix}${message}`;
  }

  /**
   * 记录调试日志
   */
  public debug(message: string, ...args: unknown[]): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    console.debug(this.formatMessage(LogLevel.DEBUG, message), ...args);
  }

  /**
   * 记录信息日志
   */
  public info(message: string, ...args: unknown[]): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    console.info(this.formatMessage(LogLevel.INFO, message), ...args);
  }

  /**
   * 记录警告日志
   */
  public warn(message: string, ...args: unknown[]): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    console.warn(this.formatMessage(LogLevel.WARN, message), ...args);
  }

  /**
   * 记录错误日志
   */
  public error(message: string | Error, ...args: unknown[]): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    const errorMessage = message instanceof Error ? message.stack || message.message : message;
    console.error(this.formatMessage(LogLevel.ERROR, errorMessage), ...args);
  }

  /**
   * 创建子日志记录器
   */
  public createSubLogger(prefix: string): Logger {
    return new Logger({
      ...this.config,
      prefix: this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix,
    });
  }

  /**
   * 设置日志级别
   */
  public setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * 启用/禁用彩色输出
   */
  public setEnableColors(enable: boolean): void {
    this.config.enableColors = enable;
  }

  /**
   * 设置静默模式
   */
  public setSilent(silent: boolean): void {
    this.config.silent = silent;
  }
}

/**
 * 创建全局默认日志记录器实例
 */
export const logger = new Logger();

/**
 * 根据环境变量设置日志级别
 */
if (process.env.SAFESCAN_LOG_LEVEL) {
  const envLevel = process.env.SAFESCAN_LOG_LEVEL.toLowerCase() as LogLevel;
  if (Object.values(LogLevel).includes(envLevel)) {
    logger.setLevel(envLevel);
  }
}

/**
 * 导出默认日志记录器实例方法
 */
export const debug = logger.debug.bind(logger);
export const info = logger.info.bind(logger);
export const warn = logger.warn.bind(logger);
export const error = logger.error.bind(logger);
