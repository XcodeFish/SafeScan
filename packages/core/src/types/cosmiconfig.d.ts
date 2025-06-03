declare module 'cosmiconfig' {
  export interface CosmiconfigResult {
    config: any;
    filepath: string;
    isEmpty?: boolean;
  }

  export interface CosmiconfigOptions {
    searchPlaces?: string[];
    loaders?: Record<string, any>;
    packageProp?: string | string[];
    stopDir?: string;
    cache?: boolean;
    transform?: (result: CosmiconfigResult) => any;
  }

  export function cosmiconfig(
    moduleName: string,
    options?: CosmiconfigOptions
  ): {
    search: (searchFrom?: string) => Promise<CosmiconfigResult | null>;
    load: (filepath: string) => Promise<CosmiconfigResult | null>;
    clearCaches: () => void;
  };
}
