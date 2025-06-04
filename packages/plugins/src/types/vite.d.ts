declare module 'vite' {
  export interface ViteDevServer {
    ws: {
      on(event: string, callback: (data: any, client?: any) => void): void;
      send(payload: { type: string; event: string; data?: any }): void;
    };
  }

  export interface ModuleNode {
    id?: string;
    file?: string;
    importers: Set<ModuleNode>;
    acceptedHmrDeps?: Set<ModuleNode>;
    url?: string;
  }

  export interface HmrContext {
    file: string;
    timestamp: number;
    modules: ModuleNode[];
    server: ViteDevServer;
    read: () => string | Promise<string>;
  }

  export interface Plugin {
    name: string;
    resolveId?: (id: string) => string | null | undefined;
    configureServer?: (server: ViteDevServer) => void | (() => void);
    handleHotUpdate?: (ctx: HmrContext) => Promise<ModuleNode[] | void> | ModuleNode[] | void;
    transformIndexHtml?: (html: string) => { html: string; tags: any[] } | void | string;
    transform?: (
      code: string,
      id: string
    ) => Promise<{ code: string } | null> | { code: string } | null;
  }
}
