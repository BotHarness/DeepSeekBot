import { isPrivateRoute } from './route';
import { teamRecord as record } from './team-invitation';

export interface PrivateAdmission {
  origin: string;
  token: string;
  additionalOrigins?: string[];
}

export interface HostEncryption {
  privateRelay?: PrivateAdmission;
  loopback?: 'encrypted';
  protocol: 'connect-noise-xk-v1';
  hostKey: string;
  deviceKey: string;
}

export function parsePrivateAdmission(input: unknown): PrivateAdmission | undefined {
  const value = record(input);
  if (
    typeof value['origin'] !== 'string' ||
    typeof value['token'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['token'])
  )
    return;
  try {
    const url = new URL(value['origin']);
    if (
      !isPrivateRoute(url.origin) ||
      url.protocol !== 'https:' ||
      url.origin !== value['origin'] ||
      url.username ||
      url.password
    )
      return;
    const additional = value['additionalOrigins'];
    if (
      additional !== undefined &&
      (!Array.isArray(additional) ||
        additional.length > 1 ||
        additional.some((origin) => {
          if (typeof origin !== 'string' || origin === url.origin) return true;
          try {
            const extra = new URL(origin);
            return (
              extra.origin !== origin ||
              !isPrivateRoute(origin) ||
              extra.protocol !== 'https:' ||
              !!extra.username ||
              !!extra.password
            );
          } catch {
            return true;
          }
        }))
    )
      return;
    return {
      origin: url.origin,
      token: value['token'],
      ...(Array.isArray(additional) && additional.length ? { additionalOrigins: additional } : {}),
    };
  } catch {
    return;
  }
}
