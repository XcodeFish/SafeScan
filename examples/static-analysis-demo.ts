/**
 * 静态分析引擎演示脚本
 * 展示SWC解析器和规则匹配系统的使用
 */

import path from 'path';
import { parseFile } from '../packages/core/src/analyzer/static/parser';
import { RuleLoader, RuleMatcher } from '../packages/core/src/analyzer/static/rules';

// 示例代码
const EXAMPLE_REACT_CODE = `
import React, { useState, useEffect } from 'react';

function DangerousComponent() {
  const [html, setHtml] = useState('<p>初始HTML</p>');
  
  useEffect(() => {
    // 模拟从API获取HTML内容
    fetch('/api/content')
      .then(res => res.text())
      .then(data => {
        // 危险操作：直接设置HTML内容
        setHtml(data);
      });
  }, []);
  
  // 危险操作：使用dangerouslySetInnerHTML
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function UnsafeDomComponent() {
  const updateContent = () => {
    const content = document.getElementById('user-content').value;
    // 危险操作：直接使用innerHTML
    document.getElementById('output').innerHTML = content;
  };
  
  return (
    <div>
      <textarea id="user-content" />
      <button onClick={updateContent}>更新内容</button>
      <div id="output"></div>
    </div>
  );
}

export { DangerousComponent, UnsafeDomComponent };
`;

async function runDemo() {
  console.log('========== SafeScan 静态分析引擎演示 ==========');

  // 创建临时文件路径
  const tempFilePath = path.join(__dirname, 'temp-example.tsx');

  // 步骤1: 解析代码生成AST
  console.log('\n1. 使用SWC解析器解析React代码：');
  const parseResult = await parseFile(tempFilePath, {
    language: 'tsx',
    parserOptions: {
      jsx: true,
    },
  });

  if (!parseResult.success) {
    console.error(`解析失败：${parseResult.error}`);
    return;
  }

  console.log('解析成功！AST生成完成。');
  console.log(`- 文件路径: ${parseResult.filePath}`);
  console.log(`- 文件哈希: ${parseResult.hash}`);

  // 步骤2: 加载规则
  console.log('\n2. 加载安全规则：');
  const ruleLoader = new RuleLoader();

  // 加载示例规则 - 正常情况下会从目录加载
  // 这里我们手动加载一个示例规则
  try {
    const xssRule = (await import('../packages/rules/src/critical/xss-detection')).default;
    ruleLoader.addRule(xssRule);
    console.log(`成功加载规则：${xssRule.id} (${xssRule.name})`);
  } catch (error) {
    console.error('加载规则失败:', error);
  }

  // 步骤3: 运行规则匹配
  console.log('\n3. 运行规则匹配：');
  const ruleMatcher = new RuleMatcher(ruleLoader);

  // 创建规则上下文
  const ruleContext = {
    filePath: tempFilePath,
    fileContent: EXAMPLE_REACT_CODE,
  };

  // 匹配所有规则
  const results = ruleMatcher.matchAll(parseResult.ast, ruleContext);

  // 显示结果
  console.log(`检测到 ${results.length} 个潜在问题：`);
  results.forEach((result, index) => {
    console.log(`\n问题 #${index + 1}:`);
    console.log(`- 规则ID: ${result.ruleId}`);
    console.log(`- 消息: ${result.message}`);
    console.log(`- 严重程度: ${result.severity}`);
    console.log(`- 位置: 第 ${result.location.startLine} 行, 第 ${result.location.startColumn} 列`);
    if (result.codeSnippet) {
      console.log(`- 代码片段: ${result.codeSnippet}`);
    }
    if (result.fixSuggestion) {
      console.log(`- 修复建议: ${result.fixSuggestion}`);
    }
  });

  console.log('\n========== 演示结束 ==========');
}

// 运行演示
runDemo().catch((error) => {
  console.error('演示运行出错:', error);
});
