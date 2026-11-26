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
