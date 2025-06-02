/**
 * Vue 组件规则检测
 * 检测Vue组件中的常见问题和最佳实践
 */
import {
  IRule,
  RuleCategory,
  RuleSeverity,
  Framework,
  TAST,
  TRuleContext,
  TRuleResult,
  TCodeLocation,
} from '../../../core/src/types';

// 检测Vue组件生命周期钩子中的副作用
function checkLifecycleEffects(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      // 查找Vue组件定义
      traverseVueComponentDefinitions(ast, (component, location) => {
        // 检查created和mounted生命周期钩子
        const lifecycleHooks = findLifecycleHooks(component);

        for (const hook of lifecycleHooks) {
          // 检查未清理的事件监听器
          const eventListeners = findEventListenersInHook(hook);

          if (eventListeners.length > 0 && hook.name === 'mounted') {
            // 检查是否在beforeDestroy或destroyed钩子中清理
            const hasCleanupHook = hasProperCleanup(component, eventListeners);

            if (!hasCleanupHook) {
              results.push({
                ruleId: 'vue/components/memory-leak',
                message: 'mounted钩子中添加了事件监听器，但未在组件销毁前移除，可能导致内存泄漏',
                severity: RuleSeverity.HIGH,
                location: getHookLocation(hook) || location,
                codeSnippet: context.fileContent.substring(
                  Math.max(0, location.startColumn - 10),
                  Math.min(context.fileContent.length, location.endColumn + 30)
                ),
                fixSuggestion: '在beforeDestroy或unmounted钩子中移除事件监听器',
                fixable: false,
              });
            }
          }

          // 检查生命周期钩子中的异步操作是否处理组件销毁情况
          const asyncOperations = findAsyncOperationsInHook(hook);

          if (asyncOperations.length > 0) {
            const hasDestroyedCheck = checkForDestroyedState(hook, asyncOperations);

            if (!hasDestroyedCheck) {
              results.push({
                ruleId: 'vue/components/async-lifecycle',
                message: `${hook.name}钩子中包含异步操作，但未检查组件销毁状态，可能导致内存泄漏或错误`,
                severity: RuleSeverity.MEDIUM,
                location: getHookLocation(hook) || location,
                codeSnippet: context.fileContent.substring(
                  Math.max(0, location.startColumn - 10),
                  Math.min(context.fileContent.length, location.endColumn + 30)
                ),
                fixSuggestion: '在异步回调中检查组件是否已被销毁: if (this._isDestroyed) return;',
                fixable: false,
              });
            }
          }
        }
      });
    }
  } catch (error) {
    console.error('检测Vue生命周期副作用时出错:', error);
  }

  return results;
}

// 检测Vue组件属性命名
function checkComponentProps(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      // 查找Vue组件定义
      traverseVueComponentDefinitions(ast, (component, location) => {
        // 查找props定义
        const propsDefinition = findPropsDefinition(component);

        if (propsDefinition) {
          // 检查props命名是否符合camelCase
          const nonCamelCaseProps = findNonCamelCaseProps(propsDefinition);

          if (nonCamelCaseProps.length > 0) {
            results.push({
              ruleId: 'vue/components/prop-naming',
              message: `以下props命名不符合camelCase规范: ${nonCamelCaseProps.join(', ')}`,
              severity: RuleSeverity.LOW,
              location,
              codeSnippet: context.fileContent.substring(
                Math.max(0, location.startColumn - 10),
                Math.min(context.fileContent.length, location.endColumn + 30)
              ),
              fixSuggestion: '使用camelCase命名props',
              fixable: true,
            });
          }

          // 检查props是否缺少类型定义
          const propsWithoutType = findPropsWithoutType(propsDefinition);

          if (propsWithoutType.length > 0) {
            results.push({
              ruleId: 'vue/components/prop-type',
              message: `以下props缺少类型定义: ${propsWithoutType.join(', ')}`,
              severity: RuleSeverity.MEDIUM,
              location,
              codeSnippet: context.fileContent.substring(
                Math.max(0, location.startColumn - 10),
                Math.min(context.fileContent.length, location.endColumn + 30)
              ),
              fixSuggestion: '为每个prop提供类型定义，如: propName: { type: String }',
              fixable: false,
            });
          }

          // 检查props验证
          const propsWithoutValidation = findPropsWithoutValidation(propsDefinition);

          if (propsWithoutValidation.length > 0) {
            results.push({
              ruleId: 'vue/components/prop-validation',
              message: '部分props缺少验证，建议添加required或default',
              severity: RuleSeverity.LOW,
              location,
              codeSnippet: context.fileContent.substring(
                Math.max(0, location.startColumn - 10),
                Math.min(context.fileContent.length, location.endColumn + 30)
              ),
              fixSuggestion: '添加required: true或default属性进行验证',
              fixable: false,
            });
          }
        }
      });
    }
  } catch (error) {
    console.error('检测Vue组件props时出错:', error);
  }

  return results;
}

// 检测Vue组件数据变更问题
function checkDataMutations(ast: TAST, context: TRuleContext): TRuleResult[] {
  const results: TRuleResult[] = [];

  try {
    if (ast.type === 'Module') {
      // 查找直接修改props的情况
      traverseVueComponentDefinitions(ast, (component, location) => {
        const propMutations = findPropMutations(component);

        if (propMutations.length > 0) {
          for (const mutation of propMutations) {
            results.push({
              ruleId: 'vue/components/prop-mutation',
              message: '直接修改props，违反Vue的单向数据流原则',
              severity: RuleSeverity.CRITICAL,
              location: mutation.location || location,
              codeSnippet: context.fileContent.substring(
                Math.max(0, (mutation.location || location).startColumn - 10),
                Math.min(context.fileContent.length, (mutation.location || location).endColumn + 30)
              ),
              fixSuggestion: '使用data或computed属性保存衍生状态，或使用$emit向父组件发送事件',
              fixable: false,
            });
          }
        }

        // 检查是否直接修改计算属性
        const computedMutations = findComputedMutations(component);

        if (computedMutations.length > 0) {
          for (const mutation of computedMutations) {
            results.push({
              ruleId: 'vue/components/computed-mutation',
              message: '尝试修改计算属性，计算属性应为只读',
              severity: RuleSeverity.CRITICAL,
              location: mutation.location || location,
              codeSnippet: context.fileContent.substring(
                Math.max(0, (mutation.location || location).startColumn - 10),
                Math.min(context.fileContent.length, (mutation.location || location).endColumn + 30)
              ),
              fixSuggestion: '使用methods或watchers处理需要修改计算属性的逻辑',
              fixable: false,
            });
          }
        }
      });
    }
  } catch (error) {
    console.error('检测Vue组件数据变更时出错:', error);
  }

  return results;
}

// 辅助函数：遍历Vue组件定义
function traverseVueComponentDefinitions(
  node: any,
  callback: (component: any, location: TCodeLocation) => void
) {
  if (!node) return;

  // Vue.component调用
  if (
    node.type === 'CallExpression' &&
    node.callee &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object &&
    node.callee.object.value === 'Vue' &&
    node.callee.property &&
    node.callee.property.value === 'component' &&
    node.span
  ) {
    // 获取组件定义对象
    if (
      node.arguments &&
      node.arguments.length > 1 &&
      node.arguments[1].type === 'ObjectExpression'
    ) {
      callback(node.arguments[1], {
        filePath: 'current-file',
        startLine: node.span.start.line,
        startColumn: node.span.start.column,
        endLine: node.span.end.line,
        endColumn: node.span.end.column,
      });
    }
  }

  // 导出default对象定义组件
  if (
    node.type === 'ExportDefaultDeclaration' &&
    node.declaration &&
    node.declaration.type === 'ObjectExpression' &&
    node.span
  ) {
    // 检查是否是Vue组件定义
    if (isVueComponentObject(node.declaration)) {
      callback(node.declaration, {
        filePath: 'current-file',
        startLine: node.span.start.line,
        startColumn: node.span.start.column,
        endLine: node.span.end.line,
        endColumn: node.span.end.column,
      });
    }
  }

  // new Vue构造函数
  if (
    node.type === 'NewExpression' &&
    node.callee &&
    node.callee.type === 'Identifier' &&
    node.callee.value === 'Vue' &&
    node.arguments &&
    node.arguments.length > 0 &&
    node.arguments[0].type === 'ObjectExpression' &&
    node.span
  ) {
    callback(node.arguments[0], {
      filePath: 'current-file',
      startLine: node.span.start.line,
      startColumn: node.span.start.column,
      endLine: node.span.end.line,
      endColumn: node.span.end.column,
    });
  }

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseVueComponentDefinitions(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseVueComponentDefinitions(item, callback);
        }
      }
    }
  }
}

// 辅助函数：检查对象是否是Vue组件定义
function isVueComponentObject(obj: any): boolean {
  if (!obj || !obj.properties) return false;

  // 查找Vue组件特有属性
  const vueComponentProperties = [
    'data',
    'methods',
    'props',
    'computed',
    'watch',
    'components',
    'directives',
    'filters',
    'created',
    'mounted',
    'updated',
    'beforeDestroy',
    'destroyed',
    'beforeMount',
    'beforeUpdate',
  ];

  for (const prop of obj.properties) {
    if (
      prop.key &&
      (prop.key.value || prop.key.name) &&
      vueComponentProperties.includes(prop.key.value || prop.key.name)
    ) {
      return true;
    }
  }

  return false;
}

// 辅助函数：查找生命周期钩子
function findLifecycleHooks(component: any): any[] {
  const hooks = [];
  const lifecycleNames = [
    'created',
    'mounted',
    'updated',
    'beforeDestroy',
    'destroyed',
    'beforeMount',
    'beforeUpdate',
    'unmounted',
    'beforeUnmount',
  ];

  if (component.properties) {
    for (const prop of component.properties) {
      if (
        prop.key &&
        (prop.key.value || prop.key.name) &&
        lifecycleNames.includes(prop.key.value || prop.key.name)
      ) {
        hooks.push({
          name: prop.key.value || prop.key.name,
          body: prop.value,
          node: prop,
        });
      }
    }
  }

  return hooks;
}

// 辅助函数：查找钩子中的事件监听器
function findEventListenersInHook(hook: any): any[] {
  const eventListeners = [];

  if (!hook || !hook.body) return eventListeners;

  // 查找事件监听添加
  traverseNode(hook.body, (node) => {
    // addEventListener方法调用
    if (
      node.type === 'CallExpression' &&
      node.callee &&
      node.callee.type === 'MemberExpression' &&
      node.callee.property &&
      node.callee.property.value === 'addEventListener'
    ) {
      eventListeners.push({
        type: 'dom',
        node: node,
        target: node.callee.object,
        eventName: node.arguments && node.arguments.length > 0 ? node.arguments[0] : null,
        handler: node.arguments && node.arguments.length > 1 ? node.arguments[1] : null,
      });
    }

    // $on方法调用（Vue事件总线）
    if (
      node.type === 'CallExpression' &&
      node.callee &&
      node.callee.type === 'MemberExpression' &&
      node.callee.property &&
      node.callee.property.value === '$on'
    ) {
      eventListeners.push({
        type: 'vue',
        node: node,
        target: node.callee.object,
        eventName: node.arguments && node.arguments.length > 0 ? node.arguments[0] : null,
        handler: node.arguments && node.arguments.length > 1 ? node.arguments[1] : null,
      });
    }
  });

  return eventListeners;
}

// 辅助函数：检查是否有合适的清理代码
function hasProperCleanup(component: any, eventListeners: any[]): boolean {
  // 查找beforeDestroy或destroyed钩子
  const destroyHooks = [];

  if (component.properties) {
    for (const prop of component.properties) {
      if (
        prop.key &&
        (prop.key.value || prop.key.name) &&
        ['beforeDestroy', 'destroyed', 'beforeUnmount', 'unmounted'].includes(
          prop.key.value || prop.key.name
        )
      ) {
        destroyHooks.push(prop.value);
      }
    }
  }

  if (destroyHooks.length === 0) return false;

  // 检查清理代码
  for (const listener of eventListeners) {
    let hasCleanup = false;

    for (const hook of destroyHooks) {
      if (listener.type === 'dom') {
        // 检查是否调用了removeEventListener
        traverseNode(hook, (node) => {
          if (
            node.type === 'CallExpression' &&
            node.callee &&
            node.callee.type === 'MemberExpression' &&
            node.callee.property &&
            node.callee.property.value === 'removeEventListener'
          ) {
            hasCleanup = true;
          }
        });
      } else if (listener.type === 'vue') {
        // 检查是否调用了$off
        traverseNode(hook, (node) => {
          if (
            node.type === 'CallExpression' &&
            node.callee &&
            node.callee.type === 'MemberExpression' &&
            node.callee.property &&
            node.callee.property.value === '$off'
          ) {
            hasCleanup = true;
          }
        });
      }
    }

    if (!hasCleanup) return false;
  }

  return true;
}

// 辅助函数：查找钩子中的异步操作
function findAsyncOperationsInHook(hook: any): any[] {
  const asyncOperations = [];

  if (!hook || !hook.body) return asyncOperations;

  // 查找异步操作
  traverseNode(hook.body, (node) => {
    // Promise
    if (
      node.type === 'CallExpression' &&
      node.callee &&
      node.callee.type === 'MemberExpression' &&
      node.callee.object &&
      node.callee.object.value === 'Promise'
    ) {
      asyncOperations.push({ type: 'promise', node });
    }

    // setTimeout/setInterval
    if (
      node.type === 'CallExpression' &&
      node.callee &&
      node.callee.type === 'Identifier' &&
      (node.callee.value === 'setTimeout' || node.callee.value === 'setInterval')
    ) {
      asyncOperations.push({ type: 'timer', node });
    }

    // fetch
    if (
      node.type === 'CallExpression' &&
      node.callee &&
      node.callee.type === 'Identifier' &&
      node.callee.value === 'fetch'
    ) {
      asyncOperations.push({ type: 'fetch', node });
    }

    // axios
    if (
      node.type === 'CallExpression' &&
      node.callee &&
      ((node.callee.type === 'MemberExpression' &&
        node.callee.object &&
        node.callee.object.value === 'axios') ||
        (node.callee.type === 'Identifier' && node.callee.value === 'axios'))
    ) {
      asyncOperations.push({ type: 'axios', node });
    }
  });

  return asyncOperations;
}

// 辅助函数：检查是否检查了组件销毁状态
function checkForDestroyedState(hook: any, asyncOperations: any[]): boolean {
  // 在简单情况下，我们不能完全确定是否正确处理了组件销毁状态
  // 这里采用简单的启发式方法：检查是否引用了this._isDestroyed或this.$isDestroyed等变量
  let hasDestroyedCheck = false;

  for (const op of asyncOperations) {
    // 查找异步回调
    if (op.node.arguments) {
      for (const arg of op.node.arguments) {
        if (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') {
          // 在回调中查找销毁状态检查
          traverseNode(arg, (node) => {
            if (
              (node.type === 'MemberExpression' &&
                node.object &&
                (node.object.value === 'this' || node.object.name === 'this') &&
                node.property &&
                (node.property.value === '_isDestroyed' ||
                  node.property.value === '$isDestroyed' ||
                  node.property.value === '_isBeingDestroyed')) ||
              (node.type === 'Identifier' &&
                (node.value === '_isDestroyed' || node.value === '$isDestroyed'))
            ) {
              hasDestroyedCheck = true;
            }
          });
        }
      }
    }
  }

  return hasDestroyedCheck;
}

// 辅助函数：获取钩子的代码位置
function getHookLocation(hook: any): TCodeLocation | null {
  if (hook && hook.node && hook.node.span) {
    return {
      filePath: 'current-file',
      startLine: hook.node.span.start.line,
      startColumn: hook.node.span.start.column,
      endLine: hook.node.span.end.line,
      endColumn: hook.node.span.end.column,
    };
  }
  return null;
}

// 辅助函数：查找props定义
function findPropsDefinition(component: any): any {
  if (!component || !component.properties) return null;

  for (const prop of component.properties) {
    if (prop.key && (prop.key.value === 'props' || prop.key.name === 'props')) {
      return prop.value;
    }
  }

  return null;
}

// 辅助函数：查找不符合camelCase的props
function findNonCamelCaseProps(propsDefinition: any): string[] {
  const nonCamelCaseProps = [];

  if (!propsDefinition) return nonCamelCaseProps;

  // 数组形式的props
  if (propsDefinition.type === 'ArrayExpression' && propsDefinition.elements) {
    for (const element of propsDefinition.elements) {
      if (element.type === 'StringLiteral' && element.value) {
        const propName = element.value;

        // 检查是否符合camelCase
        if (propName && propName !== propName.toLowerCase() && propName.includes('-')) {
          nonCamelCaseProps.push(propName);
        }
      }
    }
  }

  // 对象形式的props
  if (propsDefinition.type === 'ObjectExpression' && propsDefinition.properties) {
    for (const prop of propsDefinition.properties) {
      if (prop.key && (prop.key.value || prop.key.name)) {
        const propName = prop.key.value || prop.key.name;

        // 检查是否符合camelCase
        if (propName && propName !== propName.toLowerCase() && propName.includes('-')) {
          nonCamelCaseProps.push(propName);
        }
      }
    }
  }

  return nonCamelCaseProps;
}

// 辅助函数：查找缺少类型的props
function findPropsWithoutType(propsDefinition: any): string[] {
  const propsWithoutType = [];

  if (!propsDefinition) return propsWithoutType;

  // 数组形式的props - 所有都没有类型
  if (propsDefinition.type === 'ArrayExpression' && propsDefinition.elements) {
    for (const element of propsDefinition.elements) {
      if (element.type === 'StringLiteral' && element.value) {
        propsWithoutType.push(element.value);
      }
    }
  }

  // 对象形式的props
  if (propsDefinition.type === 'ObjectExpression' && propsDefinition.properties) {
    for (const prop of propsDefinition.properties) {
      if (prop.key && (prop.key.value || prop.key.name)) {
        const propName = prop.key.value || prop.key.name;

        // 检查类型定义
        if (prop.value && prop.value.type !== 'ObjectExpression') {
          // 没有详细类型定义
          propsWithoutType.push(propName);
        }
      }
    }
  }

  return propsWithoutType;
}

// 辅助函数：查找缺少验证的props
function findPropsWithoutValidation(propsDefinition: any): string[] {
  const propsWithoutValidation = [];

  if (
    !propsDefinition ||
    propsDefinition.type !== 'ObjectExpression' ||
    !propsDefinition.properties
  ) {
    return propsWithoutValidation;
  }

  for (const prop of propsDefinition.properties) {
    if (
      prop.key &&
      (prop.key.value || prop.key.name) &&
      prop.value &&
      prop.value.type === 'ObjectExpression'
    ) {
      const propName = prop.key.value || prop.key.name;
      let hasValidation = false;

      // 检查是否有required或default属性
      if (prop.value.properties) {
        for (const subProp of prop.value.properties) {
          if (
            subProp.key &&
            (subProp.key.value === 'required' || subProp.key.value === 'default')
          ) {
            hasValidation = true;
            break;
          }
        }
      }

      if (!hasValidation) {
        propsWithoutValidation.push(propName);
      }
    }
  }

  return propsWithoutValidation;
}

// 辅助函数：查找props直接修改
function findPropMutations(component: any): any[] {
  const propMutations = [];

  // 首先找出所有props的名称
  const propNames = new Set<string>();
  const propsDefinition = findPropsDefinition(component);

  if (propsDefinition) {
    // 数组形式的props
    if (propsDefinition.type === 'ArrayExpression' && propsDefinition.elements) {
      for (const element of propsDefinition.elements) {
        if (element.type === 'StringLiteral' && element.value) {
          propNames.add(element.value);
        }
      }
    }

    // 对象形式的props
    if (propsDefinition.type === 'ObjectExpression' && propsDefinition.properties) {
      for (const prop of propsDefinition.properties) {
        if (prop.key && (prop.key.value || prop.key.name)) {
          propNames.add(prop.key.value || prop.key.name);
        }
      }
    }
  }

  // 查找直接修改props的情况
  traverseNode(component, (node) => {
    if (
      node.type === 'AssignmentExpression' &&
      node.left &&
      node.left.type === 'MemberExpression' &&
      node.left.object &&
      node.left.object.value === 'this' &&
      node.left.property
    ) {
      // 检查是否是props属性
      if (
        node.left.property.type === 'MemberExpression' &&
        node.left.property.object &&
        node.left.property.object.value === '$props' &&
        node.left.property.property &&
        (node.left.property.property.value || node.left.property.property.name)
      ) {
        propMutations.push({
          propName: node.left.property.property.value || node.left.property.property.name,
          node: node,
          location: node.span
            ? {
                filePath: 'current-file',
                startLine: node.span.start.line,
                startColumn: node.span.start.column,
                endLine: node.span.end.line,
                endColumn: node.span.end.column,
              }
            : null,
        });
      }

      // 检查是否直接访问prop名称
      else if (node.left.property && (node.left.property.value || node.left.property.name)) {
        const propName = node.left.property.value || node.left.property.name;

        if (propNames.has(propName)) {
          propMutations.push({
            propName: propName,
            node: node,
            location: node.span
              ? {
                  filePath: 'current-file',
                  startLine: node.span.start.line,
                  startColumn: node.span.start.column,
                  endLine: node.span.end.line,
                  endColumn: node.span.end.column,
                }
              : null,
          });
        }
      }
    }
  });

  return propMutations;
}

// 辅助函数：查找计算属性直接修改
function findComputedMutations(component: any): any[] {
  const computedMutations = [];

  // 首先找出所有计算属性的名称
  const computedNames = new Set<string>();

  if (component && component.properties) {
    for (const prop of component.properties) {
      if (
        prop.key &&
        (prop.key.value === 'computed' || prop.key.name === 'computed') &&
        prop.value &&
        prop.value.type === 'ObjectExpression' &&
        prop.value.properties
      ) {
        for (const computedProp of prop.value.properties) {
          if (computedProp.key && (computedProp.key.value || computedProp.key.name)) {
            computedNames.add(computedProp.key.value || computedProp.key.name);
          }
        }
      }
    }
  }

  // 查找直接修改计算属性的情况
  traverseNode(component, (node) => {
    if (
      node.type === 'AssignmentExpression' &&
      node.left &&
      node.left.type === 'MemberExpression' &&
      node.left.object &&
      node.left.object.value === 'this' &&
      node.left.property &&
      (node.left.property.value || node.left.property.name)
    ) {
      const propName = node.left.property.value || node.left.property.name;

      if (computedNames.has(propName)) {
        computedMutations.push({
          propName: propName,
          node: node,
          location: node.span
            ? {
                filePath: 'current-file',
                startLine: node.span.start.line,
                startColumn: node.span.start.column,
                endLine: node.span.end.line,
                endColumn: node.span.end.column,
              }
            : null,
        });
      }
    }
  });

  return computedMutations;
}

// 辅助函数：通用节点遍历
function traverseNode(node: any, callback: (node: any) => void) {
  if (!node) return;

  callback(node);

  // 递归遍历子节点
  for (const key in node) {
    if (node[key] && typeof node[key] === 'object') {
      traverseNode(node[key], callback);
    } else if (Array.isArray(node[key])) {
      for (const item of node[key]) {
        if (item && typeof item === 'object') {
          traverseNode(item, callback);
        }
      }
    }
  }
}

// 导出Vue组件规则
const vueComponentRules: IRule = {
  id: 'vue/component-rules',
  name: 'Vue组件规则检测',
  description: '检测Vue组件中的常见问题和最佳实践',
  category: RuleCategory.BEST_PRACTICE,
  severity: RuleSeverity.HIGH,
  frameworks: [Framework.VUE],

  // 规则检测函数
  detect: (ast: TAST, context: TRuleContext): TRuleResult[] => {
    // 组合所有检测结果
    return [
      ...checkLifecycleEffects(ast, context),
      ...checkComponentProps(ast, context),
      ...checkDataMutations(ast, context),
    ];
  },
};

export default vueComponentRules;
