#!/usr/bin/env node

import chalk from 'chalk';
import { Command } from 'commander';
import figlet from 'figlet';
import { version } from '../../package.json';
import { audit } from './commands/audit';
import { generateReport } from './commands/generate-report';
import { memoryLeak } from './commands/memory-leak';
import { precheck } from './commands/precheck';
import { updateRules } from './commands/update-rules';

// 通用命令选项接口
interface CommandOptions {
  path?: string;
  fix?: boolean;
  ignore?: string;
  cache?: boolean;
  config?: string;
  verbose?: boolean;
  json?: boolean;
}

// 特定命令选项接口
interface AuditCommandOptions extends CommandOptions {
  level?: string;
  html?: boolean;
  pdf?: boolean;
}

interface MemoryLeakCommandOptions extends CommandOptions {
  threshold?: string;
  snapshots?: string;
  interval?: string;
  headless?: boolean;
}

interface UpdateCommandOptions {
  force?: boolean;
  registry?: string;
  config?: string;
}

interface ReportCommandOptions {
  input?: string;
  output?: string;
  format?: string;
  template?: string;
  config?: string;
}

/**
 * SafeScan CLI工具入口类
 * 实现命令行接口和主要命令
 */
class CLI {
  private program: Command;

  constructor() {
    this.program = new Command();
    this.setupProgram();
  }

  /**
   * 配置CLI程序
   */
  private setupProgram(): void {
    this.program
      .name('safescan')
      .description('SafeScan前端安全扫描工具')
      .version(version)
      .option('-c, --config <path>', '配置文件路径')
      .option('-v, --verbose', '显示详细输出')
      .option('--no-color', '禁用彩色输出')
      .option('--json', '以JSON格式输出结果');

    this.registerCommands();
  }

  /**
   * 注册所有命令
   */
  private registerCommands(): void {
    this.registerPrecheckCommand();
    this.registerAuditCommand();
    this.registerMemoryLeakCommand();
    this.registerUpdateCommand();
    this.registerReportCommand();
  }

  /**
   * 注册precheck命令
   * 用于快速检查项目中的常见安全问题
   */
  private registerPrecheckCommand(): void {
    this.program
      .command('precheck')
      .description('快速检查项目中的常见安全问题')
      .option('-p, --path <path>', '项目路径', process.cwd())
      .option('-f, --fix', '自动修复发现的问题')
      .option('-i, --ignore <patterns>', '忽略的文件模式，逗号分隔')
      .option('--cache', '使用缓存加速检查', true)
      .action(async (options: CommandOptions) => {
        try {
          // 类型断言确保选项符合接口要求
          await precheck({
            path: options.path || process.cwd(),
            fix: !!options.fix,
            ignore: options.ignore,
            cache: options.cache !== false,
            config: options.config,
            verbose: options.verbose,
            json: options.json,
          });
        } catch (error: unknown) {
          console.error(chalk.red(`执行precheck命令时出错: ${(error as Error).message}`));
          process.exit(1);
        }
      });
  }

  /**
   * 注册audit命令
   * 用于深度审计项目的安全漏洞
   */
  private registerAuditCommand(): void {
    this.program
      .command('audit')
      .description('深度审计项目的安全漏洞')
      .option('-p, --path <path>', '项目路径', process.cwd())
      .option('-f, --fix', '自动修复发现的问题')
      .option('-l, --level <level>', '最低报告级别 (info, warning, error, critical)', 'warning')
      .option('--html', '生成HTML报告')
      .option('--pdf', '生成PDF报告')
      .action(async (options: AuditCommandOptions) => {
        try {
          // 类型断言确保选项符合接口要求
          await audit({
            path: options.path || process.cwd(),
            fix: !!options.fix,
            level: (options.level || 'warning') as 'info' | 'warning' | 'error' | 'critical',
            html: !!options.html,
            pdf: !!options.pdf,
            config: options.config,
            verbose: options.verbose,
            json: options.json,
          });
        } catch (error: unknown) {
          console.error(chalk.red(`执行audit命令时出错: ${(error as Error).message}`));
          process.exit(1);
        }
      });
  }

  /**
   * 注册memory-leak命令
   * 用于检测内存泄漏问题
   */
  private registerMemoryLeakCommand(): void {
    this.program
      .command('memory')
      .description('检测项目中的内存泄漏问题')
      .option('-p, --path <path>', '项目路径', process.cwd())
      .option('-t, --threshold <value>', '泄漏阈值(MB)', '5')
      .option('--snapshots <number>', '快照数量', '3')
      .option('--interval <seconds>', '快照间隔(秒)', '10')
      .option('--headless', '使用无头浏览器进行检测', false)
      .action(async (options: MemoryLeakCommandOptions) => {
        try {
          // 类型断言确保选项符合接口要求
          await memoryLeak({
            path: options.path || process.cwd(),
            threshold: options.threshold || '5',
            snapshots: options.snapshots || '3',
            interval: options.interval || '10',
            headless: !!options.headless,
            config: options.config,
            verbose: options.verbose,
            json: options.json,
          });
        } catch (error: unknown) {
          console.error(chalk.red(`执行memory命令时出错: ${(error as Error).message}`));
          process.exit(1);
        }
      });
  }

  /**
   * 注册update命令
   * 用于更新规则库
   */
  private registerUpdateCommand(): void {
    this.program
      .command('update')
      .description('更新安全规则库')
      .option('--force', '强制更新所有规则')
      .option('--registry <url>', '指定规则注册表URL')
      .action(async (options: UpdateCommandOptions) => {
        try {
          // 类型断言确保选项符合接口要求
          await updateRules({
            force: !!options.force,
            registry: options.registry,
            config: options.config,
          });
        } catch (error: unknown) {
          console.error(chalk.red(`执行update命令时出错: ${(error as Error).message}`));
          process.exit(1);
        }
      });
  }

  /**
   * 注册report命令
   * 用于生成安全报告
   */
  private registerReportCommand(): void {
    this.program
      .command('report')
      .description('基于扫描结果生成安全报告')
      .option('-i, --input <path>', '输入结果文件路径')
      .option('-o, --output <path>', '报告输出路径')
      .option('-f, --format <format>', '报告格式 (html, pdf, json)', 'html')
      .option('--template <path>', '自定义报告模板路径')
      .action(async (options: ReportCommandOptions) => {
        try {
          if (!options.input) {
            throw new Error('必须提供输入结果文件路径');
          }

          // 类型断言确保选项符合接口要求
          await generateReport({
            input: options.input,
            output: options.output,
            format: (options.format || 'html') as 'html' | 'pdf' | 'json',
            template: options.template,
          });
        } catch (error: unknown) {
          console.error(chalk.red(`执行report命令时出错: ${(error as Error).message}`));
          process.exit(1);
        }
      });
  }

  /**
   * 显示欢迎信息
   */
  private showWelcome(): void {
    console.log(chalk.cyan(figlet.textSync('SafeScan', { horizontalLayout: 'full' })));
    console.log(chalk.green(`SafeScan 前端安全扫描工具 v${version}\n`));
  }

  /**
   * 运行CLI程序
   */
  public async run(): Promise<void> {
    this.showWelcome();
    await this.program.parseAsync(process.argv);
  }
}

export function run(): Promise<void> {
  const cli = new CLI();
  return cli.run();
}
