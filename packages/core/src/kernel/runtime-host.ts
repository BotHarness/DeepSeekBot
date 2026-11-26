export interface InboxWakeSource {
  hasPending(botSlug: string): boolean;
  subscribe(wake: (botSlug: string) => void): () => void;
}

export interface RuntimeHost {
  registerInboxWakeSource(source: InboxWakeSource): void;
}
