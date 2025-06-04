/**
 * 包大小监控
 * 监控构建包大小并提供历史对比
 */

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
// 使用require代替import以解决类型问题
import type { Stats } from 'webpack';
import { SafeScanWebpackPluginOptions, BundleSizeInfo } from './types';
import { getLogger } from './utils/logger';

// 包大小历史记录文件名
const SIZE_HISTORY_FILE = '.safescan-size-history.json';

/**
 * 监控包大小
 * @param stats Webpack统计数据
 * @param options 插件选项
 * @returns 包大小信息数组
 */
export function monitorBundleSize(
  stats: Stats,
  options: SafeScanWebpackPluginOptions
): BundleSizeInfo[] {
  const logger = getLogger('SafeScan:BundleSizeMonitor');
  logger.info('开始分析构建包大小...');

  try {
    // 获取统计数据JSON
    const statsJson = stats.toJson({
      assets: true,
      chunks: true,
      modules: false,
      children: false,
    });

    // 获取资源列表
    const assets = statsJson.assets || [];
    const outputPath = stats.compilation.outputOptions.path || '';

    // 分析包大小
    const bundleSizes: BundleSizeInfo[] = [];
    const sizeLimit = options.sizeLimit;

    // 获取历史记录
    const history = loadSizeHistory(outputPath);

    // 统计JS和CSS资源
    const jsAndCssAssets = assets.filter(
      (asset: any) => /\.(js|css)$/.test(asset.name) && !asset.name.includes('.map')
    );

    // 计算总体积
    let totalSize = 0;
    let totalGzipSize = 0;

    for (const asset of jsAndCssAssets) {
      const assetPath = path.join(outputPath, asset.name);
      const size = asset.size;
      totalSize += size;

      // 计算Gzip大小
      let gzipSize: number | undefined;
      try {
        const content = fs.readFileSync(assetPath);
        gzipSize = zlib.gzipSync(content).length;
        totalGzipSize += gzipSize;
      } catch (error) {
        logger.warn(`无法计算${asset.name}的Gzip大小: ${(error as Error).message}`);
      }

      // 与历史记录比较
      const previousSize = history[asset.name]?.size;
      let changePercentage: number | undefined;

      if (previousSize) {
        changePercentage = ((size - previousSize) / previousSize) * 100;
      }

      // 判断是否超过阈值
      const isOverSizeLimit = size > sizeLimit;

      // 添加到结果列表
      bundleSizes.push({
        name: asset.name,
        size,
        gzipSize,
        isOverSizeLimit,
        changePercentage,
        path: assetPath,
      });

      // 更新历史记录
      history[asset.name] = {
        size,
        gzipSize,
        lastUpdated: new Date().toISOString(),
      };
    }

    // 保存历史记录
    saveSizeHistory(outputPath, history);

    // 输出分析结果
    logger.info('包大小分析完成:');
    logger.info(`总构建大小: ${formatSize(totalSize)} (Gzip: ${formatSize(totalGzipSize)})`);

    // 按大小排序
    bundleSizes.sort((a, b) => b.size - a.size);

    // 输出最大的几个文件
    const largestFiles = bundleSizes.slice(0, 5);
    logger.info('最大的文件:');

    largestFiles.forEach((file) => {
      const sizeText = formatSize(file.size);
      const gzipText = file.gzipSize ? ` (Gzip: ${formatSize(file.gzipSize)})` : '';
      const changeText = file.changePercentage
        ? ` ${file.changePercentage > 0 ? '+' : ''}${file.changePercentage.toFixed(2)}%`
        : '';

      const logMethod = file.isOverSizeLimit ? logger.warn : logger.info;
      logMethod(`${file.name}: ${sizeText}${gzipText}${changeText}`);
    });

    // 检查超过大小限制的文件
    const oversizedFiles = bundleSizes.filter((file) => file.isOverSizeLimit);
    if (oversizedFiles.length > 0) {
      logger.warn(`发现 ${oversizedFiles.length} 个超过大小限制(${formatSize(sizeLimit)})的文件:`);

      oversizedFiles.forEach((file) => {
        logger.warn(
          `${file.name}: ${formatSize(file.size)} - 超出 ${formatSize(file.size - sizeLimit)}`
        );
      });

      // 添加优化建议
      logger.info('优化建议:');
      logger.info('- 检查重复依赖和未使用的代码');
      logger.info('- 考虑代码分割和懒加载策略');
      logger.info('- 优化第三方库的导入方式');
      logger.info('- 使用tree-shaking清除未使用代码');
    }

    return bundleSizes;
  } catch (error) {
    const err = error as Error;
    logger.error(`分析包大小时发生错误: ${err.message}`);
    return [];
  }
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}

/**
 * 历史记录条目
 */
interface HistoryEntry {
  size: number;
  gzipSize?: number;
  lastUpdated: string;
}

/**
 * 包大小历史记录
 */
interface SizeHistory {
  [filename: string]: HistoryEntry;
}

/**
 * 加载大小历史记录
 */
function loadSizeHistory(outputPath: string): SizeHistory {
  const historyPath = path.join(outputPath, SIZE_HISTORY_FILE);

  try {
    if (fs.existsSync(historyPath)) {
      const historyData = fs.readFileSync(historyPath, 'utf-8');
      return JSON.parse(historyData);
    }
  } catch (error) {
    const logger = getLogger('SafeScan:BundleSizeMonitor');
    logger.warn(`无法加载历史记录: ${(error as Error).message}`);
  }

  return {};
}

/**
 * 保存大小历史记录
 */
function saveSizeHistory(outputPath: string, history: SizeHistory): void {
  try {
    // 确保输出目录存在
    if (!fs.existsSync(outputPath)) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const historyPath = path.join(outputPath, SIZE_HISTORY_FILE);
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  } catch (error) {
    const logger = getLogger('SafeScan:BundleSizeMonitor');
    logger.warn(`无法保存历史记录: ${(error as Error).message}`);
  }
}

/**
 * 分析包内容，找出最大的依赖
 */
export function analyzeBundleContent(
  stats: Stats,
  _options: SafeScanWebpackPluginOptions
): Record<string, number> {
  const compilation = stats.compilation;
  const modules = Array.from(compilation.modules || []);

  // 按大小排序的模块
  const moduleSizes: Record<string, number> = {};

  modules.forEach((module) => {
    const name = module.nameForCondition?.() || module.identifier();
    if (!name) return;

    // 过滤系统模块
    if (name.includes('node_modules')) {
      const packageName = extractPackageName(name);
      if (packageName) {
        const size = getModuleSize(module);
        if (!moduleSizes[packageName]) {
          moduleSizes[packageName] = 0;
        }
        moduleSizes[packageName] += size;
      }
    }
  });

  return moduleSizes;
}

/**
 * 从模块路径中提取包名
 */
function extractPackageName(modulePath: string): string | null {
  const nodeModulesPath = modulePath.split('node_modules/')[1];
  if (!nodeModulesPath) return null;

  // 处理作用域包 (@org/package)
  if (nodeModulesPath.startsWith('@')) {
    const parts = nodeModulesPath.split('/');
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
  }

  // 普通包
  return nodeModulesPath.split('/')[0];
}

/**
 * 获取模块大小
 */
function getModuleSize(module: any): number {
  // 这里的实现可能需要根据webpack版本调整
  // 这只是一个简化的示例
  return module.size?.() || 0;
}
