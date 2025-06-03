import * as swc from '@swc/core';
import { IIssue, IValidationResult } from './types';

/**
 * 验证修复结果
 * @param params 验证参数
 * @returns 验证结果
 */
export async function validateFix(params: {
  originalCode: string;
  fixedCode: string;
  filePath: string;
  issue: IIssue;
}): Promise<IValidationResult> {
  const { originalCode, fixedCode, filePath, issue } = params;
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // 1. 语法验证
    const syntaxValid = await validateSyntax(fixedCode, filePath);
    if (!syntaxValid.valid) {
      errors.push(...syntaxValid.errors);
      return {
        valid: false,
        errors,
        warnings,
      };
    }

    // 2. 问题解决验证
    const issueFixed = await validateIssueFixed(originalCode, fixedCode, issue);
    if (!issueFixed.valid) {
      errors.push(...issueFixed.errors);
    }

    // 3. 性能影响评估
    const performanceImpact = await estimatePerformanceImpact(originalCode, fixedCode);

    // 4. 副作用检测
    const sideEffects = await detectSideEffects(originalCode, fixedCode);
    if (sideEffects.length > 0) {
      warnings.push(...sideEffects);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      performanceImpact,
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`验证过程失败: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

/**
 * 验证代码语法是否正确
 * @param code 代码
 * @param filePath 文件路径
 * @returns 验证结果
 */
async function validateSyntax(
  code: string,
  filePath: string
): Promise<{ valid: boolean; errors: string[] }> {
  try {
    // 使用SWC解析代码,检查语法
    const syntax =
      filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
        ? 'typescript'
        : filePath.endsWith('.ts')
          ? 'typescript'
          : 'ecmascript';

    const tsx = filePath.endsWith('.tsx');
    const jsx = filePath.endsWith('.jsx');

    await swc.parse(code, {
      syntax,
      tsx,
      jsx,
      target: 'es2022',
    });

    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [`语法错误: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

/**
 * 验证问题是否已修复
 * @param originalCode 原始代码
 * @param fixedCode 修复后代码
 * @param issue 问题
 * @returns 验证结果
 */
async function validateIssueFixed(
  originalCode: string,
  fixedCode: string,
  _issue: IIssue
): Promise<{ valid: boolean; errors: string[] }> {
  // 此处应该调用原始规则验证器重新检查问题
  // 实际实现需要与规则系统集成

  // 简单实现:检查修复后代码是否发生变化
  if (originalCode === fixedCode) {
    return {
      valid: false,
      errors: ['代码未发生变化,问题可能未修复'],
    };
  }

  // TODO: 集成规则系统重新验证问题是否解决

  return { valid: true, errors: [] };
}

/**
 * 评估性能影响
 * @param originalCode 原始代码
 * @param fixedCode 修复后代码
 * @returns 性能影响评分(0-10,越低越好)
 */
async function estimatePerformanceImpact(originalCode: string, fixedCode: string): Promise<number> {
  // 计算代码长度差异
  const sizeDiff = Math.abs(fixedCode.length - originalCode.length) / originalCode.length;

  // 计算代码复杂度变化
  // 这里使用简单启发式方法:检查循环、条件、回调等结构的变化
  const loopsRegex = /(for|while|do\s+while|forEach|map|reduce|filter)\s*\(/g;
  const conditionsRegex = /(if|switch|[?])\s*\(/g;
  const callbacksRegex = /=>\s*{|\bfunction\s*\(/g;

  const originalComplexity =
    (originalCode.match(loopsRegex)?.length || 0) +
    (originalCode.match(conditionsRegex)?.length || 0) * 0.5 +
    (originalCode.match(callbacksRegex)?.length || 0) * 0.3;

  const fixedComplexity =
    (fixedCode.match(loopsRegex)?.length || 0) +
    (fixedCode.match(conditionsRegex)?.length || 0) * 0.5 +
    (fixedCode.match(callbacksRegex)?.length || 0) * 0.3;

  const complexityDiff =
    Math.max(0, fixedComplexity - originalComplexity) / Math.max(1, originalComplexity);

  // 结合大小和复杂度变化计算性能影响
  const impactScore = Math.min(10, Math.round((sizeDiff * 3 + complexityDiff * 7) * 10));

  return impactScore;
}

/**
 * 检测潜在副作用
 * @param originalCode 原始代码
 * @param fixedCode 修复后代码
 * @returns 副作用警告列表
 */
async function detectSideEffects(originalCode: string, fixedCode: string): Promise<string[]> {
  const warnings: string[] = [];

  // 检测API调用变化
  const apiCallsRegex = /\b(\w+)\s*\.\s*(\w+)\s*\(/g;
  const originalApiCalls = [...originalCode.matchAll(apiCallsRegex)].map((m) => `${m[1]}.${m[2]}`);
  const fixedApiCalls = [...fixedCode.matchAll(apiCallsRegex)].map((m) => `${m[1]}.${m[2]}`);

  // 查找移除的API调用
  const removedCalls = originalApiCalls.filter((call) => !fixedApiCalls.includes(call));
  if (removedCalls.length > 0) {
    warnings.push(`移除了API调用: ${[...new Set(removedCalls)].join(', ')}`);
  }

  // 检测变量作用域变化
  const varsRegex = /\b(const|let|var)\s+(\w+)\s*=/g;
  const originalVars = [...originalCode.matchAll(varsRegex)].map((m) => m[2]);
  const fixedVars = [...fixedCode.matchAll(varsRegex)].map((m) => m[2]);

  // 查找移除的变量
  const removedVars = originalVars.filter((v) => !fixedVars.includes(v));
  if (removedVars.length > 0) {
    warnings.push(`移除了变量: ${[...new Set(removedVars)].join(', ')}`);
  }

  return warnings;
}
