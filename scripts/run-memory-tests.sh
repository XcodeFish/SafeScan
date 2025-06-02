#!/bin/bash
# 运行内存追踪引擎集成测试的脚本

# 定义颜色
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}开始运行内存追踪引擎集成测试...${NC}"

# 确保在项目根目录运行
if [ ! -d "packages/core" ] || [ ! -d "tests/integration" ]; then
  echo -e "${RED}错误: 请在项目根目录中运行此脚本${NC}"
  exit 1
fi

# 创建报告目录
REPORT_DIR="test-reports/memory-analyzer"
mkdir -p $REPORT_DIR

echo -e "${YELLOW}1. 运行引用链溯源系统测试${NC}"
pnpm vitest run tests/integration/reference-chain.test.ts --reporter=verbose

echo -e "${YELLOW}2. 运行泄漏模式识别系统测试${NC}"
pnpm vitest run tests/integration/leak-pattern.test.ts --reporter=verbose

echo -e "${YELLOW}3. 运行内存泄漏检测综合测试${NC}"
pnpm vitest run tests/integration/memory-analyzer.test.ts --reporter=verbose

echo -e "${YELLOW}4. 生成测试覆盖率报告${NC}"
pnpm vitest run --coverage tests/integration/reference-chain.test.ts tests/integration/leak-pattern.test.ts tests/integration/memory-analyzer.test.ts

# 检查测试结果
if [ $? -eq 0 ]; then
  echo -e "${GREEN}内存追踪引擎集成测试全部通过!${NC}"
  echo -e "${GREEN}测试覆盖率报告已生成在 coverage/ 目录${NC}"
else
  echo -e "${RED}内存追踪引擎集成测试存在失败!${NC}"
  echo -e "${YELLOW}请检查测试报告获取详细信息${NC}"
  exit 1
fi 