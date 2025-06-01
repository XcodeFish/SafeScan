// 解决第三方库类型问题
declare module 'glob' {
  export function globSync(pattern: string, options?: any): string[];
}

declare module 'esbuild' {
  export function build(options: any): Promise<any>;
}

declare module 'chalk' {
  interface ChalkFunction {
    (text: string): string;
    bold: ChalkFunction;
    blue: ChalkFunction;
    green: ChalkFunction;
    red: ChalkFunction;
    yellow: ChalkFunction;
    cyan: ChalkFunction;
    [key: string]: ChalkFunction;
  }
  
  const chalk: ChalkFunction;
  export default chalk;
}
