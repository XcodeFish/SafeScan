/**
 * SafeScan Vite插件类型定义
 */
import type { IModuleConfig } from '@safescan/core';
import type { ModuleNode } from 'vite';

/**
 * 通知级别
 */
export enum NotifyLevel {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
  SUCCESS = 'success',
}

/**
 * 通知消息接口
 */
export interface NotifyMessage {
  id: string;
  level: NotifyLevel;
  title: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  source?: string;
}

/**
 * HMR注入选项
 */
export interface HMROptions {
  /**
   * 是否启用HMR集成
   * @default true
   */
  enabled: boolean;

  /**
   * 自定义HMR处理文件类型
   * @default ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte']
   */
  include: string[];

  /**
   * 排除HMR处理的文件类型
   * @default []
   */
  exclude: string[];
}

/**
 * 浏览器覆盖通知选项
 */
export interface OverlayOptions {
  /**
   * 是否启用浏览器覆盖通知
   * @default true
   */
  enabled: boolean;

  /**
   * 通知显示持续时间(毫秒)，0表示不自动关闭
   * @default 3000
   */
  duration: number;

  /**
   * 通知位置
   * @default 'top-right'
   */
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
}

/**
 * 运行时注入选项
 */
export interface RuntimeOptions {
  /**
   * 是否启用运行时注入
   * @default true
   */
  enabled: boolean;

  /**
   * 自定义运行时注入配置
   */
  config?: Partial<IModuleConfig>;

  /**
   * 运行时注入目标文件
   * @default ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte']
   */
  include: string[];

  /**
   * 排除运行时注入的文件
   * @default ['node_modules']
   */
  exclude: string[];
}

/**
 * SafeScan Vite插件配置选项
 */
export interface SafeScanVitePluginOptions {
  /**
   * HMR集成选项
   */
  hmr?: Partial<HMROptions>;

  /**
   * 浏览器覆盖通知选项
   */
  overlay?: Partial<OverlayOptions>;

  /**
   * 运行时注入选项
   */
  runtime?: Partial<RuntimeOptions>;
}

/**
 * 更新模块信息类型
 */
export interface UpdateModuleInfo {
  module: ModuleNode;
  file: string;
  timestamp: number;
  isEntry: boolean;
  isSafeScanModule: boolean;
}
