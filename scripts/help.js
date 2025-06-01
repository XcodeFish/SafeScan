#!/usr/bin/env node
/* eslint-env node */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

console.log(chalk.bold.blue('\n===== SafeScan 项目命令 =====\n'));

// 显示所有脚本
console.log(chalk.bold('可用命令:'));
Object.entries(packageJson.scripts).forEach(([name, script]) => {
  console.log(` ${chalk.green('pnpm ' + name.padEnd(15))} - ${getScriptDescription(name, script)}`);
});

console.log('\n' + chalk.bold('常用工作流:'));
console.log(` ${chalk.cyan('1.')} 开发前: ${chalk.green('pnpm prepare')} (初始化Git钩子)`);
console.log(` ${chalk.cyan('2.')} 代码修改: ${chalk.green('pnpm lint:fix')} (自动修复代码问题)`);
console.log(` ${chalk.cyan('3.')} 提交前: ${chalk.green('pnpm verify')} (验证代码质量)`);
console.log(
  ` ${chalk.cyan('4.')} 提交代码: ${chalk.green('git commit -m "type: message"')} (自动进行检查)\n`
);

console.log(chalk.bold('提交类型:'));
console.log(` ${chalk.yellow('feat')}     - 新功能`);
console.log(` ${chalk.yellow('fix')}      - 修复`);
console.log(` ${chalk.yellow('docs')}     - 文档相关`);
console.log(` ${chalk.yellow('style')}    - 代码风格（不影响功能）`);
console.log(` ${chalk.yellow('refactor')} - 重构`);
console.log(` ${chalk.yellow('perf')}     - 性能优化`);
console.log(` ${chalk.yellow('test')}     - 测试相关`);
console.log(` ${chalk.yellow('chore')}    - 构建/工具相关`);
console.log(` ${chalk.yellow('ci')}       - CI/CD相关`);
console.log(` ${chalk.yellow('revert')}   - 回滚之前的提交\n`);

// 提供脚本描述的函数
function getScriptDescription(name, script) {
  const descriptions = {
    build: '构建所有包',
    test: '运行所有测试',
    lint: '检查代码风格',
    'lint:fix': '自动修复代码风格问题',
    'type-check': '进行类型检查',
    format: '格式化代码',
    prepare: '初始化Git钩子',
    'lint-staged': '对暂存区文件进行检查',
    verify: '全面检查代码（ESLint、TypeScript、Prettier）',
    'verify:commit': '验证提交检查配置是否正常',
    help: '显示本帮助信息',
  };

  return descriptions[name] || script;
}
