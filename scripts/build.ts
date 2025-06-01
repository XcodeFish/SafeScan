#!/usr/bin/env node
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { build } from 'esbuild';
import { globSync } from 'glob';

// 基础配置
const BASE_CONFIG = {
  bundle: true,
  minify: process.env.NODE_ENV === 'production',
  sourcemap: process.env.NODE_ENV !== 'production',
  platform: 'neutral',
  target: ['es2020'],
  logLevel: 'info',
};

// 获取所有包路径
const getPackages = () => {
  const packagesDir = path.resolve(__dirname, '../packages');
  return fs
    .readdirSync(packagesDir)
    .filter((dir) => {
      const packageJsonPath = path.join(packagesDir, dir, 'package.json');
      return fs.existsSync(packageJsonPath);
    })
    .map((dir) => path.join(packagesDir, dir));
};

// 构建单个包
const buildPackage = async (packagePath: string) => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(packagePath, 'package.json'), 'utf8'));

  console.log(`Building package: ${packageJson.name}`);

  const entryPoints = globSync('src/**/*.ts', {
    cwd: packagePath,
    ignore: ['**/*.d.ts', '**/*.test.ts', '**/*.spec.ts'],
  }).map((file: string) => path.join(packagePath, file));

  if (entryPoints.length === 0) {
    console.log(`No entry points found for ${packageJson.name}, skipping...`);
    return;
  }

  try {
    // ESM输出
    await build({
      ...BASE_CONFIG,
      entryPoints,
      outdir: path.join(packagePath, 'dist/esm'),
      format: 'esm',
    });

    // CJS输出
    await build({
      ...BASE_CONFIG,
      entryPoints,
      outdir: path.join(packagePath, 'dist/cjs'),
      format: 'cjs',
    });

    // 复制类型定义文件
    await generateTypes(packagePath);

    console.log(`Successfully built ${packageJson.name}`);
  } catch (error) {
    console.error(`Failed to build ${packageJson.name}:`, error);
    process.exit(1);
  }
};

// 生成类型定义
const generateTypes = async (packagePath: string) => {
  // 使用TypeScript编译器生成类型定义
  return new Promise<void>((resolve, reject) => {
    exec(
      `tsc --emitDeclarationOnly --project ${path.join(packagePath, 'tsconfig.json')}`,
      (error: any) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }
    );
  });
};

// 主函数
const main = async () => {
  try {
    const packages = getPackages();
    console.log(`Found ${packages.length} packages to build`);

    // 确保按依赖顺序构建
    // 核心包应该最先构建
    const orderedPackages = packages.sort((a, b) => {
      if (a.includes('core')) return -1;
      if (b.includes('core')) return 1;
      return 0;
    });

    for (const pkg of orderedPackages) {
      await buildPackage(pkg);
    }

    console.log('All packages built successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
};

main();
