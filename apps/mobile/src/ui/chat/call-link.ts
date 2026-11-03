const CALL_LINK = /^(?:[a-z][a-z0-9+.-]*:)?\/*call\/([^/?#]+)(?:\?([^#]*))?/iu;

export function callLinkRedirect(path: string, allowDirectCall: boolean): string | undefined {
  const match = CALL_LINK.exec(path);
  if (match === null || allowDirectCall) return undefined;
  const hostId = new URLSearchParams(match[2] ?? '').get('hostId');
  return hostId === null || hostId === ''
    ? `/dm/${match[1]}`
    : `/dm/${match[1]}?hostId=${encodeURIComponent(hostId)}`;
}
