/**
 * 规则ID: security/sensitive-data-exposure
 * 严重性: critical
 *
 * 此规则检测代码中可能泄露的敏感信息
 */
import type { Node } from '@swc/core';
import { createRule } from '../../../core/src/analyzer/static/rule-dsl';
import type { RuleContext } from '../../../core/src/types/rule';

/**
 * 敏感信息类型
 */
enum SensitiveDataType {
  API_KEY = 'API密钥',
  PASSWORD = '密码',
  TOKEN = '认证令牌',
  CREDENTIAL = '凭证',
  SECRET = '密钥',
  PRIVATE_KEY = '私钥',
  CREDIT_CARD = '信用卡',
  SSN = '社会安全号',
  EMAIL = '电子邮件',
  PHONE = '电话号码',
  ADDRESS = '地址',
}

/**
 * 检查是否包含敏感数据
 * @param node 要检查的节点
 * @param context 规则上下文
 * @returns 包含的敏感数据类型或undefined
 */
function detectSensitiveData(node: Node, context: RuleContext): SensitiveDataType | undefined {
  // 只检查字符串字面量、变量声明和对象属性
  if (
    node.type !== 'StringLiteral' &&
    node.type !== 'VariableDeclarator' &&
    node.type !== 'KeyValueProperty'
  ) {
    return undefined;
  }

  const nodeText = context.getNodeText(node);

  // 检测敏感信息模式
  const sensitivePatterns = [
    { type: SensitiveDataType.API_KEY, pattern: /api[_-]?key|apikey/i },
    { type: SensitiveDataType.PASSWORD, pattern: /password|passwd|pwd/i },
    { type: SensitiveDataType.TOKEN, pattern: /token|jwt|auth[_-]token/i },
    { type: SensitiveDataType.CREDENTIAL, pattern: /credential|cred/i },
    { type: SensitiveDataType.SECRET, pattern: /secret|private/i },
    { type: SensitiveDataType.PRIVATE_KEY, pattern: /private[_-]?key|-----BEGIN/i },
    { type: SensitiveDataType.CREDIT_CARD, pattern: /credit[_-]?card|card[_-]?number|ccnumber/i },
    { type: SensitiveDataType.SSN, pattern: /social[_-]?security|ssn/i },
  ];

  // 检查是否匹配上述模式
  for (const { type, pattern } of sensitivePatterns) {
    if (pattern.test(nodeText)) {
      return type;
    }
  }

  // 检查是否是硬编码的敏感内容
  if (node.type === 'StringLiteral') {
    const value = (node as any).value;

    // 检查是否为Base64编码数据
    if (
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) &&
      value.length > 20
    ) {
      return SensitiveDataType.SECRET;
    }

    // 检查是否为JWT格式
    if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(value)) {
      return SensitiveDataType.TOKEN;
    }

    // 检查是否为API密钥格式
    if (/^[A-Za-z0-9]{20,}$/.test(value)) {
      return SensitiveDataType.API_KEY;
    }
  }

  return undefined;
}

/**
 * 检查是否在安全上下文中使用敏感数据
 * @param node 要检查的节点
 * @param context 规则上下文
 */
function isInSecureContext(node: Node, context: RuleContext): boolean {
  // 检查是否在环境变量或配置文件中
  const nodeText = context.getNodeText(node);

  // 环境变量使用模式
  const securePatterns = [/process\.env/, /dotenv/, /config\./, /\.env/];

  if (securePatterns.some((pattern) => pattern.test(nodeText))) {
    return true;
  }

  // 检查是否在导入语句中
  if (nodeText.includes('import') && nodeText.includes('from')) {
    return true;
  }

  // 检查文件路径是否包含安全相关的目录
  const filePath = context.filePath.toLowerCase();
  const secureDirectories = ['config', 'environment', 'env', 'settings'];

  if (secureDirectories.some((dir) => filePath.includes(`/${dir}/`))) {
    return true;
  }

  return false;
}

export default createRule()
  .id('security/sensitive-data-exposure')
  .name('敏感信息暴露')
  .description('检测代码中可能泄露的敏感信息，如API密钥、密码、令牌等')
  .category('security')
  .severity('critical')
  .select((node: Node) => {
    return (
      node.type === 'StringLiteral' ||
      node.type === 'VariableDeclarator' ||
      node.type === 'KeyValueProperty'
    );
  })
  .when((node: Node, context: RuleContext) => {
    // 检测敏感数据
    const sensitiveType = detectSensitiveData(node, context);

    // 如果没有敏感数据，则跳过
    if (!sensitiveType) {
      return false;
    }

    // 如果在安全上下文中，则不报告问题
    if (isInSecureContext(node, context)) {
      return false;
    }

    return true;
  })
  .report('检测到硬编码的敏感信息，可能导致敏感信息泄露')
  .documentation(
    `
    ### 问题描述
    
    敏感数据暴露是指在代码、配置文件或日志中直接包含敏感信息，如API密钥、密码或个人身份信息。
    这可能导致未经授权的访问、数据泄露和安全漏洞。
    
    ### 漏洞影响
    
    - 未经授权访问敏感系统和数据
    - 身份盗窃和账户劫持
    - 财务损失
    - 违反数据保护法规
    
    ### 修复建议
    
    1. 使用环境变量存储敏感信息
    2. 利用安全的密钥管理服务
    3. 不要在代码中硬编码敏感数据
    4. 使用配置文件（确保不被版本控制）
    
    ### 示例代码
    
    错误示例:
    \`\`\`js
    // 硬编码敏感信息
    const apiKey = 'abcd1234efgh5678ijkl9012';
    const password = 'supersecretpassword';
    
    // 将敏感信息暴露在日志中
    console.log('API Key:', apiKey);
    \`\`\`
    
    正确示例:
    \`\`\`js
    // 使用环境变量
    const apiKey = process.env.API_KEY;
    
    // 避免记录敏感信息
    console.log('Using API credentials');
    
    // 使用配置文件
    import config from './config';
    const credentials = config.credentials;
    \`\`\`
  `
  )
  .example('bad', "const password = 'supersecret123';")
  .example('bad', "const apiKey = '1a2b3c4d5e6f7g8h9i0j';")
  .example('good', 'const apiKey = process.env.API_KEY;')
  .build();
