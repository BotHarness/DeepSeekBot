import { parseInvitationLink } from './invitation-link';
export function cloudNativeIntent(path: string): string {
  if (!/^ai\.botharness\.deepseekbot\.dev:/i.test(path)) return path;
  try {
    const url = new URL(path);
    const link = url.searchParams.get('link');
    if (
      !url.host &&
      url.pathname === '/cloud-join' &&
      !url.hash &&
      [...url.searchParams.keys()].length === 1 &&
      link
    ) {
      parseInvitationLink(link);
      return '/cloud-join?link=' + encodeURIComponent(link);
    }
  } catch {}
  return '/cloud-services';
}
