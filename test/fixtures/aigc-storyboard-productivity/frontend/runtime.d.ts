declare module "@prompt-web/app-runtime" {
  export function invoke(operationId: string, input?: Record<string, unknown>): Promise<unknown>;
}
