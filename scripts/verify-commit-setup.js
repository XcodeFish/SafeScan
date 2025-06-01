#!/usr/bin/env node
/* eslint-env node */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('👉 验证 Git 钩子设置...');

// 检查 .husky 目录是否存在
const huskyDir = path.join(__dirname, '..', '.husky');
if (!fs.existsSync(huskyDir)) {
  console.error('❌ .husky 目录不存在。请运行 pnpm prepare 初始化 Husky。');
  process.exit(1);
}

// 检查 pre-commit 钩子
const preCommitPath = path.join(huskyDir, 'pre-commit');
if (!fs.existsSync(preCommitPath)) {
  console.error('❌ pre-commit 钩子不存在。请运行 pnpm prepare 初始化 Husky。');
  process.exit(1);
}

// 检查 commit-msg 钩子
const commitMsgPath = path.join(huskyDir, 'commit-msg');
if (!fs.existsSync(commitMsgPath)) {
  console.error('❌ commit-msg 钩子不存在。请运行 pnpm prepare 初始化 Husky。');
  process.exit(1);
}

// 检查 lint-staged 配置
const lintStagedPath = path.join(__dirname, '..', '.lintstagedrc.js');
if (!fs.existsSync(lintStagedPath)) {
  console.error('❌ .lintstagedrc.js 不存在。');
  process.exit(1);
}

// 检查 commitlint 配置
const commitlintPath = path.join(__dirname, '..', 'commitlint.config.cjs');
if (!fs.existsSync(commitlintPath)) {
  console.error('❌ commitlint.config.cjs 不存在。');
  process.exit(1);
}

// 模拟执行 lint-staged
try {
  console.log('👉 模拟执行 lint-staged...');
  execSync('pnpm lint-staged --no-stash --quiet', {
    stdio: 'inherit',
    encoding: 'utf-8',
  });
  console.log('✅ lint-staged 执行成功');
} catch (err) {
  console.error('❌ lint-staged 执行失败');
  process.exit(1);
}

console.log('✅ 所有 Git 钩子设置正常！');
console.log('');
console.log('提交代码时会自动执行以下检查：');
console.log('1. ESLint 代码检查');
console.log('2. Prettier 代码格式化');
console.log('3. TypeScript 类型检查');
console.log('4. Commitlint 提交信息检查');
console.log('');
console.log('👍 祝您编码愉快！');
