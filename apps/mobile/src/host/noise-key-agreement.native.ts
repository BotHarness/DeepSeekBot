import { scalarMultBase, sharedKey } from '@stablelib/x25519';
import type { NoiseKeyAgreement } from '../../../../packages/core/src/devices/noise/xk';

export const noiseKeyAgreement: NoiseKeyAgreement = {
  publicKey(privateKey) {
    if (privateKey.length !== 32) throw new Error('noise-key-invalid');
    return scalarMultBase(privateKey);
  },
  sharedSecret: (privateKey, publicKey) => sharedKey(privateKey, publicKey, true),
};
