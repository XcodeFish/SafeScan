/**
 * 引用链可视化工具
 * 提供友好的引用链可视化方式
 */
import { IReferenceChainInfo, ReferenceChainType } from './reference-chain';

/**
 * 可视化节点类型
 */
export enum VisNodeType {
  ROOT = 'root',
  LEAK = 'leak',
  DOM = 'dom',
  COMPONENT = 'component',
  EVENT = 'event',
  TIMER = 'timer',
  CLOSURE = 'closure',
  STORE = 'store',
  OTHER = 'other',
}

/**
 * 可视化节点
 */
export interface IVisNode {
  /** 节点ID */
  id: string;
  /** 节点类型 */
  type: VisNodeType;
  /** 节点标签 */
  label: string;
  /** 节点大小(字节) */
  size: number;
  /** 额外信息 */
  info?: string;
  /** 是否为关键节点 */
  isKey: boolean;
}

/**
 * 可视化边
 */
export interface IVisEdge {
  /** 边ID */
  id: string;
  /** 源节点ID */
  source: string;
  /** 目标节点ID */
  target: string;
  /** 边标签 */
  label?: string;
  /** 边类型 */
  type: string;
}

/**
 * 可视化数据
 */
export interface IVisData {
  /** 节点数组 */
  nodes: IVisNode[];
  /** 边数组 */
  edges: IVisEdge[];
  /** 标题 */
  title: string;
  /** 说明 */
  description: string;
  /** 修复建议 */
  fixSuggestion?: string;
}

/**
 * 将引用链转换为可视化数据
 * @param chain 引用链信息
 * @returns 可视化数据
 */
export function chainToVisData(chain: IReferenceChainInfo): IVisData {
  const nodes: IVisNode[] = [];
  const edges: IVisEdge[] = [];

  // 创建节点
  chain.objects.forEach((obj, index) => {
    // 确定节点类型
    let type = VisNodeType.OTHER;
    if (index === 0) {
      type = VisNodeType.ROOT;
    } else if (index === chain.objects.length - 1) {
      type = VisNodeType.LEAK;
    } else {
      switch (obj.type) {
        case 'dom_node':
          type = VisNodeType.DOM;
          break;
        case 'component_instance':
          type = VisNodeType.COMPONENT;
          break;
        case 'event_listener':
          type = VisNodeType.EVENT;
          break;
        case 'timer':
          type = VisNodeType.TIMER;
          break;
        case 'closure':
        case 'function':
          type = VisNodeType.CLOSURE;
          break;
      }
    }

    // 添加节点
    nodes.push({
      id: obj.id,
      type,
      label: obj.name || obj.type,
      size: obj.size,
      info: generateNodeInfo(obj),
      isKey: chain.keyNodes?.some((node) => node.id === obj.id) || false,
    });
  });

  // 创建边
  chain.path.forEach((ref, index) => {
    edges.push({
      id: `edge-${index}`,
      source: ref.sourceId,
      target: ref.targetId,
      label: ref.name || undefined,
      type: ref.type || 'reference',
    });
  });

  // 生成标题和描述
  const title = `引用链 (${chainTypeToString(chain.type)})`;
  const description = chain.explanation || '未提供说明';

  return {
    nodes,
    edges,
    title,
    description,
    fixSuggestion: chain.fixSuggestion,
  };
}

/**
 * 将引用链类型转换为可读字符串
 * @param type 引用链类型
 * @returns 可读字符串
 */
function chainTypeToString(type: ReferenceChainType): string {
  switch (type) {
    case ReferenceChainType.DOM_CHAIN:
      return 'DOM引用链';
    case ReferenceChainType.EVENT_CHAIN:
      return '事件监听器链';
    case ReferenceChainType.CLOSURE_CHAIN:
      return '闭包引用链';
    case ReferenceChainType.COMPONENT_CHAIN:
      return '组件引用链';
    case ReferenceChainType.TIMER_CHAIN:
      return '定时器引用链';
    case ReferenceChainType.STORE_CHAIN:
      return '存储引用链';
    case ReferenceChainType.MIXED_CHAIN:
      return '混合引用链';
    default:
      return '未知类型';
  }
}

/**
 * 为节点生成信息
 * @param obj 内存对象
 * @returns 信息字符串
 */
function generateNodeInfo(obj: any): string {
  const info: string[] = [];

  // 添加大小信息
  info.push(`大小: ${formatBytes(obj.size)}`);

  // 添加特定类型信息
  switch (obj.type) {
    case 'component_instance':
      if (obj.componentName) {
        info.push(`组件: ${obj.componentName}`);
      }
      if (obj.metadata?.unmounted) {
        info.push('已卸载');
      }
      break;
    case 'dom_node':
      if (obj.metadata?.tagName) {
        info.push(`标签: ${obj.metadata.tagName}`);
      }
      if (obj.metadata?.detached) {
        info.push('已分离');
      }
      break;
    case 'event_listener':
      if (obj.metadata?.eventType) {
        info.push(`事件: ${obj.metadata.eventType}`);
      }
      break;
    case 'timer':
      if (obj.metadata?.interval) {
        info.push(`间隔: ${obj.metadata.interval}ms`);
      } else {
        info.push('超时');
      }
      break;
    case 'closure':
    case 'function':
      if (obj.metadata?.reactHook) {
        info.push(`Hook: ${obj.metadata.reactHook}`);
      }
      break;
  }

  return info.join(', ');
}

/**
 * 格式化字节数
 * @param bytes 字节数
 * @returns 格式化字符串
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * 生成HTML报告
 * @param visData 可视化数据
 * @returns HTML字符串
 */
export function generateHTMLReport(visData: IVisData): string {
  // 这里可以根据需要定制HTML报告模板
  return `
<!DOCTYPE html>
<html>
<head>
  <title>${visData.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
    .container { max-width: 1200px; margin: 0 auto; }
    .header { margin-bottom: 20px; }
    .visualization { border: 1px solid #ddd; padding: 20px; margin-bottom: 20px; min-height: 500px; }
    .details { margin-top: 20px; }
    .node-list, .edge-list { margin-top: 10px; }
    .node, .edge { padding: 8px; margin: 5px 0; border-radius: 4px; }
    .node { background-color: #f0f0f0; }
    .edge { background-color: #e8f4f8; }
    .root { background-color: #d4edda; }
    .leak { background-color: #f8d7da; }
    .key { border: 2px solid #ffc107; }
    .fix-suggestion { background-color: #fff3cd; padding: 15px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${visData.title}</h1>
      <p>${visData.description}</p>
    </div>
    
    <div class="visualization" id="graph-container">
      <!-- 这里可以集成D3.js或其他可视化库 -->
      <p>引用链可视化 (可集成D3.js等库)</p>
    </div>
    
    <div class="details">
      <h2>节点列表</h2>
      <div class="node-list">
        ${visData.nodes
          .map(
            (node) => `
          <div class="node ${node.type} ${node.isKey ? 'key' : ''}">
            <strong>${node.label}</strong> (${node.id.substring(0, 8)}...)
            <br>${node.info || ''}
          </div>
        `
          )
          .join('')}
      </div>
      
      <h2>引用列表</h2>
      <div class="edge-list">
        ${visData.edges
          .map(
            (edge) => `
          <div class="edge">
            ${edge.label ? `<strong>${edge.label}</strong>: ` : ''}
            ${visData.nodes.find((n) => n.id === edge.source)?.label || edge.source.substring(0, 8)}
            → 
            ${visData.nodes.find((n) => n.id === edge.target)?.label || edge.target.substring(0, 8)}
          </div>
        `
          )
          .join('')}
      </div>
      
      ${
        visData.fixSuggestion
          ? `
        <h2>修复建议</h2>
        <div class="fix-suggestion">
          <p>${visData.fixSuggestion}</p>
        </div>
      `
          : ''
      }
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * 导出为JSON格式
 * @param visData 可视化数据
 * @returns JSON字符串
 */
export function exportToJSON(visData: IVisData): string {
  return JSON.stringify(visData, null, 2);
}
