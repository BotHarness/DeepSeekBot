export type PrivateInputLog = (
  phase: string,
  details?: {
    requestId?: string;
    botSlug?: string;
    sessionId?: string;
    durationMs?: number;
    program?: string;
    failure?: 'timeout' | 'dns' | 'connection' | 'tls' | 'network';
    initiator?: 'replacement' | 'revocation';
    active?: number;
    stopped?: number;
    completed?: number;
    uncertain?: number;
  },
) => void;
