import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventBus } from '../../../packages/core/src/utils/event-bus';
import { Monitor, MetricType, MonitorEventType } from '../../../packages/core/src/utils/monitor';

// 模拟process.memoryUsage和process.cpuUsage
vi.mock('process', () => ({
  memoryUsage: vi.fn(() => ({
    heapUsed: 100 * 1024 * 1024, // 100MB
    heapTotal: 200 * 1024 * 1024, // 200MB
    rss: 300 * 1024 * 1024, // 300MB
    external: 10 * 1024 * 1024, // 10MB
  })),
  cpuUsage: vi.fn(() => ({
    user: 1000000, // 1秒 (微秒)
    system: 500000, // 0.5秒 (微秒)
  })),
}));

describe('Monitor', () => {
  let monitorInstance: Monitor;
  let eventBusSpy: any;

  beforeEach(() => {
    // 重置单例
    // @ts-expect-error 访问私有属性进行测试
    Monitor.instance = undefined;

    // 重置计时器
    vi.useFakeTimers();

    // 监听事件总线
    eventBusSpy = {
      emit: vi.fn(),
    };

    // 模拟EventBus.getInstance
    vi.spyOn(EventBus, 'getInstance').mockReturnValue(eventBusSpy as any);

    // 创建监控实例
    monitorInstance = Monitor.getInstance({
      enabled: false, // 关闭自动采样
      sampleInterval: 1000,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('应该创建单例实例', () => {
    const instance1 = Monitor.getInstance();
    const instance2 = Monitor.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('应该能够更新配置', () => {
    monitorInstance.updateConfig({ sampleInterval: 2000 });
    // @ts-expect-error 访问私有属性进行测试
    expect(monitorInstance.config.sampleInterval).toBe(2000);
  });

  it('应该能够启动和停止监控', () => {
    const startSpy = vi.spyOn(monitorInstance, 'start');
    const stopSpy = vi.spyOn(monitorInstance, 'stop');

    monitorInstance.updateConfig({ enabled: true });
    expect(startSpy).toHaveBeenCalled();

    monitorInstance.updateConfig({ enabled: false });
    expect(stopSpy).toHaveBeenCalled();
  });

  it('应该收集系统指标', () => {
    // @ts-expect-error 调用私有方法进行测试
    const result = monitorInstance.getSystemResourceUsage();

    expect(result.memoryUsage.heapUsed).toBeCloseTo(100);
    expect(result.memoryUsage.heapTotal).toBeCloseTo(200);
    expect(result.memoryUsage.rss).toBeCloseTo(300);
    expect(result.memoryUsage.external).toBeCloseTo(10);
  });

  it('应该记录指标并通知事件总线', () => {
    const metricName = 'test-counter';
    monitorInstance.counter(metricName, 5);

    expect(eventBusSpy.emit).toHaveBeenCalledWith(
      MonitorEventType.METRIC_UPDATED,
      expect.objectContaining({
        name: metricName,
        type: MetricType.COUNTER,
        value: 5,
      })
    );

    // 再次增加计数器
    monitorInstance.counter(metricName, 3);

    // 应当累加值
    expect(eventBusSpy.emit).toHaveBeenCalledWith(
      MonitorEventType.METRIC_UPDATED,
      expect.objectContaining({
        name: metricName,
        type: MetricType.COUNTER,
        value: 8,
      })
    );
  });

  it('应该记录仪表盘指标', () => {
    const metricName = 'test-gauge';
    monitorInstance.gauge(metricName, 42);

    expect(eventBusSpy.emit).toHaveBeenCalledWith(
      MonitorEventType.METRIC_UPDATED,
      expect.objectContaining({
        name: metricName,
        type: MetricType.GAUGE,
        value: 42,
      })
    );

    // 仪表盘指标应该替换而不是累加
    monitorInstance.gauge(metricName, 50);

    expect(eventBusSpy.emit).toHaveBeenCalledWith(
      MonitorEventType.METRIC_UPDATED,
      expect.objectContaining({
        name: metricName,
        type: MetricType.GAUGE,
        value: 50,
      })
    );
  });

  it('应该正确测量时间', () => {
    const metricName = 'test-timer';
    const stopTimer = monitorInstance.startTimer(metricName);

    // 前进500毫秒
    vi.advanceTimersByTime(500);

    // 停止计时器
    const duration = stopTimer();

    // 验证时间接近500ms
    expect(duration).toBe(500);

    expect(eventBusSpy.emit).toHaveBeenCalledWith(
      MonitorEventType.METRIC_UPDATED,
      expect.objectContaining({
        name: metricName,
        type: MetricType.TIMER,
        value: 500,
      })
    );
  });

  it('应该能够获取指标', () => {
    const metricName = 'test-metric';
    monitorInstance.counter(metricName, 42);

    const metric = monitorInstance.getMetric(metricName);
    expect(metric).toBeDefined();
    expect(metric!.name).toBe(metricName);
    expect(metric!.value).toBe(42);
  });

  it('应该维护指标历史记录', () => {
    const metricName = 'test-history';

    // 添加三个值
    monitorInstance.gauge(metricName, 1);
    monitorInstance.gauge(metricName, 2);
    monitorInstance.gauge(metricName, 3);

    const history = monitorInstance.getMetricHistory(metricName);
    expect(history.length).toBe(3);
    expect(history[0].value).toBe(1);
    expect(history[1].value).toBe(2);
    expect(history[2].value).toBe(3);
  });

  it('应该能够重置指标', () => {
    const metricName1 = 'metric1';
    const metricName2 = 'metric2';

    monitorInstance.counter(metricName1, 1);
    monitorInstance.counter(metricName2, 2);

    // 重置单个指标
    monitorInstance.resetMetrics(metricName1);

    expect(monitorInstance.getMetric(metricName1)).toBeUndefined();
    expect(monitorInstance.getMetric(metricName2)).toBeDefined();

    // 重置所有指标
    monitorInstance.resetMetrics();

    expect(monitorInstance.getMetric(metricName2)).toBeUndefined();
    expect(monitorInstance.getAllMetrics().size).toBe(0);
  });

  it('应该能够获取运行时间', () => {
    // @ts-expect-error 修改私有属性用于测试
    monitorInstance.startTime = Date.now() - 1000;

    const uptime = monitorInstance.getUptime();
    expect(uptime).toBeGreaterThanOrEqual(1000);
  });

  it('应该在达到内存阈值时发出警报', () => {
    // 模拟内存使用超过警告阈值
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      heapUsed: 600 * 1024 * 1024, // 600MB
      heapTotal: 1000 * 1024 * 1024,
      rss: 800 * 1024 * 1024,
      external: 50 * 1024 * 1024,
    } as any);

    // @ts-expect-error 调用私有方法进行测试
    monitorInstance.collectMetrics();

    expect(eventBusSpy.emit).toHaveBeenCalledWith(
      MonitorEventType.MEMORY_ALERT,
      expect.objectContaining({
        level: 'warning',
      })
    );

    // 模拟内存使用超过临界阈值
    vi.spyOn(process, 'memoryUsage').mockReturnValue({
      heapUsed: 1200 * 1024 * 1024, // 1200MB
      heapTotal: 2000 * 1024 * 1024,
      rss: 1500 * 1024 * 1024,
      external: 100 * 1024 * 1024,
    } as any);

    // @ts-expect-error 调用私有方法进行测试
    monitorInstance.collectMetrics();

    expect(eventBusSpy.emit).toHaveBeenCalledWith(
      MonitorEventType.MEMORY_ALERT,
      expect.objectContaining({
        level: 'critical',
      })
    );
  });
});
