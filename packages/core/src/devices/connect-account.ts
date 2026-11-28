export interface ConnectedHost {
  botNetwork?: { hostId: string; publicKey: string };
  id: string;
  name: string;
  hostname: string;
  createdAt: string;
  connected?: boolean;
  current: boolean;
  sessionKnown: boolean;
}
