import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import os from 'os';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { ISchedulableTask, TaskStatus, IWorkerConfig, IResourceUsage } from '../types/scheduler';

/**
 * 默认工作线程配置
 */
const DEFAULT_WORKER_CONFIG: IWorkerConfig = {
  maxWorkers: Math.max(os.cpus().length - 1, 1), // 默认为CPU核心数-1
  idleTimeout: 60000, // 空闲1分钟自动关闭
  taskTimeout: 30000, // 任务执行30秒超时
  enableScaling: true, // 默认启用自适应伸缩
  resourceThreshold: 0.8, // 资源使用率超过80%时限制线程数
};

/**
 * 工作线程池管理器
 * 负责创建和管理工作线程，分配任务，监控资源使用
 */
export class WorkerPool extends EventEmitter {
  private workers: Map<string, Worker> = new Map();
  private activeWorkers: Map<string, ISchedulableTask> = new Map();
  private idleWorkers: Set<string> = new Set();
  private config: IWorkerConfig;
  private resourceUsage: IResourceUsage;
  private monitorInterval?: NodeJS.Timeout;

  /**
   * 创建工作线程池
   * @param config 工作线程配置
   */
  constructor(config?: Partial<IWorkerConfig>) {
    super();
    this.config = { ...DEFAULT_WORKER_CONFIG, ...config };
    this.resourceUsage = {
      cpu: 0,
      memory: 0,
      activeWorkers: 0,
      pendingTasks: 0,
    };

    // 启动资源监控
    this.startResourceMonitoring();
  }

  /**
   * 执行任务
   * @param task 待执行的任务
   * @returns 任务执行结果
   */
  public async executeTask<T>(task: ISchedulableTask): Promise<T> {
    this.resourceUsage.pendingTasks++;

    try {
      // 获取或创建可用工作线程
      const workerId = await this.getAvailableWorker();

      if (!workerId) {
        throw new Error('无法创建工作线程，可能已达到系统资源限制');
      }

      // 设置任务状态为运行中
      task.status = TaskStatus.RUNNING;

      // 记录活跃工作线程
      this.activeWorkers.set(workerId, task);
      this.idleWorkers.delete(workerId);
      this.resourceUsage.activeWorkers = this.activeWorkers.size;

      // 将任务发送到工作线程执行
      return new Promise<T>((resolve, reject) => {
        const worker = this.workers.get(workerId);
        if (!worker) {
          reject(new Error(`工作线程 ${workerId} 不存在`));
          return;
        }

        // 设置任务超时
        const timeoutId = task.timeout
          ? setTimeout(() => {
              reject(new Error(`任务执行超时 (${task.timeout}ms)`));
              this.terminateWorker(workerId);
            }, task.timeout)
          : undefined;

        // 监听工作线程消息
        worker.once('message', (result) => {
          if (timeoutId) clearTimeout(timeoutId);

          // 释放工作线程资源
          this.releaseWorker(workerId);

          // 更新任务状态
          task.status = TaskStatus.COMPLETED;

          // 返回结果
          resolve(result as T);
        });

        worker.once('error', (err) => {
          if (timeoutId) clearTimeout(timeoutId);

          // 终止异常线程
          this.terminateWorker(workerId);

          // 更新任务状态
          task.status = TaskStatus.FAILED;

          reject(err);
        });

        // 发送任务到工作线程
        worker.postMessage({
          taskId: task.id,
          taskData: task.metadata || {},
          execute: task.execute.toString(), // 序列化函数
        });
      });
    } finally {
      this.resourceUsage.pendingTasks--;
    }
  }

  /**
   * 获取一个可用的工作线程ID
   * @returns 工作线程ID
   */
  private async getAvailableWorker(): Promise<string | undefined> {
    // 优先使用空闲工作线程
    if (this.idleWorkers.size > 0) {
      const workerId = this.idleWorkers.values().next().value;
      return workerId;
    }

    // 检查是否可以创建新的工作线程
    if (this.workers.size < this.getMaxAllowedWorkers()) {
      return this.createWorker();
    }

    // 如果没有可用工作线程，等待工作线程释放
    return new Promise<string | undefined>((resolve) => {
      const onWorkerAvailable = (workerId: string) => {
        this.off('worker-available', onWorkerAvailable);
        resolve(workerId);
      };

      this.once('worker-available', onWorkerAvailable);

      // 设置超时，避免无限等待
      setTimeout(() => {
        this.off('worker-available', onWorkerAvailable);
        resolve(undefined);
      }, 10000); // 10秒超时
    });
  }

  /**
   * 创建新的工作线程
   * @returns 新工作线程ID
   */
  private createWorker(): string {
    const workerId = randomUUID();

    // 创建工作线程
    const worker = new Worker(__filename, {
      workerData: { workerId },
    });

    // 保存工作线程引用
    this.workers.set(workerId, worker);
    this.idleWorkers.add(workerId);

    // 监听工作线程退出
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`工作线程 ${workerId} 异常退出，退出码: ${code}`);
      }

      this.workers.delete(workerId);
      this.idleWorkers.delete(workerId);
      this.activeWorkers.delete(workerId);
      this.resourceUsage.activeWorkers = this.activeWorkers.size;
    });

    return workerId;
  }

  /**
   * 释放工作线程，将其标记为空闲
   * @param workerId 工作线程ID
   */
  private releaseWorker(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    // 从活跃线程移除
    this.activeWorkers.delete(workerId);

    // 添加到空闲线程
    this.idleWorkers.add(workerId);

    // 更新资源使用
    this.resourceUsage.activeWorkers = this.activeWorkers.size;

    // 触发工作线程可用事件
    this.emit('worker-available', workerId);

    // 设置空闲超时
    if (this.config.idleTimeout) {
      setTimeout(() => {
        // 如果超时后仍然空闲，则终止工作线程释放资源
        if (this.idleWorkers.has(workerId)) {
          this.terminateWorker(workerId);
        }
      }, this.config.idleTimeout);
    }
  }

  /**
   * 终止工作线程
   * @param workerId 工作线程ID
   */
  private terminateWorker(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (!worker) return;

    // 终止工作线程
    worker.terminate().catch((err) => console.error(`终止工作线程 ${workerId} 失败:`, err));

    // 清理相关数据
    this.workers.delete(workerId);
    this.idleWorkers.delete(workerId);
    this.activeWorkers.delete(workerId);
    this.resourceUsage.activeWorkers = this.activeWorkers.size;
  }

  /**
   * 获取当前允许的最大工作线程数
   * 根据资源使用情况动态调整
   * @returns 最大工作线程数
   */
  private getMaxAllowedWorkers(): number {
    if (!this.config.enableScaling) {
      return this.config.maxWorkers;
    }

    // 根据CPU和内存使用情况计算允许的最大线程数
    const resourceFactor = Math.max(this.resourceUsage.cpu, this.resourceUsage.memory);

    if (resourceFactor > this.config.resourceThreshold) {
      // 资源使用率高，减少线程上限
      const reductionFactor =
        (resourceFactor - this.config.resourceThreshold) / (1 - this.config.resourceThreshold);
      const reducedWorkers = Math.max(
        1,
        Math.floor(this.config.maxWorkers * (1 - reductionFactor * 0.5))
      );
      return reducedWorkers;
    }

    return this.config.maxWorkers;
  }

  /**
   * 启动资源监控
   */
  private startResourceMonitoring(): void {
    this.monitorInterval = setInterval(() => {
      // 获取CPU使用率
      const cpus = os.cpus();
      const cpuUsage =
        cpus.reduce((total, cpu) => {
          const totalTime = Object.values(cpu.times).reduce((t, v) => t + v, 0);
          const idleTime = cpu.times.idle;
          return total + (1 - idleTime / totalTime);
        }, 0) / cpus.length;

      // 获取内存使用率
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memUsage = (totalMem - freeMem) / totalMem;

      // 更新资源使用情况
      this.resourceUsage.cpu = cpuUsage;
      this.resourceUsage.memory = memUsage;

      // 发出资源使用情况事件
      this.emit('resource-usage', { ...this.resourceUsage });
    }, 5000); // 每5秒监控一次
  }

  /**
   * 获取当前资源使用情况
   * @returns 资源使用情况
   */
  public getResourceUsage(): IResourceUsage {
    return { ...this.resourceUsage };
  }

  /**
   * 获取工作线程数量统计
   * @returns 工作线程数量统计
   */
  public getWorkerStats() {
    return {
      total: this.workers.size,
      active: this.activeWorkers.size,
      idle: this.idleWorkers.size,
      maxAllowed: this.getMaxAllowedWorkers(),
    };
  }

  /**
   * 关闭工作线程池
   */
  public async shutdown(): Promise<void> {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    // 终止所有工作线程
    const terminatePromises = Array.from(this.workers.entries()).map(async ([workerId, worker]) => {
      try {
        await worker.terminate();
      } catch (err) {
        console.error(`终止工作线程 ${workerId} 失败:`, err);
      }
    });

    await Promise.all(terminatePromises);

    // 清空数据
    this.workers.clear();
    this.activeWorkers.clear();
    this.idleWorkers.clear();
    this.resourceUsage.activeWorkers = 0;

    this.emit('shutdown');
  }
}

// 工作线程执行代码
if (!isMainThread) {
  // 工作线程处理逻辑
  parentPort?.on('message', async (message) => {
    try {
      const { taskData, execute } = message;

      // 将字符串形式的函数转换为可执行函数
      const executeFunc = new Function(`return ${execute}`)();

      // 执行任务
      const result = await executeFunc.call(taskData, taskData);

      // 将结果发送回主线程
      parentPort?.postMessage(result);
    } catch (error: any) {
      // 发送错误信息回主线程
      parentPort?.postMessage({
        error: true,
        message: error.message,
        stack: error.stack,
      });
    }
  });

  // 通知主线程工作线程已准备就绪
  parentPort?.postMessage({ status: 'ready', workerId: workerData.workerId });
}
