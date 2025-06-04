declare module '@safescan/core' {
  export interface IModuleConfig {
    id?: string;
    enabled?: boolean;
    priority?: number;
    [key: string]: any;
  }

  export enum ModuleEventType {
    READY = 'ready',
    ERROR = 'error',
    WARNING = 'warning',
    INFO = 'info',
    SUCCESS = 'success',
  }
}
