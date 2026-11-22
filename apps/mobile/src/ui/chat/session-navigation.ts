export function sessionRoute({
  id,
  hostId,
  slug,
  title,
}: {
  id: string;
  hostId?: string | undefined;
  slug?: string | undefined;
  title?: string | undefined;
}) {
  return {
    pathname: '/session/[id]',
    params: { id, hostId, slug, title },
  } as const;
}
