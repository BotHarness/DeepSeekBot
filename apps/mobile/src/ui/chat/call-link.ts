const CALL_LINK = /^(?:[a-z][a-z0-9+.-]*:)?\/*call\/([^/?#]+)/iu;

export function callLinkRedirect(path: string, allowDirectCall: boolean): string | undefined {
  const match = CALL_LINK.exec(path);
  if (match === null || allowDirectCall) return undefined;
  return `/dm/${match[1]}`;
}
