/**
 * SafeScan规则库导出文件
 */
import criticalRules from './critical';
import performanceRules from './performance';
import reactRules from './react';
import vueRules from './vue';

// 导出所有规则
export default [...criticalRules, ...reactRules, ...vueRules, ...performanceRules];
