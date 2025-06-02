/**
 * 引用链溯源系统使用示例
 */
import * as fs from 'fs';
import * as path from 'path';
import { Framework } from '../../../types';
import { analyzeMemoryLeak, exportReferenceChains } from '../memory-leak-analyzer';

/**
 * 示例：检测React组件内存泄漏并生成引用链
 */
async function detectReactComponentLeakAndTrace() {
  console.log('开始检测React组件内存泄漏...');

  // 设置分析配置
  const config = {
    framework: Framework.REACT,
    componentName: 'ExampleComponent',
    autoSnapshot: true,
    generateReport: true,
    reportPath: path.join(__dirname, '../../../reports/memory-leak-report.html'),
  };

  try {
    // 分析内存泄漏
    const result = await analyzeMemoryLeak(config);

    // 检查是否检测到泄漏
    if (result.leakDetectionResult.hasLeak) {
      console.log(`检测到 ${result.leakDetectionResult.leaks.length} 个内存泄漏`);

      // 打印泄漏对象信息
      result.leakDetectionResult.leaks.forEach((leak, index) => {
        console.log(`\n泄漏 #${index + 1}:`);
        console.log(`- 类型: ${leak.pattern}`);
        console.log(`- 严重程度: ${leak.severity}`);
        console.log(`- 大小: ${formatBytes(leak.size)}`);
        console.log(`- 描述: ${leak.description}`);
        if (leak.fixSuggestion) {
          console.log(`- 修复建议: ${leak.fixSuggestion}`);
        }
      });

      // 检查是否生成了引用链
      if (result.referenceChains.length > 0) {
        console.log(`\n生成了 ${result.referenceChains.length} 条引用链`);

        // 导出引用链为JSON
        const chainsJson = exportReferenceChains(result.referenceChains);
        const jsonPath = path.join(__dirname, '../../../reports/reference-chains.json');

        // 确保目录存在
        const dir = path.dirname(jsonPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // 写入文件
        fs.writeFileSync(jsonPath, chainsJson);
        console.log(`引用链JSON已保存到: ${jsonPath}`);

        // 打印报告路径
        if (result.reportPath) {
          console.log(`HTML报告已生成: ${result.reportPath}`);
        }
      } else {
        console.log('未生成引用链');
      }
    } else {
      console.log('未检测到内存泄漏');
    }
  } catch (error) {
    console.error('内存泄漏检测失败:', error);
  }
}

/**
 * 格式化字节数
 * @param bytes 字节数
 * @returns 格式化字符串
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * 示例：模拟React组件泄漏场景
 * 注意：这只是一个示例，实际使用时需要在真实的React应用中运行
 */
function createLeakingReactComponentExample() {
  console.log('创建泄漏的React组件示例...');

  // 模拟全局对象
  const global: any = {};

  // 模拟React组件实例
  class ExampleComponent {
    private listeners: any[] = [];
    private intervalId: any = null;
    private data: any[] = [];

    constructor() {
      console.log('组件挂载');

      // 创建定时器但不清除 - 泄漏#1
      this.intervalId = setInterval(() => {
        this.data.push(new Array(1000).fill('leak data'));
      }, 1000);

      // 添加事件监听器但不移除 - 泄漏#2
      document.addEventListener('click', this.handleClick);
      this.listeners.push('click');

      // 将组件实例存储在全局对象中 - 泄漏#3
      global.leakedComponent = this;
    }

    handleClick = () => {
      console.log('点击事件');
      this.data.push(new Array(1000));
    };

    unmount() {
      console.log('组件卸载');
      // 忘记清除定时器和移除事件监听器
      // 忘记从全局对象中移除引用
    }
  }

  // 创建组件实例
  const component = new ExampleComponent();

  // 模拟卸载组件
  setTimeout(() => {
    component.unmount();
    console.log('组件已卸载，但仍然存在内存泄漏');
  }, 3000);
}

// 执行示例
async function runExample() {
  // 首先创建泄漏组件
  createLeakingReactComponentExample();

  // 等待一段时间再检测泄漏
  setTimeout(async () => {
    await detectReactComponentLeakAndTrace();
  }, 5000);
}

// 如果直接运行此文件，执行示例
if (require.main === module) {
  runExample().catch(console.error);
}

// 导出示例函数供其他模块使用
export { detectReactComponentLeakAndTrace, createLeakingReactComponentExample };
