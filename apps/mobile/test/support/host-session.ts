import type { HostSessionState } from '../../src/host/host-session';

export const emptyHostSession: HostSessionState = {
  saved: undefined,
  hosts: [],
  client: undefined,
  inbox: undefined,
};
