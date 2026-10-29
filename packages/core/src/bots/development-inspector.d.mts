export function targetSocket(
  target: { deviceName: string; appId: string; webSocketDebuggerUrl: string } | undefined,
  port: number,
  deviceName: string,
): URL;
export function connect(
  port: number,
  targetId: string,
  deviceName: string,
): Promise<{
  send(method: string, params: Record<string, unknown>): Promise<{ result?: { value?: unknown } }>;
  evaluateAsync(expression: string): Promise<unknown>;
  close(): void;
}>;
