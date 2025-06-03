import { IFixTemplate } from '../types';
import { loadPatternTemplates } from './patterns';
import { loadPerformanceTemplates } from './performance';
import { loadSecurityTemplates } from './security';

/**
 * 获取所有可用的修复模板
 * @returns 修复模板列表
 */
export function getAllTemplates(): IFixTemplate[] {
  const templates: IFixTemplate[] = [
    ...loadSecurityTemplates(),
    ...loadPerformanceTemplates(),
    ...loadPatternTemplates(),
  ];

  return templates;
}

/**
 * 根据ID查找模板
 * @param id 模板ID
 * @returns 模板或undefined
 */
export function getTemplateById(id: string): IFixTemplate | undefined {
  return getAllTemplates().find((template) => template.id === id);
}

/**
 * 根据规则ID查找适用的模板
 * @param ruleId 规则ID
 * @returns 模板列表
 */
export function getTemplatesByRuleId(ruleId: string): IFixTemplate[] {
  return getAllTemplates().filter((template) => template.supportedRules.includes(ruleId));
}
