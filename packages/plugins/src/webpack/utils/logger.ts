/**
 * SafeScan日志工具
 */

import chalk from 'chalk';

// 日志级别类型
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// 日志记录器接口
interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// 颜色配置
const COLORS = {
  debug: chalk.gray,
  info: chalk.blue,
  warn: chalk.yellow,
  error: chalk.red,
};

// 构建前缀
function buildPrefix(level: LogLevel, namespace: string): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  const coloredPrefix = COLORS[level](prefix);
  return `${coloredPrefix} ${namespace}:`;
}

// 当前日志级别
let currentLogLevel: LogLevel = 'info';

// 根据环境变量设置日志级别
if (process.env.SAFESCAN_LOG_LEVEL) {
  const envLevel = process.env.SAFESCAN_LOG_LEVEL.toLowerCase() as LogLevel;
  if (['debug', 'info', 'warn', 'error'].includes(envLevel)) {
    currentLogLevel = envLevel;
  }
}

// 日志级别优先级映射
const LOG_LEVEL_PRIORITY = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// 获取日志实例
export function getLogger(namespace: string): Logger {
  return {
    debug(message: string): void {
      if (LOG_LEVEL_PRIORITY[currentLogLevel] <= LOG_LEVEL_PRIORITY.debug) {
        console.debug(buildPrefix('debug', namespace), message);
      }
    },

    info(message: string): void {
      if (LOG_LEVEL_PRIORITY[currentLogLevel] <= LOG_LEVEL_PRIORITY.info) {
        console.info(buildPrefix('info', namespace), message);
      }
    },

    warn(message: string): void {
      if (LOG_LEVEL_PRIORITY[currentLogLevel] <= LOG_LEVEL_PRIORITY.warn) {
        console.warn(buildPrefix('warn', namespace), message);
      }
    },

    error(message: string): void {
      if (LOG_LEVEL_PRIORITY[currentLogLevel] <= LOG_LEVEL_PRIORITY.error) {
        console.error(buildPrefix('error', namespace), message);
      }
    },
  };
}

// 设置日志级别
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

// 格式化错误对象
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${error.stack || ''}`;
  }

  return String(error);
}
