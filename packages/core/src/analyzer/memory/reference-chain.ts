/**
 * 引用链溯源系统
 * 提供对内存泄漏的引用链追踪和分析功能
 */
import {
  IMemoryObject,
  IMemoryReference,
  TMemorySnapshot,
  MemoryObjectType,
  analyzeReferenceChain,
} from './snapshot';

/**
 * 引用链类型
 */
export enum ReferenceChainType {
  DOM_CHAIN = 'dom_chain', // DOM节点链
  EVENT_CHAIN = 'event_chain', // 事件监听器链
  CLOSURE_CHAIN = 'closure_chain', // 闭包链
  COMPONENT_CHAIN = 'component_chain', // 组件链
  TIMER_CHAIN = 'timer_chain', // 定时器链
  STORE_CHAIN = 'store_chain', // 存储链
  MIXED_CHAIN = 'mixed_chain', // 混合链
}

/**
 * 引用链信息
 */
export interface IReferenceChainInfo {
  /** 引用链ID */
  id: string;
  /** 引用链类型 */
  type: ReferenceChainType;
  /** 从根对象到泄漏对象的路径 */
  path: IMemoryReference[];
  /** 包含在路径中的对象 */
  objects: IMemoryObject[];
  /** 路径长度 */
  length: number;
  /** 根对象 */
  root: IMemoryObject;
  /** 泄漏对象 */
  leakObject: IMemoryObject;
  /** 关键节点(如果有) */
  keyNodes?: IMemoryObject[];
  /** 解释文本 */
  explanation?: string;
  /** 抽象路径描述 */
  abstractPath?: string;
  /** 修复建议 */
  fixSuggestion?: string;
}

/**
 * 引用链溯源配置
 */
export interface IReferenceChainConfig {
  /** 最大路径长度 */
  maxPathLength?: number;
  /** 最大路径数量 */
  maxPaths?: number;
  /** 是否包含循环引用 */
  includeCycles?: boolean;
  /** 是否包含弱引用 */
  includeWeakReferences?: boolean;
  /** 是否简化路径 */
  simplifyPaths?: boolean;
  /** 是否识别关键节点 */
  identifyKeyNodes?: boolean;
  /** 是否生成抽象路径 */
  generateAbstractPath?: boolean;
  /** 是否生成修复建议 */
  generateFixSuggestions?: boolean;
}

// 默认引用链配置
const DEFAULT_REFERENCE_CHAIN_CONFIG: IReferenceChainConfig = {
  maxPathLength: 50,
  maxPaths: 10,
  includeCycles: true,
  includeWeakReferences: false,
  simplifyPaths: true,
  identifyKeyNodes: true,
  generateAbstractPath: true,
  generateFixSuggestions: true,
};

/**
 * 跟踪对象的引用链
 * @param objectId 目标对象ID
 * @param snapshot 内存快照
 * @param config 引用链配置
 * @returns 引用链信息数组
 */
export function traceReferenceChains(
  objectId: string,
  snapshot: TMemorySnapshot,
  config: IReferenceChainConfig = DEFAULT_REFERENCE_CHAIN_CONFIG
): IReferenceChainInfo[] {
  // 获取基础引用链
  const referencePaths = analyzeReferenceChain(objectId, snapshot);

  if (!referencePaths || referencePaths.length === 0) {
    return [];
  }

  // 限制路径长度和数量
  let filteredPaths = referencePaths
    .filter((path) => (config.maxPathLength ? path.length <= config.maxPathLength : true))
    .slice(0, config.maxPaths || 10);

  // 如果启用了路径简化，简化路径
  if (config.simplifyPaths) {
    filteredPaths = simplifyReferencePaths(filteredPaths, snapshot);
  }

  // 将基础引用路径转换为详细的引用链信息
  return filteredPaths.map((path, index) => {
    // 获取路径中的所有对象
    const objects = getObjectsFromPath(path, snapshot);

    // 获取根对象和泄漏对象
    const root = objects[0];
    const leakObject = objects[objects.length - 1];

    // 确定引用链类型
    const type = determineReferenceChainType(objects);

    // 识别关键节点
    const keyNodes = config.identifyKeyNodes ? identifyKeyNodes(objects, type) : undefined;

    // 生成路径解释
    const explanation = generatePathExplanation(path, objects, type);

    // 生成抽象路径
    const abstractPath = config.generateAbstractPath
      ? generateAbstractPath(path, objects)
      : undefined;

    // 生成修复建议
    const fixSuggestion = config.generateFixSuggestions
      ? generateFixSuggestion(type, objects)
      : undefined;

    // 创建引用链信息
    return {
      id: `chain-${index}-${objectId.substring(0, 8)}`,
      type,
      path,
      objects,
      length: path.length,
      root,
      leakObject,
      keyNodes,
      explanation,
      abstractPath,
      fixSuggestion,
    };
  });
}

/**
 * 从引用路径获取对象
 * @param path 引用路径
 * @param snapshot 内存快照
 * @returns 对象数组
 */
function getObjectsFromPath(path: IMemoryReference[], snapshot: TMemorySnapshot): IMemoryObject[] {
  const objects: IMemoryObject[] = [];

  if (path.length === 0) {
    return objects;
  }

  // 添加第一个引用的源对象
  const firstSourceId = path[0].sourceId;
  const firstSourceObj = snapshot.objects.find((obj) => obj.id === firstSourceId);
  if (firstSourceObj) {
    objects.push(firstSourceObj);
  }

  // 添加每个引用的目标对象
  for (const ref of path) {
    const targetObj = snapshot.objects.find((obj) => obj.id === ref.targetId);
    if (targetObj) {
      objects.push(targetObj);
    }
  }

  return objects;
}

/**
 * 确定引用链类型
 * @param objects 对象数组
 * @returns 引用链类型
 */
function determineReferenceChainType(objects: IMemoryObject[]): ReferenceChainType {
  // 计算各类型对象的数量
  const typeCounts = {
    [MemoryObjectType.DOM_NODE]: 0,
    [MemoryObjectType.EVENT_LISTENER]: 0,
    [MemoryObjectType.CLOSURE]: 0,
    [MemoryObjectType.COMPONENT_INSTANCE]: 0,
    [MemoryObjectType.TIMER]: 0,
  };

  for (const obj of objects) {
    if (obj.type in typeCounts) {
      typeCounts[obj.type as keyof typeof typeCounts]++;
    }
  }

  // 根据数量确定类型
  if (
    typeCounts[MemoryObjectType.DOM_NODE] > 0 &&
    typeCounts[MemoryObjectType.DOM_NODE] >= objects.length / 3
  ) {
    return ReferenceChainType.DOM_CHAIN;
  }

  if (typeCounts[MemoryObjectType.EVENT_LISTENER] > 0) {
    return ReferenceChainType.EVENT_CHAIN;
  }

  if (
    typeCounts[MemoryObjectType.CLOSURE] > 0 &&
    typeCounts[MemoryObjectType.CLOSURE] >= objects.length / 3
  ) {
    return ReferenceChainType.CLOSURE_CHAIN;
  }

  if (typeCounts[MemoryObjectType.COMPONENT_INSTANCE] > 0) {
    return ReferenceChainType.COMPONENT_CHAIN;
  }

  if (typeCounts[MemoryObjectType.TIMER] > 0) {
    return ReferenceChainType.TIMER_CHAIN;
  }

  // 检查是否有存储相关对象
  const hasStoreObjects = objects.some(
    (obj) =>
      obj.name?.includes('store') ||
      obj.name?.includes('Store') ||
      obj.name?.includes('context') ||
      obj.name?.includes('Context')
  );

  if (hasStoreObjects) {
    return ReferenceChainType.STORE_CHAIN;
  }

  return ReferenceChainType.MIXED_CHAIN;
}

/**
 * 识别引用链中的关键节点
 * @param objects 对象数组
 * @param chainType 引用链类型
 * @returns 关键节点数组
 */
function identifyKeyNodes(
  objects: IMemoryObject[],
  chainType: ReferenceChainType
): IMemoryObject[] {
  const keyNodes: IMemoryObject[] = [];

  // 根据不同的链类型识别关键节点
  switch (chainType) {
    case ReferenceChainType.DOM_CHAIN:
      // 识别DOM树中的根元素和叶子节点
      keyNodes.push(...objects.filter((obj) => obj.type === MemoryObjectType.DOM_NODE));
      break;

    case ReferenceChainType.EVENT_CHAIN:
      // 识别事件监听器和相关DOM节点
      keyNodes.push(
        ...objects.filter(
          (obj) =>
            obj.type === MemoryObjectType.EVENT_LISTENER || obj.type === MemoryObjectType.DOM_NODE
        )
      );
      break;

    case ReferenceChainType.CLOSURE_CHAIN:
      // 识别闭包和函数对象
      keyNodes.push(
        ...objects.filter(
          (obj) => obj.type === MemoryObjectType.CLOSURE || obj.type === MemoryObjectType.FUNCTION
        )
      );
      break;

    case ReferenceChainType.COMPONENT_CHAIN:
      // 识别组件实例
      keyNodes.push(...objects.filter((obj) => obj.type === MemoryObjectType.COMPONENT_INSTANCE));
      break;

    case ReferenceChainType.TIMER_CHAIN:
      // 识别定时器和相关闭包
      keyNodes.push(
        ...objects.filter(
          (obj) => obj.type === MemoryObjectType.TIMER || obj.type === MemoryObjectType.CLOSURE
        )
      );
      break;

    case ReferenceChainType.STORE_CHAIN:
      // 识别存储相关对象
      keyNodes.push(
        ...objects.filter(
          (obj) =>
            obj.name?.includes('store') ||
            obj.name?.includes('Store') ||
            obj.name?.includes('context') ||
            obj.name?.includes('Context')
        )
      );
      break;

    default:
      // 默认识别大型对象和有名称的对象
      keyNodes.push(
        ...objects.filter(
          (obj) =>
            obj.size > 1024 * 10 || // 10KB以上的对象
            (obj.name && obj.name.length > 0)
        )
      );
  }

  // 如果没有找到关键节点，至少包括根对象和泄漏对象
  if (keyNodes.length === 0 && objects.length >= 2) {
    keyNodes.push(objects[0], objects[objects.length - 1]);
  }

  return keyNodes;
}

/**
 * 生成引用路径解释
 * @param path 引用路径
 * @param objects 对象数组
 * @param chainType 引用链类型
 * @returns 路径解释文本
 */
function generatePathExplanation(
  path: IMemoryReference[],
  objects: IMemoryObject[],
  chainType: ReferenceChainType
): string {
  if (path.length === 0 || objects.length === 0) {
    return '无法生成引用路径解释';
  }

  const rootObj = objects[0];
  const leakObj = objects[objects.length - 1];

  let componentNames = '';

  // 根据不同的链类型生成不同的解释
  switch (chainType) {
    case ReferenceChainType.DOM_CHAIN:
      return `从${rootObj.name || 'DOM根元素'}通过DOM树引用链连接到${leakObj.name || '目标DOM节点'}，形成了内存泄漏。这可能是由于DOM节点在组件卸载后仍然保留在文档树外部。`;

    case ReferenceChainType.EVENT_CHAIN:
      return `从${rootObj.name || '根对象'}通过事件监听器引用链连接到${leakObj.name || '目标对象'}，形成了内存泄漏。这通常是由于卸载组件后未移除事件监听器导致的。`;

    case ReferenceChainType.CLOSURE_CHAIN:
      return `从${rootObj.name || '根对象'}通过闭包引用链连接到${leakObj.name || '目标对象'}，形成了内存泄漏。这可能是由于函数闭包捕获了不应该长期保留的变量。`;

    case ReferenceChainType.COMPONENT_CHAIN:
      componentNames = objects
        .filter((obj) => obj.type === MemoryObjectType.COMPONENT_INSTANCE)
        .map((obj) => obj.componentName || '未命名组件')
        .join(' -> ');
      return `从${rootObj.name || '根对象'}通过组件引用链 ${componentNames} 连接到${leakObj.name || '目标对象'}，形成了内存泄漏。这可能是由于组件间的引用未正确清理。`;

    case ReferenceChainType.TIMER_CHAIN:
      return `从${rootObj.name || '根对象'}通过定时器引用链连接到${leakObj.name || '目标对象'}，形成了内存泄漏。这通常是由于组件卸载后未清除定时器导致的。`;

    case ReferenceChainType.STORE_CHAIN:
      return `从${rootObj.name || '根对象'}通过存储引用链连接到${leakObj.name || '目标对象'}，形成了内存泄漏。这可能是由于全局状态存储中保留了组件实例或DOM节点引用。`;

    default:
      return `从${rootObj.name || '根对象'}通过${path.length}步引用连接到${leakObj.name || '目标对象'}，形成了内存泄漏。`;
  }
}

/**
 * 生成抽象路径表示
 * @param path 引用路径
 * @param objects 对象数组
 * @returns 抽象路径字符串
 */
function generateAbstractPath(path: IMemoryReference[], objects: IMemoryObject[]): string {
  if (path.length === 0) {
    return '';
  }

  const segments: string[] = [];

  // 添加根对象表示
  const rootObj = objects[0];
  segments.push(objectToAbstractString(rootObj));

  // 添加引用路径
  for (let i = 0; i < path.length; i++) {
    const ref = path[i];
    const targetObj = objects[i + 1];

    if (ref.name) {
      segments.push(`.${ref.name}`);
    } else {
      segments.push(`.[${i}]`);
    }

    if (targetObj) {
      segments.push(`(${objectToAbstractString(targetObj)})`);
    }
  }

  return segments.join('');
}

/**
 * 将对象转换为抽象字符串表示
 * @param obj 内存对象
 * @returns 抽象字符串
 */
function objectToAbstractString(obj: IMemoryObject): string {
  switch (obj.type) {
    case MemoryObjectType.DOM_NODE:
      return obj.name || 'DOMNode';

    case MemoryObjectType.COMPONENT_INSTANCE:
      return obj.componentName || 'Component';

    case MemoryObjectType.EVENT_LISTENER:
      return `EventListener(${obj.name || 'unknown'})`;

    case MemoryObjectType.TIMER:
      return `Timer(${obj.metadata?.interval ? 'interval' : 'timeout'})`;

    case MemoryObjectType.CLOSURE:
      return `Closure(${obj.name || 'anonymous'})`;

    case MemoryObjectType.FUNCTION:
      return `Function(${obj.name || 'anonymous'})`;

    case MemoryObjectType.ARRAY:
      return `Array[${obj.metadata?.length || '?'}]`;

    case MemoryObjectType.MAP:
      return `Map(${obj.metadata?.size || '?'})`;

    case MemoryObjectType.SET:
      return `Set(${obj.metadata?.size || '?'})`;

    default:
      return obj.name || obj.type;
  }
}

/**
 * 生成修复建议
 * @param chainType 引用链类型
 * @param objects 对象数组
 * @returns 修复建议
 */
function generateFixSuggestion(chainType: ReferenceChainType, objects: IMemoryObject[]): string {
  let hasDeps = false;
  let hasTimers = false;
  let hasEventListeners = false;
  let hasClosures = false;

  switch (chainType) {
    case ReferenceChainType.DOM_CHAIN:
      return '确保在组件卸载时删除或分离所有创建的DOM节点。检查是否有元素被添加到document.body而没有正确移除。';

    case ReferenceChainType.EVENT_CHAIN:
      return '在组件的卸载钩子(如componentWillUnmount或useEffect的清理函数)中移除所有添加的事件监听器，特别是添加到window或document的监听器。';

    case ReferenceChainType.CLOSURE_CHAIN:
      hasDeps = objects.some(
        (obj) =>
          obj.type === MemoryObjectType.CLOSURE &&
          obj.metadata?.reactHook &&
          obj.metadata?.reactHook.includes('useEffect')
      );

      if (hasDeps) {
        return '检查useEffect、useMemo或useCallback的依赖数组是否完整。确保捕获的所有变量都被正确列在依赖数组中，或考虑使用useRef存储可变值。';
      }

      return '检查闭包是否捕获了大型对象或组件实例。考虑使用弱引用或在不需要时解除引用。';

    case ReferenceChainType.COMPONENT_CHAIN:
      return '检查组件之间的引用关系，避免将子组件实例存储在父组件状态中。如需跨组件通信，考虑使用Context API或状态管理库，而不是直接引用组件实例。';

    case ReferenceChainType.TIMER_CHAIN:
      return '在组件卸载时(componentWillUnmount或useEffect的清理函数)清除所有定时器(clearTimeout/clearInterval)。对于setInterval尤其重要，因为它会反复执行。';

    case ReferenceChainType.STORE_CHAIN:
      return '避免在全局状态存储(如Redux store、Context等)中存储非序列化数据，尤其是组件实例或DOM节点。检查存储中是否包含大型对象引用，必要时使用选择器进行数据过滤。';

    default:
      // 检查是否有特定类型的对象可以提供更具体的建议
      hasTimers = objects.some((obj) => obj.type === MemoryObjectType.TIMER);
      if (hasTimers) {
        return '确保清除所有创建的定时器。';
      }

      hasEventListeners = objects.some((obj) => obj.type === MemoryObjectType.EVENT_LISTENER);
      if (hasEventListeners) {
        return '确保移除所有添加的事件监听器。';
      }

      hasClosures = objects.some((obj) => obj.type === MemoryObjectType.CLOSURE);
      if (hasClosures) {
        return '检查闭包捕获的变量，避免不必要的对象引用。';
      }

      return '检查并清理长期存活的对象引用。对于不再需要的资源，确保将其引用设为null，让垃圾回收器可以回收它们。';
  }
}

/**
 * 简化引用路径，移除不必要的中间节点
 * @param paths 引用路径数组
 * @param snapshot 内存快照
 * @returns 简化后的路径数组
 */
function simplifyReferencePaths(
  paths: IMemoryReference[][],
  snapshot: TMemorySnapshot
): IMemoryReference[][] {
  return paths.map((path) => {
    // 如果路径很短，不需要简化
    if (path.length <= 3) {
      return path;
    }

    const simplified: IMemoryReference[] = [];
    const keyIndices = new Set<number>();

    // 总是保留第一个和最后一个引用
    keyIndices.add(0);
    keyIndices.add(path.length - 1);

    // 识别关键引用
    for (let i = 1; i < path.length - 1; i++) {
      const ref = path[i];
      const targetObj = snapshot.objects.find((obj) => obj.id === ref.targetId);

      if (!targetObj) continue;

      // 保留具有重要类型的对象
      const isKeyType = [
        MemoryObjectType.DOM_NODE,
        MemoryObjectType.COMPONENT_INSTANCE,
        MemoryObjectType.EVENT_LISTENER,
        MemoryObjectType.TIMER,
        MemoryObjectType.CLOSURE,
      ].includes(targetObj.type);

      // 保留有名称的引用
      const hasName = ref.name && ref.name.length > 0;

      // 保留大型对象
      const isLarge = targetObj.size > 1024 * 10; // 10KB

      if (isKeyType || hasName || isLarge) {
        keyIndices.add(i);
      }
    }

    // 添加一些中间节点以避免跳跃太大
    const indices = [...keyIndices].sort((a, b) => a - b);
    for (let i = 0; i < indices.length - 1; i++) {
      const start = indices[i];
      const end = indices[i + 1];

      // 如果两个关键节点间隔太大，添加一个中间节点
      if (end - start > 10) {
        const middle = Math.floor((start + end) / 2);
        keyIndices.add(middle);
      }
    }

    // 构建简化路径
    const sortedIndices = [...keyIndices].sort((a, b) => a - b);
    let lastIndex = -1;

    for (const index of sortedIndices) {
      // 添加省略标记
      if (lastIndex >= 0 && index - lastIndex > 1) {
        // 创建一个表示省略部分的引用
        const skippedCount = index - lastIndex - 1;
        simplified.push({
          sourceId: path[lastIndex].targetId,
          targetId: path[index].sourceId,
          name: `[...跳过了${skippedCount}个引用]`,
          type: 'skipped',
        });
      }

      // 添加当前引用
      simplified.push(path[index]);
      lastIndex = index;
    }

    return simplified;
  });
}

/**
 * 生成引用链可视化数据
 * @param chains 引用链信息数组
 * @returns 可视化数据
 */
export function generateReferenceChainVisualization(chains: IReferenceChainInfo[]): any {
  // 这里返回的是可用于可视化库(如d3.js)的数据结构
  // 实际实现会根据项目使用的可视化库而定
  return chains.map((chain) => {
    const nodes = chain.objects.map((obj) => ({
      id: obj.id,
      type: obj.type,
      name: obj.name || obj.type,
      size: obj.size,
      isKeyNode: chain.keyNodes?.some((node) => node.id === obj.id) || false,
    }));

    const links = chain.path.map((ref) => ({
      source: ref.sourceId,
      target: ref.targetId,
      name: ref.name,
      type: ref.type,
    }));

    return {
      id: chain.id,
      type: chain.type,
      nodes,
      links,
      explanation: chain.explanation,
      abstractPath: chain.abstractPath,
      fixSuggestion: chain.fixSuggestion,
    };
  });
}
