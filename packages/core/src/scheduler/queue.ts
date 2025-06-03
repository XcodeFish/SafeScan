import { ISchedulableTask, TaskPriority } from '../types/scheduler';

/**
 * 优先级队列系统，用于基于任务优先级进行调度
 * 支持动态优先级调整和多级队列管理
 */
export class PriorityQueue<T extends ISchedulableTask> {
  private queues: Map<TaskPriority, T[]>;
  private totalTasks: number;

  constructor() {
    this.queues = new Map();
    this.totalTasks = 0;

    // 初始化各优先级队列
    Object.values(TaskPriority).forEach((priority) => {
      if (typeof priority === 'number') {
        this.queues.set(priority as TaskPriority, []);
      }
    });
  }

  /**
   * 添加任务到队列
   * @param task 待添加的任务
   */
  public enqueue(task: T): void {
    const priority = task.priority;
    const queue = this.queues.get(priority) || [];
    queue.push(task);
    this.queues.set(priority, queue);
    this.totalTasks++;
  }

  /**
   * 获取优先级最高的任务
   * @returns 下一个应该执行的任务
   */
  public dequeue(): T | undefined {
    const priorities = Array.from(this.queues.keys()).sort((a, b) => a - b);

    for (const priority of priorities) {
      const queue = this.queues.get(priority);
      if (queue && queue.length > 0) {
        const task = queue.shift();
        this.totalTasks--;
        return task;
      }
    }

    return undefined;
  }

  /**
   * 调整任务优先级
   * @param taskId 任务ID
   * @param newPriority 新优先级
   * @returns 是否成功调整
   */
  public adjustPriority(taskId: string, newPriority: TaskPriority): boolean {
    // 找到任务并调整其优先级
    for (const queue of this.queues.values()) {
      const taskIndex = queue.findIndex((t) => t.id === taskId);

      if (taskIndex !== -1) {
        // 任务存在，移除并设置新优先级
        const task = queue.splice(taskIndex, 1)[0];
        task.priority = newPriority;

        // 添加到新优先级队列
        const newPriorityQueue = this.queues.get(newPriority) || [];
        newPriorityQueue.push(task);
        this.queues.set(newPriority, newPriorityQueue);

        return true;
      }
    }

    return false;
  }

  /**
   * 获取队列中任务数量
   */
  public size(): number {
    return this.totalTasks;
  }

  /**
   * 检查队列是否为空
   */
  public isEmpty(): boolean {
    return this.totalTasks === 0;
  }

  /**
   * 清空所有队列
   */
  public clear(): void {
    this.queues.forEach((_, priority) => {
      this.queues.set(priority, []);
    });
    this.totalTasks = 0;
  }

  /**
   * 按优先级获取队列统计信息
   */
  public getStats(): Record<TaskPriority, number> {
    const stats: Partial<Record<TaskPriority, number>> = {};

    this.queues.forEach((queue, priority) => {
      stats[priority] = queue.length;
    });

    return stats as Record<TaskPriority, number>;
  }
}
