export function pastedMcpUrl(query: string): URL | undefined {
  const text = query.trim();
  if (!/^https:\/\//i.test(text)) return undefined;
  try {
    const url = new URL(text);
    return url.username === '' && url.password === '' ? url : undefined;
  } catch {
    return undefined;
  }
}

export function composioKeyProblem(
  key: string,
): 'connectors.composio.consumerKey' | 'connectors.composio.userKey' | undefined {
  const text = key.trim().toLowerCase();
  if (text.startsWith('ck_')) return 'connectors.composio.consumerKey';
  if (text.startsWith('uak_')) return 'connectors.composio.userKey';
  return undefined;
}
