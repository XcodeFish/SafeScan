declare module '@rollup/pluginutils' {
  export function createFilter(
    include?: Array<string | RegExp> | string | RegExp | null,
    exclude?: Array<string | RegExp> | string | RegExp | null,
    options?: { resolve?: string | false | null }
  ): (id: string | unknown) => boolean;
}
