import { logger } from './logger';

/**
 * 错误类型枚举
 */
export enum ErrorType {
  VALIDATION = 'validation',
  PARSER = 'parser',
  ANALYZER = 'analyzer',
  RULE = 'rule',
  CONFIG = 'config',
  SYSTEM = 'system',
  PLUGIN = 'plugin',
  UNKNOWN = 'unknown',
}

/**
 * 错误严重等级枚举
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * 错误详情接口
 */
export interface IErrorDetails {
  code: string;
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  stack?: string;
  cause?: Error | unknown;
  metadata?: Record<string, unknown>;
}

/**
 * SafeScan基础错误类
 */
export class SafeScanError extends Error {
  public readonly code: string;
  public readonly type: ErrorType;
  public readonly severity: ErrorSeverity;
  public readonly metadata?: Record<string, unknown>;
  public readonly cause?: Error | unknown;

  constructor({
    code,
    type = ErrorType.UNKNOWN,
    severity = ErrorSeverity.MEDIUM,
    message,
    stack,
    cause,
    metadata,
  }: IErrorDetails) {
    super(message);
    this.name = 'SafeScanError';
    this.code = code;
    this.type = type;
    this.severity = severity;
    this.cause = cause;
    this.metadata = metadata;

    if (stack) {
      this.stack = stack;
    }

    // 自动记录错误日志
    this.logError();
  }

  /**
   * 记录错误日志
   */
  private logError(): void {
    const errLogger = logger.createSubLogger(this.type);

    errLogger.error(`[${this.code}] ${this.message}`);

    if (this.metadata && Object.keys(this.metadata).length > 0) {
      errLogger.debug('Error metadata:', this.metadata);
    }

    if (this.cause instanceof Error) {
      errLogger.debug('Caused by:', this.cause);
    }
  }

  /**
   * 转换为JSON对象
   */
  public toJSON(): Omit<IErrorDetails, 'cause'> & { cause?: string } {
    return {
      code: this.code,
      type: this.type,
      severity: this.severity,
      message: this.message,
      stack: this.stack,
      metadata: this.metadata,
      cause: this.cause instanceof Error ? this.cause.message : String(this.cause),
    };
  }
}

/**
 * 解析错误类
 */
export class ParserError extends SafeScanError {
  constructor(details: Omit<IErrorDetails, 'type'>) {
    super({
      ...details,
      type: ErrorType.PARSER,
    });
    this.name = 'ParserError';
  }
}

/**
 * 验证错误类
 */
export class ValidationError extends SafeScanError {
  constructor(details: Omit<IErrorDetails, 'type'>) {
    super({
      ...details,
      type: ErrorType.VALIDATION,
    });
    this.name = 'ValidationError';
  }
}

/**
 * 配置错误类
 */
export class ConfigError extends SafeScanError {
  constructor(details: Omit<IErrorDetails, 'type'>) {
    super({
      ...details,
      type: ErrorType.CONFIG,
    });
    this.name = 'ConfigError';
  }
}

/**
 * 规则错误类
 */
export class RuleError extends SafeScanError {
  constructor(details: Omit<IErrorDetails, 'type'>) {
    super({
      ...details,
      type: ErrorType.RULE,
    });
    this.name = 'RuleError';
  }
}

/**
 * 分析器错误类
 */
export class AnalyzerError extends SafeScanError {
  constructor(details: Omit<IErrorDetails, 'type'>) {
    super({
      ...details,
      type: ErrorType.ANALYZER,
    });
    this.name = 'AnalyzerError';
  }
}

/**
 * 系统错误类
 */
export class SystemError extends SafeScanError {
  constructor(details: Omit<IErrorDetails, 'type'>) {
    super({
      ...details,
      type: ErrorType.SYSTEM,
    });
    this.name = 'SystemError';
  }
}

/**
 * 插件错误类
 */
export class PluginError extends SafeScanError {
  constructor(details: Omit<IErrorDetails, 'type'>) {
    super({
      ...details,
      type: ErrorType.PLUGIN,
    });
    this.name = 'PluginError';
  }
}

/**
 * 创建全局异常处理器
 */
export function setupGlobalErrorHandlers(): void {
  process.on('uncaughtException', (error) => {
    new SystemError({
      code: 'UNCAUGHT_EXCEPTION',
      severity: ErrorSeverity.CRITICAL,
      message: 'Uncaught exception occurred',
      cause: error,
    });

    // 已经在SafeScanError构造函数中记录了日志

    // 在开发环境可以终止进程，生产环境根据配置决定
    if (process.env.NODE_ENV === 'development') {
      process.exit(1);
    }
  });

  process.on('unhandledRejection', (reason, promise) => {
    new SystemError({
      code: 'UNHANDLED_REJECTION',
      severity: ErrorSeverity.HIGH,
      message: 'Unhandled promise rejection',
      cause: reason instanceof Error ? reason : new Error(String(reason)),
      metadata: { promise },
    });

    // 已经在SafeScanError构造函数中记录了日志
  });
}
