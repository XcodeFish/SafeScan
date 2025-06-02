/**
 * 大型依赖检测规则测试
 */
import { describe, test, expect, beforeEach } from 'vitest';
import { parseCode } from '@safescan/core/analyzer/static/parser';
import { RuleLoader, RuleMatcher } from '@safescan/core/analyzer/static/rules';
import largeDependenciesRule from '../../../../packages/rules/src/performance/large-dependencies';

describe('大型依赖检测规则测试', () => {
  let ruleLoader: RuleLoader;
  let ruleMatcher: RuleMatcher;

  beforeEach(() => {
    ruleLoader = new RuleLoader();
    ruleLoader.addRule(largeDependenciesRule);
    ruleMatcher = new RuleMatcher(ruleLoader);
  });

  test('应该检测到全量导入的大型依赖', async () => {
    const code = `
      import moment from 'moment';
      import React from 'react';
      
      const formattedDate = moment().format('YYYY-MM-DD');
      console.log(formattedDate);
    `;

    const ast = (await parseCode(code)).ast;
    const context = {
      filePath: 'test-file.js',
      fileContent: code,
    };

    const results = ruleMatcher.matchByRuleId(ast, context, 'performance/large-dependencies');

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].ruleId).toContain('large-dependency-import');
    expect(results[0].message).toContain('moment');
  });

  test('不应检测按需导入的依赖', async () => {
    const code = `
      import { format } from 'date-fns';
      import { debounce } from 'lodash/debounce';
      
      const formattedDate = format(new Date(), 'yyyy-MM-dd');
      const debouncedFn = debounce(() => {}, 300);
    `;

    const ast = (await parseCode(code)).ast;
    const context = {
      filePath: 'test-file.js',
      fileContent: code,
    };

    const results = ruleMatcher.matchByRuleId(ast, context, 'performance/large-dependencies');

    // 不应标记date-fns的按需导入
    const dateFnsIssues = results.filter((r) => r.message.includes('date-fns'));
    expect(dateFnsIssues.length).toBe(0);
  });

  test('应检测到重复的依赖导入', async () => {
    const code = `
      import React from 'react';
      import { useState } from 'react';
      import { useEffect } from 'react';
      
      function App() {
        const [value, setValue] = useState('');
        useEffect(() => {
          // something
        }, []);
        return <div>{value}</div>;
      }
    `;

    const ast = (await parseCode(code, { language: 'jsx' })).ast;
    const context = {
      filePath: 'test-file.jsx',
      fileContent: code,
    };

    const results = ruleMatcher.matchByRuleId(ast, context, 'performance/large-dependencies');

    const duplicateImportIssues = results.filter((r) => r.ruleId.includes('duplicate-imports'));
    expect(duplicateImportIssues.length).toBeGreaterThan(0);
  });

  test('应该检测webpack配置中缺少externals', async () => {
    const code = `
      module.exports = {
        entry: './src/index.js',
        output: {
          filename: 'bundle.js',
          path: path.resolve(__dirname, 'dist'),
        },
        module: {
          rules: [
            {
              test: /\\.js$/,
              exclude: /node_modules/,
              use: {
                loader: 'babel-loader',
              },
            },
          ],
        },
        plugins: [
          new HtmlWebpackPlugin({
            template: './src/index.html',
          }),
        ],
      };
    `;

    const ast = (await parseCode(code)).ast;
    const context = {
      filePath: 'webpack.config.js',
      fileContent: code,
    };

    const results = ruleMatcher.matchByRuleId(ast, context, 'performance/large-dependencies');

    // 由于没有externals配置，应标记webpack配置问题
    const externalIssues = results.filter((r) => r.ruleId.includes('missing-externals'));
    expect(externalIssues.length).toBeGreaterThan(0);
  });
});
