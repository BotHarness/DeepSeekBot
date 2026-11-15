export const BROWSER_ADMISSION_PROTOCOL = 'botharness-private-channel-v1';
const PREFIX = 'botharness-admission.';
const secret = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

export function browserAdmissionProtocols(token) {
  if (!secret(token)) throw new Error('private-admission-invalid');
  return [BROWSER_ADMISSION_PROTOCOL, PREFIX + token];
}

export function consumeBrowserAdmission(value) {
  if (typeof value !== 'string') return;
  const protocols = value.split(',').map((part) => part.trim());
  if (protocols.length !== 2 || protocols[0] !== BROWSER_ADMISSION_PROTOCOL) return;
  const token = protocols[1]?.startsWith(PREFIX) ? protocols[1].slice(PREFIX.length) : undefined;
  return secret(token) ? { token, protocol: BROWSER_ADMISSION_PROTOCOL } : undefined;
}

export function privateAdmissionFromHeaders(authorization, admission, protocol) {
  const tokens = [];
  if (authorization !== undefined) {
    if (typeof authorization !== 'string') return;
    const token = /^Bearer ([a-f0-9]{64})$/u.exec(authorization)?.[1];
    if (!token) return;
    tokens.push(token);
  }
  if (admission !== undefined) {
    if (!secret(admission)) return;
    tokens.push(admission);
  }
  const browser = consumeBrowserAdmission(protocol);
  if (protocol !== undefined && !browser) return;
  if (browser) tokens.push(browser.token);
  const token = tokens[0];
  if (!token || tokens.some((candidate) => candidate !== token)) return;
  return { token, ...(browser ? { protocol: browser.protocol } : {}) };
}
