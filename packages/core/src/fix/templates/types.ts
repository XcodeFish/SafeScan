/**
 * 修复模板类型定义
 */
import type { FixOperationType } from '../engine';

/**
 * 修复模板接口
 */
export interface IFixTemplate {
  /**
   * 模板唯一ID
   */
  id: string;

  /**
   * 模板名称
   */
  name: string;

  /**
   * 模板描述
   */
  description: string;

  /**
   * 适用的规则ID列表
   */
  ruleIds: string[];

  /**
   * 模板置信度(0-100)
   */
  confidence: number;

  /**
   * 检测函数，确定模板是否适用于当前代码
   * @param code 源代码
   * @returns 是否适用
   */
  detect: (code: string) => boolean;

  /**
   * 转换函数，将问题代码转换为修复后的代码
   * @param code 源代码
   * @returns 修复后的代码
   */
  transform: (code: string) => string;

  /**
   * 操作生成函数，生成修复操作列表
   * @param code 源代码
   * @returns 修复操作列表
   */
  operations: (code: string) => Array<{
    type: FixOperationType;
    start: number;
    end: number;
    content?: string;
    description: string;
  }>;
}

/**
 * 模板注册表接口
 */
export interface ITemplateRegistry {
  /**
   * 获取所有模板
   */
  getAllTemplates(): IFixTemplate[];

  /**
   * 根据ID获取模板
   * @param id 模板ID
   */
  getTemplateById(id: string): IFixTemplate | undefined;

  /**
   * 根据规则ID获取适用模板
   * @param ruleId 规则ID
   */
  getTemplatesForRule(ruleId: string): IFixTemplate[];

  /**
   * 注册模板
   * @param template 模板对象
   */
  registerTemplate(template: IFixTemplate): void;

  /**
   * 移除模板
   * @param id 模板ID
   */
  removeTemplate(id: string): boolean;
}
