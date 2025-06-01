/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger, LogLevel } from '../../../packages/core/src/utils/logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleLogSpy: any;
  let consoleInfoSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;
  let consoleDebugSpy: any;

  beforeEach(() => {
    // 创建一个新的 Logger 实例
    logger = new Logger({
      level: LogLevel.DEBUG,
      prefix: 'test',
    });

    // 监视控制台方法
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    // 恢复控制台方法
    vi.restoreAllMocks();
  });

  it('应该创建具有指定配置的 Logger 实例', () => {
    // @ts-expect-error 访问私有属性进行测试
    expect(logger.config.level).toBe(LogLevel.DEBUG);
    // @ts-expect-error 访问私有属性进行测试
    expect(logger.config.prefix).toBe('test');
  });

  it('应该根据日志级别记录日志', () => {
    logger.debug('调试消息');
    logger.info('信息消息');
    logger.warn('警告消息');
    logger.error('错误消息');

    expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('应该根据日志级别过滤日志', () => {
    logger.setLevel(LogLevel.ERROR);

    logger.debug('调试消息');
    logger.info('信息消息');
    logger.warn('警告消息');
    logger.error('错误消息');

    expect(consoleDebugSpy).not.toHaveBeenCalled();
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('应该在静默模式下不记录任何日志', () => {
    logger.setSilent(true);

    logger.debug('调试消息');
    logger.info('信息消息');
    logger.warn('警告消息');
    logger.error('错误消息');

    expect(consoleDebugSpy).not.toHaveBeenCalled();
    expect(consoleInfoSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('应该创建子日志记录器', () => {
    const subLogger = logger.createSubLogger('sub');

    subLogger.info('子日志记录器消息');

    expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('[test:sub]'));
  });

  it('应该记录错误对象', () => {
    const error = new Error('测试错误');
    logger.error(error);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('测试错误'),
      expect.anything()
    );
  });

  it('应该启用/禁用彩色输出', () => {
    logger.setEnableColors(false);

    logger.info('无颜色消息');

    const call = consoleInfoSpy.mock.calls[0][0];
    expect(call.includes('\u001b[')).toBe(false); // 不应包含 ANSI 颜色代码

    logger.setEnableColors(true);

    logger.info('彩色消息');

    const colorCall = consoleInfoSpy.mock.calls[1][0];
    expect(colorCall.includes('\u001b[')).toBe(true); // 应包含 ANSI 颜色代码
  });
});
