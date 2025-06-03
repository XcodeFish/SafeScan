/**
 * 缓存系统类型定义
 */
export interface ICacheItem<T = any> {
  /** 缓存键 */
  key: string;
  /** 缓存值 */
  value: T;
  /** 时间戳 */
  timestamp: number;
  /** 过期时间（毫秒） */
  ttl?: number;
  /** 元数据 */
  metadata?: Record<string, any>;
}

/**
 * 基础缓存接口
 */
export interface ICache<T = any> {
  /**
   * 获取缓存项
   * @param key 缓存键
   * @returns 缓存值或undefined
   */
  get(key: string): Promise<T | undefined> | T | undefined;

  /**
   * 设置缓存项
   * @param key 缓存键
   * @param value 缓存值
   * @param options 额外选项
   */
  set(key: string, value: T, options?: ICacheSetOptions): Promise<boolean> | boolean;

  /**
   * 检查键是否存在
   * @param key 缓存键
   */
  has(key: string): Promise<boolean> | boolean;

  /**
   * 删除缓存项
   * @param key 缓存键
   */
  delete(key: string): Promise<boolean> | boolean;

  /**
   * 清空缓存
   */
  clear(): Promise<boolean> | boolean;

  /**
   * 获取缓存大小
   */
  size(): Promise<number> | number;
}

/**
 * 缓存设置选项
 */
export interface ICacheSetOptions {
  /** 过期时间（毫秒） */
  ttl?: number;
  /** 元数据 */
  metadata?: Record<string, any>;
  /** 优先级 */
  priority?: CachePriority;
}

/**
 * 缓存优先级枚举
 */
export enum CachePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * 缓存统计信息接口
 */
export interface ICacheStats {
  /** 缓存项数量 */
  itemCount: number;
  /** 命中次数 */
  hits: number;
  /** 未命中次数 */
  misses: number;
  /** 命中率 */
  hitRatio: number;
  /** 写入次数 */
  writes: number;
  /** 删除次数 */
  deletes: number;
  /** 平均访问时间（毫秒） */
  averageAccessTime?: number;
}

/**
 * 多级缓存策略类型
 */
export enum CacheStrategy {
  /** 写回式 - 仅在缓存驱逐时更新下一级 */
  WRITE_BACK = 'write_back',
  /** 直写式 - 同时更新所有级别缓存 */
  WRITE_THROUGH = 'write_through',
  /** 写更新式 - 更新命中的缓存和下一级缓存 */
  WRITE_UPDATE = 'write_update',
}

/**
 * 缓存分片配置
 */
export interface IShardingConfig {
  /** 是否启用分片 */
  enabled: boolean;
  /** 分片数量 */
  shardCount: number;
  /** 分片策略 */
  strategy: 'hash' | 'range' | 'custom';
  /** 自定义分片函数 */
  customShardFn?: (key: string) => number;
}

/**
 * 分布式缓存节点信息
 */
export interface ICacheNode {
  /** 节点ID */
  id: string;
  /** 节点地址 */
  address: string;
  /** 权重 */
  weight: number;
  /** 是否可用 */
  available: boolean;
}

/**
 * 分布式缓存配置
 */
export interface IDistributedCacheConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 节点列表 */
  nodes: ICacheNode[];
  /** 一致性哈希环大小 */
  ringSize?: number;
  /** 虚拟节点数量 */
  virtualNodes?: number;
  /** 故障转移策略 */
  failoverStrategy?: 'next' | 'random' | 'retry';
  /** 连接超时（毫秒） */
  connectTimeout?: number;
}
