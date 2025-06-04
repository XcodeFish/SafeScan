# SafeScan VSCode扩展

VSCode扩展集成，提供实时前端安全检测功能，包含实时代码分析、内联问题提示和自动修复建议。

## 功能特性

### 实时代码分析

- 在编写代码时自动检测安全风险
- 支持JavaScript、TypeScript、React、Vue等前端技术栈
- 低CPU占用的增量分析

### 内联问题提示

- 直接在编辑器中展示问题
- 清晰的问题分类和严重级别标记
- 详细的问题描述和修复指南

### 自动修复建议

- 一键修复常见安全问题
- 智能代码修复建议
- 修复预览与对比

## 命令

- `SafeScan: 扫描当前文件` - 分析当前打开的文件
- `SafeScan: 扫描整个工作区` - 扫描整个项目
- `SafeScan: 显示问题面板` - 打开问题详情面板

## 设置

扩展提供以下设置：

- `safescan.enableRealTimeAnalysis`: 是否启用实时代码分析
- `safescan.severityLevel`: 显示问题的最低严重性级别

## 支持的语言

- JavaScript
- TypeScript
- JSX/TSX (React)
- Vue

## 安装

### 从VSIX安装

1. 下载最新的VSIX文件
2. 在VSCode中选择"从VSIX安装..."
3. 选择下载的文件并安装

### 从源码构建

1. 克隆仓库
2. 运行 `pnpm install`
3. 运行 `pnpm build`
4. 使用VSCode的Debug功能启动扩展

## 如何使用

1. 打开一个前端项目
2. 使用命令面板运行 `SafeScan: 扫描整个工作区`
3. 查看问题列表，查看具体安全问题
4. 使用自动修复功能解决问题

## 建议和反馈

如有任何问题或建议，请提交Issue或PR。

## 许可证

MIT
