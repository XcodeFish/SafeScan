#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */

/**
 * SafeScan CLI 入口文件
 */

// 从编译后的代码导入运行函数
const { run } = require('../dist/cli');

// 执行CLI
run()
  .then(() => {
    // 成功完成，无需操作
  })
  .catch((error) => {
    console.error('SafeScan 遇到意外错误:', error);
    process.exit(1);
  });
