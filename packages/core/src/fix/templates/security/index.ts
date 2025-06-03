import { IFixTemplate } from '../../types';

/**
 * 加载安全相关修复模板
 * @returns 模板列表
 */
export function loadSecurityTemplates(): IFixTemplate[] {
  return [
    // XSS防护模板
    {
      id: 'security-xss-sanitize',
      name: 'XSS防护-输入净化',
      supportedRules: ['xss-injection', 'security/no-unsafe-innerhtml'],
      description: '通过净化用户输入防止XSS攻击',
      tags: ['security', 'xss', 'critical'],
      fix: () => ({
        fixed: false,
        description: '需要实现XSS修复',
        changedLocations: [],
      }),
    },

    // CSRF防护模板
    {
      id: 'security-csrf-token',
      name: 'CSRF防护-令牌验证',
      supportedRules: ['csrf-vulnerability', 'security/no-unprotected-forms'],
      description: '添加CSRF令牌到表单提交',
      tags: ['security', 'csrf', 'critical'],
      fix: () => ({
        fixed: false,
        description: '需要实现CSRF修复',
        changedLocations: [],
      }),
    },

    // 其他安全修复模板...
  ];
}

export default loadSecurityTemplates;
