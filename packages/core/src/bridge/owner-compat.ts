export function isAuthenticatedOwner(peer: unknown, connection: unknown): boolean {
  if (peer === null || typeof peer !== 'object') return false;
  if ('principal' in peer) {
    const principal = peer.principal;
    return (
      principal !== null &&
      typeof principal === 'object' &&
      'kind' in principal &&
      principal.kind === 'owner'
    );
  }
  return (
    connection !== null &&
    typeof connection === 'object' &&
    'operator' in connection &&
    connection.operator === peer
  );
}
