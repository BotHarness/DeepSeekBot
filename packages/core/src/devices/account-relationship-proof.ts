import { createHash } from 'node:crypto';
import { z } from 'zod';

const identity = z
  .object({
    registrationId: z.string().regex(/^h[a-z2-7]{12}$/u),
    hostId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u),
    publicKey: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

export const accountRelationshipProofSchema = z
  .object({
    purpose: z.literal('account-host-relationship-v1'),
    relationshipId: z.string().regex(/^[A-Za-z0-9_-]{32}$/u),
    source: identity,
    target: identity,
    expiresAt: z.number().int(),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
  })
  .strict();
export type AccountRelationshipProof = z.infer<typeof accountRelationshipProofSchema>;

export function accountRelationshipVerifier(input: AccountRelationshipProof): string {
  const proof = accountRelationshipProofSchema.parse(input);
  const value = (peer: AccountRelationshipProof['source']) => [
    peer.registrationId,
    peer.hostId,
    peer.publicKey,
  ];
  return createHash('sha256')
    .update(
      JSON.stringify([
        proof.purpose,
        proof.relationshipId,
        value(proof.source),
        value(proof.target),
        proof.expiresAt,
        proof.nonce,
      ]),
    )
    .digest('base64url');
}
