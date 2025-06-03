/**
 * SafeScan自动修复系统
 * 提供代码问题自动修复、修复建议生成和代码转换功能
 */

import { FixEngine, fixEngine } from './engine';
import { generateSuggestion } from './suggestion';
import { getAllTemplates, getTemplateById, getTemplatesByRuleId } from './templates';
import { transformCode, applyTextTransformations, ITransformation } from './transformer';
import {
  IFixContext,
  IFixResult,
  IFixTemplate,
  IIssue,
  ISourceLocation,
  IValidationResult,
  IFixSuggestion,
} from './types';
import { validateFix } from './validator';

// 导出所有模块
export {
  // 核心引擎
  FixEngine,
  fixEngine,

  // 工具函数
  validateFix,
  generateSuggestion,
  transformCode,
  applyTextTransformations,

  // 模板管理
  getAllTemplates,
  getTemplateById,
  getTemplatesByRuleId,

  // 类型定义
  IFixContext,
  IFixResult,
  IFixTemplate,
  IIssue,
  ISourceLocation,
  IValidationResult,
  IFixSuggestion,
  ITransformation,
};

// 默认导出修复引擎实例
export default fixEngine;
