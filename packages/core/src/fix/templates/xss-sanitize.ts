/**
 * XSS防护修复模板
 * 用于修复XSS相关安全问题
 */
import { FixOperationType } from '../engine';
import type { IFixTemplate } from './types';

/**
 * dangerouslySetInnerHTML的DOMPurify修复模板
 */
export const dangerouslySetInnerHTMLSanitizeTemplate: IFixTemplate = {
  id: 'xss-sanitize-dangerouslysetinnerhtml',
  name: '使用DOMPurify安全处理HTML内容',
  description: '通过DOMPurify库对dangerouslySetInnerHTML内容进行安全过滤，防止XSS攻击',
  ruleIds: ['security/xss/dangerous-html'],
  confidence: 85,
  detect: (code: string) => {
    return /dangerouslySetInnerHTML\s*=\s*\{\s*\{.*?__html\s*:/.test(code);
  },
  transform: (code: string) => {
    // 检查是否已经有DOMPurify导入
    const hasImport = /import\s+(?:\w+\s+from\s+)?['"]dompurify['"]/.test(code);

    // 修复危险的HTML内容
    const fixedCode = code.replace(
      /(dangerouslySetInnerHTML\s*=\s*\{\s*\{.*?__html\s*:\s*)([^}]+)(\}\s*\})/g,
      (match, prefix, content, suffix) => {
        // 检查内容是否已经使用DOMPurify
        if (/DOMPurify\.sanitize/.test(content)) {
          return match; // 已经修复，保持不变
        }
        return `${prefix}DOMPurify.sanitize(${content.trim()})${suffix}`;
      }
    );

    // 如果没有DOMPurify导入且代码已修改，添加导入
    if (!hasImport && fixedCode !== code) {
      // 找到所有的import语句结束位置
      let importEndPos = 0;
      const importRegex = /^import\s+.+?;?\s*$/gm;
      let lastImport = null;
      let match;

      while ((match = importRegex.exec(code)) !== null) {
        lastImport = match;
      }

      if (lastImport) {
        importEndPos = lastImport.index + lastImport[0].length;
        return (
          fixedCode.substring(0, importEndPos) +
          "\nimport DOMPurify from 'dompurify';\n" +
          fixedCode.substring(importEndPos)
        );
      } else {
        return "import DOMPurify from 'dompurify';\n\n" + fixedCode;
      }
    }

    return fixedCode;
  },
  operations: (code: string) => {
    const hasImport = /import\s+(?:\w+\s+from\s+)?['"]dompurify['"]/.test(code);
    const operations = [];

    // 查找需要修复的地方
    const regex = /(dangerouslySetInnerHTML\s*=\s*\{\s*\{.*?__html\s*:\s*)([^}]+)(\}\s*\})/g;
    let match;

    while ((match = regex.exec(code)) !== null) {
      const [fullMatch, prefix, content, suffix] = match;

      // 检查内容是否已经使用DOMPurify
      if (!/DOMPurify\.sanitize/.test(content)) {
        operations.push({
          type: FixOperationType.REPLACE,
          start: match.index,
          end: match.index + fullMatch.length,
          content: `${prefix}DOMPurify.sanitize(${content.trim()})${suffix}`,
          description: '添加DOMPurify.sanitize()处理危险HTML内容',
        });
      }
    }

    // 如果需要添加导入
    if (!hasImport && operations.length > 0) {
      // 找到导入语句位置
      let importEndPos = 0;
      const importRegex = /^import\s+.+?;?\s*$/gm;
      let lastImport = null;
      let importMatch;

      while ((importMatch = importRegex.exec(code)) !== null) {
        lastImport = importMatch;
      }

      if (lastImport) {
        importEndPos = lastImport.index + lastImport[0].length;
      }

      operations.push({
        type: FixOperationType.INSERT,
        start: importEndPos ? importEndPos + 1 : 0, // 在最后一个import后添加
        end: importEndPos ? importEndPos + 1 : 0,
        content: importEndPos
          ? "\nimport DOMPurify from 'dompurify';\n"
          : "import DOMPurify from 'dompurify';\n\n",
        description: '添加DOMPurify库导入',
      });
    }

    return operations;
  },
};
