export interface ConnectionRpcLike {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false; readonly error: { readonly message?: string } }
  >;
}

export function setComputerAccess(rpc: ConnectionRpcLike, botSlug: string, next: boolean) {
  return rpc.call('/api', 'botharness/computerAccessSet', {
    args: { slug: botSlug, enabled: next },
  });
}
