export interface ConnectionRpcLike {
  call(
    path: string,
    method: string,
    options?: { args?: unknown },
  ): Promise<{ ok: boolean; value?: unknown; error?: { message?: string } }>;
}

export function setBrowserAccess(rpc: ConnectionRpcLike, botSlug: string, next: boolean) {
  return rpc.call('/api', 'botharness/browserAccessSet', {
    args: { slug: botSlug, enabled: next },
  });
}

export function setBrowserProfile(rpc: ConnectionRpcLike, botSlug: string, next: string) {
  return rpc.call('/api', 'botharness/browserProfileSet', {
    args: { slug: botSlug, profile: next },
  });
}
