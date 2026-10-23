export function marketplaceReadmeLink(
  href: string,
  source: { repositoryUrl: string; commit: string | null },
): string | undefined {
  const value = href.trim();
  if (!value) return undefined;
  try {
    const target = new URL(value, 'https://marketplace-readme.invalid/');
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return undefined;
    if (target.origin !== 'https://marketplace-readme.invalid') return target.href;
    if (!source.commit || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(source.commit)) return undefined;
    const repo = new URL(source.repositoryUrl);
    if (
      repo.protocol !== 'https:' ||
      repo.hostname !== 'github.com' ||
      repo.username ||
      repo.password ||
      repo.pathname.split('/').filter(Boolean).length !== 2
    )
      return undefined;
    const base = `${repo.origin}${repo.pathname.replace(/\/$/u, '')}`;
    return target.pathname === '/'
      ? `${base}/tree/${source.commit}${target.search}${target.hash}`
      : `${base}/blob/${source.commit}${target.pathname}${target.search}${target.hash}`;
  } catch {
    return undefined;
  }
}
