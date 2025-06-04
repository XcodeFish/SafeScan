/**
 * 创建一个防抖动函数，在延迟时间内只执行一次
 * @param func 要执行的函数
 * @param delay 延迟时间（毫秒）
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => ReturnType<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  let pendingPromise: ReturnType<T> | null = null;

  return function debouncedFunc(...args: Parameters<T>): ReturnType<T> {
    if (pendingPromise) {
      return pendingPromise;
    }

    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    const promise = new Promise((resolve, reject) => {
      timeoutId = setTimeout(async () => {
        try {
          const result = await func(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          pendingPromise = null;
          timeoutId = null;
        }
      }, delay);
    }) as ReturnType<T>;

    pendingPromise = promise;
    return promise;
  };
}
