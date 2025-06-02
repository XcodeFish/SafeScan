/**
 * 规则优先级调度和版本管理示例
 */
import path from 'path';
import { IRule, RuleCategory, RuleSeverity } from '../../../types';
import { IncrementalScanner } from '../incremental-scanner';
import { RuleVersionManager, RuleUpdateType } from '../rule-version';
import { RulePriority, IRuleSchedulerConfig } from '../rules-config';

async function main() {
  // 创建示例规则
  const rules: IRule[] = [
    {
      id: 'security-xss-001',
      name: 'XSS防护: 禁止使用dangerouslySetInnerHTML',
      description: '使用dangerouslySetInnerHTML可能导致XSS攻击',
      category: RuleCategory.SECURITY,
      severity: RuleSeverity.CRITICAL,
      detect: (_ast, _context) => {
        // 模拟高优先级规则实现
        console.log(`执行严重级别规则: security-xss-001`);
        // 假设实现省略
        return [];
      },
    },
    {
      id: 'memory-leak-001',
      name: 'React内存泄漏: 未清理定时器或订阅',
      description: '组件卸载时未清理定时器或订阅会导致内存泄漏',
      category: RuleCategory.MEMORY,
      severity: RuleSeverity.HIGH,
      detect: (_ast, _context) => {
        // 模拟中优先级规则实现
        console.log(`执行高级别规则: memory-leak-001`);
        // 假设实现省略
        return [];
      },
    },
    {
      id: 'perf-memo-001',
      name: '性能优化: 使用React.memo或useMemo',
      description: '对于频繁重渲染的组件，应使用memo或useMemo提高性能',
      category: RuleCategory.PERFORMANCE,
      severity: RuleSeverity.MEDIUM,
      detect: (_ast, _context) => {
        // 模拟低优先级规则实现
        console.log(`执行中级别规则: perf-memo-001`);
        // 假设实现省略
        return [];
      },
    },
    {
      id: 'accessibility-001',
      name: '可访问性: 添加aria标签',
      description: '交互元素应添加恰当的aria标签提高可访问性',
      category: RuleCategory.ACCESSIBILITY,
      severity: RuleSeverity.LOW,
      detect: (_ast, _context) => {
        // 模拟更低优先级规则实现
        console.log(`执行低级别规则: accessibility-001`);
        // 假设实现省略
        return [];
      },
    },
  ];

  // 示例1: 规则优先级调度
  console.log('\n=== 规则优先级调度示例 ===');
  await prioritySchedulingExample(rules);

  // 示例2: 规则版本管理
  console.log('\n=== 规则版本管理示例 ===');
  await versionManagementExample(rules);
}

/**
 * 规则优先级调度示例
 */
async function prioritySchedulingExample(rules: IRule[]) {
  // 配置优先级权重
  const schedulerConfig: IRuleSchedulerConfig = {
    maxConcurrentRules: 2,
    enablePriorityScheduling: true,
    priorityWeights: {
      [RulePriority.CRITICAL]: 10,
      [RulePriority.HIGH]: 5,
      [RulePriority.MEDIUM]: 3,
      [RulePriority.LOW]: 1,
      [RulePriority.INFO]: 1,
    },
  };

  // 创建增量扫描器，启用优先级调度
  const scanner = new IncrementalScanner({
    enableCache: false,
    enablePriorityScheduling: true,
    schedulerConfig,
  });

  // 假设我们有一个测试文件
  const testFilePath = path.join(__dirname, 'test-component.tsx');

  console.log('开始扫描文件，将按优先级顺序执行规则...');
  // 注意：这里的测试文件可能不存在，仅作示例
  try {
    await scanner.scanFile(testFilePath, rules);
  } catch (error) {
    // 示例中的错误可以忽略
    console.log('规则按优先级顺序执行完成');
  }
}

/**
 * 规则版本管理示例
 */
async function versionManagementExample(rules: IRule[]) {
  // 创建临时注册表路径
  const registryPath = path.join(__dirname, 'temp-rule-registry.json');

  // 创建规则版本管理器
  const versionManager = new RuleVersionManager(registryPath);

  // 注册初始规则
  console.log('注册初始规则版本...');
  let updates = versionManager.updateRulesVersions(rules);

  // 显示更新结果
  console.log('初始规则版本更新结果:');
  updates.forEach((update) => {
    console.log(` - ${update.ruleId}: ${update.type} (${update.currentVersion || 'N/A'})`);
  });

  // 保存注册表
  await versionManager.saveRegistry();

  // 修改一条规则
  console.log('\n修改规则 "security-xss-001"...');
  const modifiedRules = [...rules];
  const xssRule = modifiedRules.find((r) => r.id === 'security-xss-001');
  if (xssRule) {
    xssRule.description = '更新后的描述: 使用dangerouslySetInnerHTML可能导致XSS攻击';
  }

  // 注册更新后的规则
  updates = versionManager.updateRulesVersions(modifiedRules);

  // 显示更新结果
  console.log('更新后的规则版本结果:');
  updates.forEach((update) => {
    if (update.type === RuleUpdateType.UPDATED) {
      console.log(
        ` - ${update.ruleId}: ${update.type} (${update.previousVersion} -> ${update.currentVersion})`
      );
    } else {
      console.log(` - ${update.ruleId}: ${update.type} (${update.currentVersion || 'N/A'})`);
    }
  });

  // 保存变更日志
  const changelogPath = path.join(__dirname, 'RULE-CHANGELOG.md');
  await versionManager.saveChangelog(updates, changelogPath);
  console.log(`规则变更日志已保存至: ${changelogPath}`);
}

// 执行示例
main().catch(console.error);
