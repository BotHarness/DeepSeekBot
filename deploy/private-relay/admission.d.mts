export const BROWSER_ADMISSION_PROTOCOL: 'botharness-private-channel-v1';
export function browserAdmissionProtocols(token: string): string[];
export function privateAdmissionFromHeaders(
  authorization: unknown,
  admission: unknown,
  protocol: unknown,
): { token: string; protocol?: typeof BROWSER_ADMISSION_PROTOCOL } | undefined;
export function consumeBrowserAdmission(
  value: unknown,
): { token: string; protocol: typeof BROWSER_ADMISSION_PROTOCOL } | undefined;
