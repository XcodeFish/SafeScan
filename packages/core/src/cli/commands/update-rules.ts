import chalk from 'chalk';
import ora from 'ora';
import { ruleUpdater } from '../../analyzer/static/rules';
import { resolveConfig } from '../utils/config-loader';

/**
 * 规则更新命令选项接口
 */
interface UpdateRulesOptions {
  force?: boolean;
  registry?: string;
  config?: string;
}

/**
 * 更新安全规则库
 * 从远程注册表获取并更新最新的安全规则
 *
 * @param options 更新选项
 */
export async function updateRules(options: UpdateRulesOptions): Promise<void> {
  const spinner = ora('正在检查规则更新...').start();

  try {
    // 加载配置
    const config = await resolveConfig(options.config);

    // 获取规则注册表URL
    const registryUrl =
      options.registry || config.ruleRegistry || 'https://registry.safescan.dev/rules';

    spinner.text = '正在连接规则注册表...';

    // 执行更新
    const updateResult = await ruleUpdater({
      registryUrl,
      forceUpdate: options.force || false,
      verifySignature: true, // 始终验证签名确保安全
    });

    if (updateResult.updatedRules.length === 0) {
      spinner.succeed(chalk.green('所有规则已是最新'));
      return;
    }

    spinner.succeed(chalk.green(`成功更新 ${updateResult.updatedRules.length} 条规则`));

    // 显示更新的规则
    console.log(chalk.bold('\n更新的规则:'));

    updateResult.updatedRules.forEach((rule) => {
      const severityColor = getSeverityColor(rule.severity);
      console.log(
        severityColor(`  • ${rule.id}: ${rule.name} (${rule.oldVersion} → ${rule.newVersion})`)
      );

      if (rule.changeType === 'NEW') {
        console.log(chalk.green('    新规则'));
      } else if (rule.changeType === 'MAJOR') {
        console.log(chalk.yellow('    重大更新'));
      } else if (rule.changeType === 'MINOR') {
        console.log(chalk.blue('    次要更新'));
      }

      if (rule.changelog) {
        console.log(chalk.gray(`    变更说明: ${rule.changelog}`));
      }
    });

    // 显示规则库统计
    console.log(chalk.bold('\n规则库统计:'));
    console.log(chalk.gray(`  总规则数: ${updateResult.totalRules}`));
    console.log(chalk.gray(`  规则库版本: ${updateResult.registryVersion}`));
    console.log(
      chalk.gray(`  上次更新: ${new Date(updateResult.lastUpdateTime).toLocaleString()}`)
    );

    // 如果有任何失败的更新，显示警告
    if (updateResult.failedUpdates.length > 0) {
      console.log(chalk.yellow('\n部分规则更新失败:'));
      updateResult.failedUpdates.forEach((failure) => {
        console.log(chalk.yellow(`  • ${failure.ruleId}: ${failure.reason}`));
      });
    }

    // 如果获取新规则库元数据失败，但更新了部分规则
    if (updateResult.updatedRules.length > 0 && !updateResult.registryVersion) {
      console.log(chalk.yellow('\n警告: 已更新规则但无法获取完整的规则库元数据。'));
    }
  } catch (error: unknown) {
    spinner.fail(chalk.red(`规则更新失败: ${(error as Error).message}`));

    // 特殊错误处理
    if ((error as any).code === 'ENOTFOUND' || (error as any).code === 'ETIMEDOUT') {
      console.log(chalk.yellow('\n无法连接到规则注册表。请检查您的网络连接。'));
    } else if ((error as any).code === 'SIGNATURE_INVALID') {
      console.log(chalk.red('\n规则包签名无效，可能被篡改。出于安全考虑，已中止更新。'));
    }

    throw error;
  }
}

/**
 * 根据严重级别获取适当的颜色函数
 */
function getSeverityColor(severity: string): (text: string) => string {
  switch (severity.toLowerCase()) {
    case 'critical':
      return chalk.red;
    case 'error':
      return chalk.yellow;
    case 'warning':
      return chalk.blue;
    case 'info':
      return chalk.gray;
    default:
      return chalk.white;
  }
}
