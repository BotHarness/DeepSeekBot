export interface PrivateInputOrigin {
  sourceEventId: string;
  signal: AbortSignal;
  applies(): boolean;
  current(): boolean;
}

export interface PrivateReplyAuthority {
  signal: AbortSignal;
  current(): boolean;
}
