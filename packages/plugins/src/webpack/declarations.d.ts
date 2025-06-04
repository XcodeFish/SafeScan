/**
 * Webpack类型声明
 * 解决TypeScript无法找到webpack模块的问题
 */

declare module 'webpack' {
  export interface Compiler {
    hooks: any;
    options: any;
    context: string;
  }

  export interface Compilation {
    assets: any;
    outputOptions: any;
    errors: Error[];
    warnings: Error[];
    modules: any[];
  }

  export interface Stats {
    compilation: Compilation;
    toJson(options?: any): any;
  }
}

declare module 'open' {
  function open(target: string, options?: any): Promise<any>;
  export = open;
}
