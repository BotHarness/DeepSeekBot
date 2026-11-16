import type { ManagedTlsIngress } from '../../src/devices/managed-tls-ingress.js';

export function fixedIngress(port: number): ManagedTlsIngress {
  return { port: () => port, start: async () => port, close: async () => {} };
}
