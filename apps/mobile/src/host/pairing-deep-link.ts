let receivePairingLink: ((payload: string) => void) | undefined;

export function registerPairingLinkReceiver(receive: (payload: string) => void): () => void {
  receivePairingLink = receive;
  return () => {
    if (receivePairingLink === receive) receivePairingLink = undefined;
  };
}

export function deliverPairingLink(path: string): boolean {
  if (!receivePairingLink || !/^deepseekbot(?:-dev)?:\/\/\/?pair\/?\?/iu.test(path)) return false;
  const [payload, duplicate] = new URL(path).searchParams.getAll('p');
  if (payload === undefined || duplicate !== undefined) return false;
  receivePairingLink(payload);
  return true;
}
