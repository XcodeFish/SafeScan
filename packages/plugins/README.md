# SafeScan 构建工具插件

SafeScan构建工具插件集合，用于将SafeScan前端安全工具集成到不同的构建工具中。

## 安装

```bash
# 使用npm
npm install @safescan/plugins --save-dev

# 使用pnpm
pnpm add -D @safescan/plugins

# 使用yarn
yarn add -D @safescan/plugins
```

## Vite插件

### 功能特性

- **HMR集成** - 在开发过程中实时更新SafeScan检测结果
- **浏览器覆盖通知** - 在浏览器中显示安全问题通知
- **运行时注入** - 自动注入SafeScan运行时代码到项目中

### 基本使用

```js
// vite.config.js
import { defineConfig } from 'vite';
import { safeScanVitePlugin } from '@safescan/plugins';

export default defineConfig({
  plugins: [safeScanVitePlugin()],
});
```

### 配置选项

```js
// vite.config.js
import { defineConfig } from 'vite';
import { safeScanVitePlugin } from '@safescan/plugins';

export default defineConfig({
  plugins: [
    safeScanVitePlugin({
      // HMR配置
      hmr: {
        enabled: true,
        include: ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte'],
        exclude: [],
      },

      // 浏览器覆盖通知配置
      overlay: {
        enabled: true,
        duration: 3000, // 通知显示时长，毫秒
        position: 'top-right', // 可选: 'top-right', 'top-left', 'bottom-right', 'bottom-left'
      },

      // 运行时注入配置
      runtime: {
        enabled: true,
        include: ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte'],
        exclude: ['node_modules'],
        config: {
          // 传递给SafeScan运行时的配置
          id: 'vite-app',
          enabled: true,
          priority: 1,
        },
      },
    }),
  ],
});
```

## 虚拟模块API

SafeScan Vite插件提供了一个虚拟模块，可以在项目中导入使用：

```js
// 在项目中导入虚拟模块
import {
  VERSION,
  runtime,
  notify,
  triggerRuntimeEvent,
  onRuntimeEvent,
} from 'virtual:safescan-runtime';

// 查看当前版本
console.log('SafeScan版本:', VERSION);

// 使用通知API
notify.show({
  id: 'custom-notice-1',
  level: 'info',
  title: '自定义通知',
  message: '这是一条来自应用代码的通知',
});

// 触发运行时事件
triggerRuntimeEvent('custom-event', { data: 'test' });

// 监听运行时事件
const cleanup = onRuntimeEvent('custom-event', (data) => {
  console.log('收到自定义事件:', data);
});

// 清理事件监听
cleanup();
```

## 浏览器通知API

一旦插件启用，以下全局API将在浏览器中可用：

```js
// 显示通知
window.__SAFESCAN_NOTIFY__.show({
  id: 'unique-id', // 通知唯一ID
  level: 'error', // 级别: error, warning, info, success
  title: '安全警告', // 通知标题
  message: '发现XSS风险', // 通知内容
  file: 'src/App.vue', // 相关文件（可选）
  line: 42, // 行号（可选）
  column: 10, // 列号（可选）
});

// 移除特定通知
window.__SAFESCAN_NOTIFY__.remove('unique-id');

// 清除所有通知
window.__SAFESCAN_NOTIFY__.clear();
```

## 运行时API

```js
// 获取运行时配置
const config = window.__SAFESCAN_RUNTIME__.config;

// 发送运行时事件
window.__SAFESCAN_RUNTIME__
  .sendRuntimeEvent(
    'custom-event', // 事件类型
    { foo: 'bar' }, // 事件数据
    { broadcast: true } // 选项
  )
  .then((response) => {
    console.log('事件处理结果:', response);
  });

// 在运行时初始化完成后执行回调
window.__SAFESCAN_RUNTIME__.onInit((runtime) => {
  console.log('SafeScan运行时已初始化:', runtime);
});
```

## 许可证

MIT
