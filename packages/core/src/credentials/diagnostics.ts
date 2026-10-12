export type PrivateInputLog = (
  phase: string,
  details?: {
    requestId?: string;
    botSlug?: string;
    sessionId?: string;
    durationMs?: number;
    program?: string;
    initiator?: 'replacement' | 'revocation';
    active?: number;
    stopped?: number;
    completed?: number;
    uncertain?: number;
  },
) => void;
