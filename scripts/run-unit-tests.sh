#!/bin/bash

# 设置错误时退出
set -e

# 显示测试标题
echo "==============================================="
echo "  SafeScan 静态分析引擎单元测试  "
echo "==============================================="

# 清理测试缓存
echo "清理测试缓存..."
rm -rf .vitest/

# 运行静态分析引擎测试
echo "运行静态分析引擎测试..."
pnpm test:unit tests/unit/analyzer/static

# 运行规则测试
echo "运行安全规则测试..."
pnpm test:unit tests/unit/rules

# 生成覆盖率报告
echo "生成测试覆盖率报告..."
pnpm test:coverage tests/unit/analyzer/static tests/unit/rules

# 检查测试是否成功
if [ $? -eq 0 ]; then
    echo "✅ 所有测试通过！"
    echo "查看覆盖率报告: coverage/index.html"
else
    echo "❌ 测试失败"
    exit 1
fi

# 显示测试完成信息
echo "==============================================="
echo "  测试完成  "
echo "===============================================" 