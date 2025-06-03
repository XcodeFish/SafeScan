import { SafeScanConfig } from './config-loader';

/**
 * 默认的SafeScan配置
 */
export const defaultConfig: SafeScanConfig = {
  // 默认忽略的文件模式
  ignorePatterns: [
    'node_modules/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.git/**',
    '**/*.min.js',
    '**/*.chunk.js',
  ],

  // 默认规则注册表
  ruleRegistry: 'https://registry.safescan.dev/rules',

  // 默认超时设置
  timeouts: {
    navigation: 30000, // 30秒
    idle: 5000, // 5秒
  },

  // 缓存设置
  cache: {
    enabled: true,
    directory: '.safescan-cache',
    maxSize: 50, // MB
  },

  // 规则配置
  rules: {
    // XSS防护规则
    'security/no-unsafe-innerHTML': {
      enabled: true,
      severity: 'critical',
    },
    'security/no-eval': {
      enabled: true,
      severity: 'critical',
    },
    'security/no-function-constructor': {
      enabled: true,
      severity: 'error',
    },

    // React特定规则
    'react/no-dangerous-html': {
      enabled: true,
      severity: 'critical',
    },
    'react/no-refs-in-effects': {
      enabled: true,
      severity: 'error',
    },
    'react/no-direct-mutation': {
      enabled: true,
      severity: 'error',
    },

    // Vue特定规则
    'vue/no-unsafe-v-html': {
      enabled: true,
      severity: 'critical',
    },
    'vue/no-side-effects-in-computed': {
      enabled: true,
      severity: 'error',
    },

    // 内存泄漏规则
    'memory/no-forgotten-listeners': {
      enabled: true,
      severity: 'error',
    },
    'memory/no-orphan-event-handlers': {
      enabled: true,
      severity: 'error',
    },
    'memory/no-closure-memory-leaks': {
      enabled: true,
      severity: 'warning',
    },
  },

  // 修复设置
  fix: {
    autoApply: false,
    ignoreRules: [],
  },

  // 报告设置
  reporting: {
    outputDir: 'safescan-reports',
    formats: ['html'],
  },
};
