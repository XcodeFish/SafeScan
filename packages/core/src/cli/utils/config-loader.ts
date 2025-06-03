import fs from 'fs';
import path from 'path';
import { cosmiconfig } from 'cosmiconfig';
import { defaultConfig } from './default-config';

/**
 * 安全扫描配置接口
 */
export interface SafeScanConfig {
  ignorePatterns?: string[];
  ruleRegistry?: string;
  entryPoints?: string[];
  timeouts?: {
    navigation: number;
    idle: number;
  };
  cache?: {
    enabled: boolean;
    directory?: string;
    maxSize?: number;
  };
  rules?: {
    [ruleId: string]: {
      enabled: boolean;
      severity?: 'critical' | 'error' | 'warning' | 'info';
      options?: Record<string, any>;
    };
  };
  fix?: {
    autoApply?: boolean;
    ignoreRules?: string[];
  };
  reporting?: {
    outputDir?: string;
    formats?: ('json' | 'html' | 'pdf')[];
  };
  plugins?: string[];
}

/**
 * 解析和加载SafeScan配置
 *
 * @param configPath 可选的配置文件路径
 * @returns 合并后的配置对象
 */
export async function resolveConfig(configPath?: string): Promise<SafeScanConfig> {
  let config: SafeScanConfig = { ...defaultConfig };

  try {
    // 如果指定了配置路径，直接加载
    if (configPath) {
      const resolvedPath = path.resolve(configPath);
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`配置文件不存在: ${resolvedPath}`);
      }

      // 根据文件扩展名决定如何解析
      const ext = path.extname(resolvedPath).toLowerCase();
      if (ext === '.json') {
        config = {
          ...config,
          ...JSON.parse(fs.readFileSync(resolvedPath, 'utf8')),
        };
      } else if (ext === '.js' || ext === '.cjs') {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const loadedConfig = require(resolvedPath);
        config = { ...config, ...loadedConfig };
      } else {
        throw new Error(`不支持的配置文件类型: ${ext}`);
      }
    } else {
      // 使用cosmiconfig搜索配置文件
      const explorer = cosmiconfig('safescan', {
        searchPlaces: [
          'package.json',
          '.safescanrc',
          '.safescanrc.json',
          '.safescanrc.yaml',
          '.safescanrc.yml',
          '.safescanrc.js',
          '.safescanrc.cjs',
          'safescan.config.js',
          'safescan.config.cjs',
        ],
      });

      const result = await explorer.search();

      if (result && !result.isEmpty) {
        config = { ...config, ...result.config };
      }
    }

    return validateConfig(config);
  } catch (error: unknown) {
    console.error(`加载配置失败: ${(error as Error).message}`);
    console.log('使用默认配置继续...');
    return defaultConfig;
  }
}

/**
 * 验证配置并修复常见问题
 *
 * @param config 待验证的配置
 * @returns 验证后的配置
 */
function validateConfig(config: SafeScanConfig): SafeScanConfig {
  // 确保ignorePatterns是数组
  if (config.ignorePatterns && !Array.isArray(config.ignorePatterns)) {
    config.ignorePatterns = [config.ignorePatterns as unknown as string];
  }

  // 确保entryPoints是数组
  if (config.entryPoints && !Array.isArray(config.entryPoints)) {
    config.entryPoints = [config.entryPoints as unknown as string];
  }

  // 确保超时设置有合理默认值
  if (!config.timeouts) {
    config.timeouts = { navigation: 30000, idle: 5000 };
  } else {
    if (typeof config.timeouts.navigation !== 'number') {
      config.timeouts.navigation = 30000;
    }
    if (typeof config.timeouts.idle !== 'number') {
      config.timeouts.idle = 5000;
    }
  }

  // 确保缓存配置合理
  if (!config.cache) {
    config.cache = { enabled: true };
  }

  return config;
}
