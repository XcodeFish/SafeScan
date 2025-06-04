# SafeScan Webpack插件

SafeScan Webpack插件提供了一套全面的前端安全扫描和性能监控工具，集成到Webpack构建流程中。

## 功能特点

- **生产构建检查**：在构建过程中自动检测潜在的安全问题
- **包大小监控**：分析并监控构建包大小，提供历史对比
- **可视化报告生成**：生成交互式HTML报告，展示安全和性能指标

## 安装

```bash
npm install --save-dev @safescan/plugins
```

或者使用pnpm:

```bash
pnpm add -D @safescan/plugins
```

## 基本用法

```javascript
// webpack.config.js
const SafeScanWebpackPlugin = require('@safescan/plugins').webpack;

module.exports = {
  // ... 其他webpack配置
  plugins: [new SafeScanWebpackPlugin()],
};
```

## 配置选项

```javascript
new SafeScanWebpackPlugin({
  // 是否启用生产构建检查
  productionCheck: true,

  // 是否启用包大小监控
  bundleSizeMonitor: true,

  // 是否生成可视化报告
  visualReport: true,

  // 报告输出路径
  reportOutputPath: 'safescan-report.html',

  // 包大小警告阈值(字节)，默认250KB
  sizeLimit: 250 * 1024,

  // 规则配置
  rules: {
    // 忽略的规则ID
    ignoreRules: ['SAFESCAN-XSS-001'],

    // 自定义规则严重级别
    customSeverity: {
      'SAFESCAN-EVAL-001': 'error',
    },
  },

  // 报告生成选项
  reportOptions: {
    // 是否自动打开报告
    openReport: true,

    // 报告标题
    title: '项目安全报告',

    // 展示趋势历史数量
    historyCount: 5,
  },
});
```

## 生产构建检查

该功能会在生产环境构建过程中检查潜在的安全问题，包括：

- XSS漏洞检测
- 不安全API使用（如eval）
- 危险依赖检测
- 内存泄漏模式识别

当发现严重安全问题时，插件可以中断构建过程或生成警告。

### 环境变量

- `SAFESCAN_FAIL_ON_CRITICAL=true`：发现严重问题时终止构建
- `SAFESCAN_IGNORE_ERRORS=true`：忽略所有错误并继续构建
- `SAFESCAN_LOG_LEVEL=debug|info|warn|error`：设置日志级别

## 包大小监控

包大小监控功能会分析构建产物的大小，提供以下功能：

- 跟踪文件大小变化
- 计算Gzip压缩后大小
- 识别超过大小限制的文件
- 提供优化建议

## 可视化报告

插件会生成一个交互式HTML报告，包含：

- 安全问题概览
- 包大小分析
- 历史趋势图表
- 优化建议

## 最佳实践

- 在开发环境中使用默认配置进行快速反馈
- 在CI/CD流程中设置`SAFESCAN_FAIL_ON_CRITICAL=true`确保安全性
- 定期审查生成的报告，跟踪安全和性能趋势

## 兼容性

- Webpack 5.x
- Node.js 14.x 及以上版本

## 许可证

MIT
