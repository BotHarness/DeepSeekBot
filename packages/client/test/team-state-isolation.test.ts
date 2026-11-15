// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import type { BridgeCall } from '../src/client/bridge.js';
import type { TeamModeView } from '../src/client/team-bridge.js';
import {
  isolateTeamIdentity,
  refreshTeamMode,
  setTeamModeSnapshot,
  useTeamMember,
  useTeamMode,
} from '../src/client/team-state.js';
import { selfHumanId, setSelfHumanId } from '../src/client/self-human.js';

function view(humanId: string, kind: 'owner' | 'member'): TeamModeView {
  return {
    enabled: true,
    ownerPasswordSet: true,
    insecureHttpAllowed: false,
    memberUrls: [],
    isolation: 'trial',
    viewer: {
      humanId,
      kind,
      displayName: humanId,
      mustChangePassword: false,
      owner: kind === 'owner',
      permissions: [],
      roleIds: [],
    },
  };
}

it.each(['snapshot', 'refresh'] as const)(
  'retains remote per-call Team Mode without publishing local identity through %s',
  async (mode) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const element = document.createElement('div');
    const root = createRoot(element);
    const prior = selfHumanId();
    const local: BridgeCall = async () => ({ ok: true, value: view('local-owner', 'owner') });
    const remote: BridgeCall = async () => ({ ok: true, value: view('remote-member', 'member') });
    try {
      setTeamModeSnapshot(local, view('local-owner', 'owner'));
      isolateTeamIdentity(remote);
      if (mode === 'snapshot') setTeamModeSnapshot(remote, view('remote-member', 'member'));
      else await refreshTeamMode(remote);
      expect(selfHumanId()).toBe('local-owner');
      function Probe() {
        const localMember = useTeamMember();
        const target = useTeamMode(remote);
        return createElement(
          'span',
          null,
          `${localMember}:${target?.viewer.humanId}:${target?.viewer.kind}`,
        );
      }
      await act(async () => root.render(createElement(Probe)));
      expect(element.textContent).toBe('false:remote-member:member');
    } finally {
      await act(async () => root.unmount());
      setSelfHumanId(prior);
    }
  },
);
