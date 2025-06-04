/**
 * 浏览器覆盖通知模块
 * 实现SafeScan的浏览器通知功能
 */
import type { ViteDevServer } from 'vite';
import type { NotifyMessage } from './types';

// 通知客户端事件名称
export const NOTIFY_CUSTOM_EVENT = 'safescan:notify';

interface OverlayHandler {
  configureServer(server: ViteDevServer): void;
  notify(message: NotifyMessage): void;
}

/**
 * 创建覆盖通知处理器
 * @param options 插件配置选项
 */
export function createOverlayNotify(
  options: ReturnType<typeof import('./options').resolveOptions>
): OverlayHandler {
  // 缓存服务器实例
  let server: ViteDevServer | null = null;

  // 如果覆盖通知被禁用，返回无操作处理器
  if (!options.overlay.enabled) {
    return {
      configureServer: () => {},
      notify: () => {},
    };
  }

  return {
    // 配置开发服务器
    configureServer(s: ViteDevServer) {
      server = s;

      // 注入通知样式和脚本
      const injectCode = generateOverlayCode(options.overlay.position, options.overlay.duration);

      // 注入通知相关的客户端代码
      s.ws.on('connection', () => {
        // 发送初始化事件
        s.ws.send({
          type: 'custom',
          event: 'safescan:overlay-init',
          data: {
            position: options.overlay.position,
            duration: options.overlay.duration,
          },
        });

        // 发送通知的脚本注入命令
        s.ws.send({
          type: 'custom',
          event: 'safescan:inject-overlay',
          data: { code: injectCode },
        });
      });
    },

    // 发送通知
    notify(message: NotifyMessage) {
      if (!server) return;

      server.ws.send({
        type: 'custom',
        event: NOTIFY_CUSTOM_EVENT,
        data: message,
      });
    },
  };
}

/**
 * 生成覆盖代码
 * @param position 通知位置
 * @param duration 通知持续时间
 */
function generateOverlayCode(
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left',
  duration: number
): string {
  // 根据位置生成CSS样式
  const positionStyle = {
    'top-right': 'top: 0; right: 0;',
    'top-left': 'top: 0; left: 0;',
    'bottom-right': 'bottom: 0; right: 0;',
    'bottom-left': 'bottom: 0; left: 0;',
  }[position];

  // 生成客户端代码
  return `
// SafeScan覆盖通知样式和逻辑
;(function() {
  if (window.__SAFESCAN_OVERLAY_INITIALIZED__) return;
  window.__SAFESCAN_OVERLAY_INITIALIZED__ = true;

  // 创建样式
  const style = document.createElement('style');
  style.textContent = \`
    .safescan-notify-container {
      position: fixed;
      ${positionStyle}
      z-index: 9999;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      max-width: 400px;
      max-height: 100vh;
      overflow-y: auto;
    }
    .safescan-notify {
      background-color: #fff;
      color: #333;
      border-radius: 4px;
      padding: 10px 12px;
      box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
      display: flex;
      flex-direction: column;
      pointer-events: auto;
      animation: safescan-notify-in 0.3s ease-out;
      transition: opacity 0.2s ease-out, transform 0.2s ease-out;
    }
    .safescan-notify.removing {
      opacity: 0;
      transform: translateX(10px);
    }
    .safescan-notify-error {
      border-left: 5px solid #ff4d4f;
    }
    .safescan-notify-warning {
      border-left: 5px solid #faad14;
    }
    .safescan-notify-info {
      border-left: 5px solid #1890ff;
    }
    .safescan-notify-success {
      border-left: 5px solid #52c41a;
    }
    .safescan-notify-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 5px;
    }
    .safescan-notify-title {
      font-weight: bold;
      font-size: 14px;
      margin: 0;
    }
    .safescan-notify-close {
      cursor: pointer;
      border: none;
      background: transparent;
      font-size: 16px;
      padding: 0;
      color: #999;
    }
    .safescan-notify-message {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .safescan-notify-source {
      margin-top: 8px;
      font-size: 11px;
      color: #666;
      cursor: pointer;
      text-decoration: underline;
    }
    @keyframes safescan-notify-in {
      from { opacity: 0; transform: translateX(40px); }
      to { opacity: 1; transform: translateX(0); }
    }
  \`;
  document.head.appendChild(style);

  // 创建容器
  const container = document.createElement('div');
  container.className = 'safescan-notify-container';
  document.body.appendChild(container);

  // 通知管理器
  const notifyManager = {
    notifications: new Map(),
    
    // 创建通知
    create(message) {
      // 如果通知已存在，先移除
      if (this.notifications.has(message.id)) {
        this.remove(message.id);
      }
      
      // 创建通知元素
      const el = document.createElement('div');
      el.className = \`safescan-notify safescan-notify-\${message.level}\`;
      el.innerHTML = \`
        <div class="safescan-notify-header">
          <h3 class="safescan-notify-title">\${message.title}</h3>
          <button class="safescan-notify-close">&times;</button>
        </div>
        <p class="safescan-notify-message">\${message.message}</p>
        \${message.file ? \`<div class="safescan-notify-source">\${message.file}\${message.line ? \`:\${message.line}\` : ''}</div>\` : ''}
      \`;
      
      // 添加关闭事件
      const closeBtn = el.querySelector('.safescan-notify-close');
      closeBtn.addEventListener('click', () => this.remove(message.id));
      
      // 如果有文件路径，添加点击跳转功能
      if (message.file) {
        const sourceEl = el.querySelector('.safescan-notify-source');
        sourceEl.addEventListener('click', () => {
          if (message.file) {
            // 向服务器发送打开文件的请求
            if (import.meta.hot) {
              import.meta.hot.send('safescan:open-file', {
                file: message.file,
                line: message.line,
                column: message.column
              });
            }
          }
        });
      }
      
      // 添加到容器
      container.appendChild(el);
      this.notifications.set(message.id, { el, timer: null });
      
      // 设置自动关闭定时器
      if (${duration} > 0) {
        const timer = setTimeout(() => {
          this.remove(message.id);
        }, ${duration});
        
        this.notifications.get(message.id).timer = timer;
      }
      
      return el;
    },
    
    // 移除通知
    remove(id) {
      const notification = this.notifications.get(id);
      if (!notification) return;
      
      // 清除定时器
      if (notification.timer) {
        clearTimeout(notification.timer);
      }
      
      // 添加移除动画
      notification.el.classList.add('removing');
      
      // 动画完成后删除元素
      setTimeout(() => {
        if (notification.el.parentNode) {
          notification.el.parentNode.removeChild(notification.el);
        }
        this.notifications.delete(id);
      }, 200);
    },
    
    // 清除所有通知
    clear() {
      for (const [id] of this.notifications) {
        this.remove(id);
      }
    }
  };
  
  // 全局暴露通知API
  window.__SAFESCAN_NOTIFY__ = {
    show: (message) => notifyManager.create(message),
    remove: (id) => notifyManager.remove(id),
    clear: () => notifyManager.clear()
  };
  
  // 监听通知事件
  if (import.meta.hot) {
    import.meta.hot.on('${NOTIFY_CUSTOM_EVENT}', (message) => {
      notifyManager.create(message);
    });
  }
})();
  `;
}
