/**
 * 规则匹配器 - 将规则与AST进行匹配
 */
import type { Node } from '@swc/core';
import type { TParseResult, IRule } from '../../types';
import type { Rule, Issue, RuleContext, CodeRange } from '../../types/rule';
import { RuleScheduler } from './rule-scheduler';
import { IRuleSchedulerConfig } from './rules-config';

// 定义SWC节点的扩展类型，包含span属性
interface SWCNode extends Record<string, unknown> {
  type?: string;
  span?: {
    start: number;
    end: number;
    ctxt?: number;
  };
}

/**
 * 获取节点的源代码位置
 * @param node AST节点
 * @param fileContent 文件内容
 * @param filePath 文件路径
 * @returns 代码位置范围
 */
function getNodeLocation(node: SWCNode, fileContent: string, filePath: string): CodeRange {
  // SWC节点都有span属性表示源码位置
  if (!node.span) {
    return {
      start: { line: 1, column: 0, filePath },
      end: { line: 1, column: 0, filePath },
    };
  }

  const lines = fileContent.slice(0, node.span.start).split('\n');
  const startLine = lines.length;
  const startColumn = lines[lines.length - 1].length;

  const endLines = fileContent.slice(0, node.span.end).split('\n');
  const endLine = endLines.length;
  const endColumn = endLines[endLines.length - 1].length;

  return {
    start: {
      line: startLine,
      column: startColumn,
      filePath,
    },
    end: {
      line: endLine,
      column: endColumn,
      filePath,
    },
  };
}

/**
 * 获取节点的源代码文本
 * @param node AST节点
 * @param fileContent 文件内容
 * @returns 节点对应的源代码
 */
function getNodeText(node: SWCNode, fileContent: string): string {
  if (!node.span) {
    return '';
  }
  return fileContent.slice(node.span.start, node.span.end);
}

/**
 * 创建规则上下文
 * @param parseResult 解析结果
 * @returns 规则上下文
 */
function createRuleContext(parseResult: TParseResult): RuleContext {
  if (!parseResult.success || !parseResult.ast) {
    throw new Error('无法创建规则上下文：解析结果无效');
  }

  // 获取源代码
  let fileContent = '';
  if (parseResult.sourceCode) {
    fileContent = parseResult.sourceCode;
  } else {
    console.warn('无法获取源代码内容，将使用空字符串');
  }

  const filePath = parseResult.filePath || 'unknown';
  const ast = parseResult.ast;

  return {
    filePath,
    fileContent,
    ast,
    getNodeLocation: (node: Node) => getNodeLocation(node as SWCNode, fileContent, filePath),
    getNodeText: (node: Node) => getNodeText(node as SWCNode, fileContent),
  };
}

/**
 * 遍历AST节点 (替代SWC的traverse函数)
 * @param node AST节点
 * @param visitor 访问回调
 */
function traverseAST(node: SWCNode, visitor: { enter: (node: SWCNode) => void }) {
  if (!node || typeof node !== 'object') return;

  // 调用访问者函数
  visitor.enter(node);

  // 递归遍历子节点
  Object.keys(node).forEach((key) => {
    const child = node[key];
    if (key === 'span' || key === 'loc' || key === 'range') {
      // 跳过位置信息
      return;
    }

    if (Array.isArray(child)) {
      // 遍历数组中的每个节点
      child.forEach((item) => {
        if (item && typeof item === 'object') {
          traverseAST(item as SWCNode, visitor);
        }
      });
    } else if (child && typeof child === 'object') {
      // 遍历子对象
      traverseAST(child as SWCNode, visitor);
    }
  });
}

/**
 * 匹配规则 (传统方式)
 * @param parseResult 解析结果
 * @param rules 规则数组
 * @returns 检测到的问题数组
 */
export async function matchRules(parseResult: TParseResult, rules: Rule[]): Promise<Issue[]> {
  if (!parseResult.success || !parseResult.ast) {
    console.warn('无法匹配规则：解析结果无效');
    return [];
  }

  const context = createRuleContext(parseResult);
  const issues: Issue[] = [];

  // 调试信息
  console.log(`开始匹配规则，文件: ${parseResult.filePath}`);
  console.log(`加载了 ${rules.length} 条规则`);

  // 遍历AST
  traverseAST(parseResult.ast as SWCNode, {
    enter(node: SWCNode) {
      // 输出节点类型用于调试
      if (
        (node.type && node.type === 'JSXAttribute') ||
        node.type === 'CallExpression' ||
        node.type === 'BinaryExpression'
      ) {
        console.log(`节点类型: ${node.type}`, node);
      }

      // 对每个节点应用所有规则
      for (const rule of rules) {
        try {
          const ruleIssues = rule.matcher(node as unknown as Node, context);

          if (ruleIssues) {
            // 处理单个问题或问题数组
            const issuesArray = Array.isArray(ruleIssues) ? ruleIssues : [ruleIssues];
            console.log(`规则 ${rule.id} 匹配成功，发现 ${issuesArray.length} 个问题`);

            // 添加到问题列表
            issues.push(...issuesArray);
          }
        } catch (error) {
          console.error(`规则 ${rule.id} 执行失败:`, error);
        }
      }
    },
  });

  console.log(`规则匹配完成，共发现 ${issues.length} 个问题`);
  return issues;
}

/**
 * 使用调度器匹配规则 (优先级调度方式)
 * @param parseResult 解析结果
 * @param rules 规则数组
 * @param schedulerConfig 调度器配置
 * @returns 检测到的问题数组
 */
export async function matchRulesWithScheduler(
  parseResult: TParseResult,
  rules: IRule[],
  schedulerConfig?: IRuleSchedulerConfig
): Promise<Issue[]> {
  if (!parseResult.success || !parseResult.ast) {
    console.warn('无法匹配规则：解析结果无效');
    return [];
  }

  const context = createRuleContext(parseResult);
  const scheduler = new RuleScheduler(schedulerConfig);
  const issues: Issue[] = [];

  // 调试信息
  console.log(`开始优先级调度匹配规则，文件: ${parseResult.filePath}`);
  console.log(`加载了 ${rules.length} 条规则`);

  // 为每个规则创建任务
  for (const rule of rules) {
    scheduler.scheduleRule(rule, parseResult.ast, context);
  }

  // 执行所有规则
  const results = await scheduler.executeRules();

  // 汇总检测结果
  for (const result of results) {
    if (result.results && result.results.length > 0) {
      // 将 TRuleResult 转换为 Issue 类型
      const convertedIssues = result.results.map((r) => {
        // 创建Issue类型对象，满足类型要求
        const issue: Issue = {
          ...r,
          category: 'security', // 添加必需的category属性
        };
        return issue;
      });

      issues.push(...convertedIssues);
      console.log(
        `规则 ${result.ruleId} 匹配成功，发现 ${result.results.length} 个问题，执行耗时: ${result.executionTimeMs}ms`
      );
    }
  }

  console.log(`规则匹配完成，共发现 ${issues.length} 个问题`);
  return issues;
}
