import { teamInvitationRoute } from '../team/team-link-path';

export type ConnectInput =
  | { kind: 'pairing'; text: string }
  | { kind: 'invitation'; path: string }
  | { kind: 'address'; address: string };

const APP_LINK = /^deepseekbot(?:-dev)?:/iu;
const ADDRESS =
  /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:localhost|[^\s/:@?#]+\.[^\s/:@?#]+|\[[0-9a-f:]+\])(?::\d+)?\/?$/iu;

export function connectInput(raw: string): ConnectInput {
  const text = raw.trim();
  const invitation = teamInvitationRoute(text);
  if (invitation !== undefined) return { kind: 'invitation', path: invitation };
  if (!APP_LINK.test(text) && ADDRESS.test(text))
    return { kind: 'address', address: text.replace(/\/$/u, '') };
  return { kind: 'pairing', text };
}
