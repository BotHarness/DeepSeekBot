export function fixtureExpression(
  mode: string,
  state: {
    config: { environment: string };
    userId: string;
    instanceRole?: 'admin' | 'user';
    accessToken?: string;
    refreshToken?: string;
  },
): string;
export function targetSocket(
  target:
    | {
        deviceName: string;
        appId: string;
        webSocketDebuggerUrl: string;
      }
    | undefined,
  port: number,
  simulatorName: string,
): URL;

export function connect(
  port: number,
  targetId: string,
  simulatorName: string,
): Promise<{ send(method: string, params: Record<string, unknown>): Promise<any>; close(): void }>;
