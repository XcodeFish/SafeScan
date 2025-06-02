/**
 * 关键安全规则导出文件
 */
import csrfDetectionRule from './csrf-detection';
import sqlInjectionRule from './sql-injection';
import xssDetectionRule from './xss-detection';

// 导出所有关键安全规则
export default [xssDetectionRule, csrfDetectionRule, sqlInjectionRule];
