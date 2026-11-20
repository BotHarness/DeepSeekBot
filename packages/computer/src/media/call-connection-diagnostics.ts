const PHASES = [
  'created',
  'gathering',
  'ice',
  'peer',
  'offer-ready',
  'answer-start',
  'answer-applied',
] as const;
const PEER = ['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed'] as const;
const ICE = [
  'new',
  'checking',
  'connected',
  'completed',
  'disconnected',
  'failed',
  'closed',
] as const;
const GATHERING = ['new', 'gathering', 'complete'] as const;

const member = (values: readonly string[], value: unknown): value is string =>
  typeof value === 'string' && values.includes(value);
const integer = (value: unknown, maximum: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum;

export function callConnectionDiagnostics(emit: (detail: string) => void) {
  let previous = 0;
  let elapsed = 0;
  let received = 0;
  return (value: unknown): void => {
    if (++received > 32 || typeof value !== 'object' || value === null) return;
    if (
      !('seq' in value) ||
      !integer(value.seq, 32) ||
      value.seq <= previous ||
      !('elapsedMs' in value) ||
      !integer(value.elapsedMs, 86_400_000) ||
      value.elapsedMs < elapsed ||
      !('stage' in value) ||
      !member(PHASES, value.stage) ||
      !('peer' in value) ||
      !member(PEER, value.peer) ||
      !('ice' in value) ||
      !member(ICE, value.ice) ||
      !('gathering' in value) ||
      !member(GATHERING, value.gathering) ||
      !('localCandidates' in value) ||
      !integer(value.localCandidates, 1024) ||
      !('remoteCandidates' in value) ||
      !integer(value.remoteCandidates, 1024)
    )
      return;
    previous = value.seq;
    elapsed = value.elapsedMs;
    try {
      emit(
        `phase=call-media-connection seq=${value.seq} elapsedMs=${value.elapsedMs} stage=${value.stage} peer=${value.peer} ice=${value.ice} gathering=${value.gathering} localCandidates=${value.localCandidates} remoteCandidates=${value.remoteCandidates}`,
      );
    } catch {}
  };
}
