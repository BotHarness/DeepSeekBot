export interface HelpText {
  readonly en: string;
  readonly zh?: string;
}
export interface HelpTarget {
  readonly id: string;
  readonly label: string;
}
export type HelpAvailability =
  | { readonly status: 'ready'; readonly target: HelpTarget }
  | { readonly status: 'select'; readonly targets: readonly HelpTarget[] }
  | { readonly status: 'unavailable'; readonly reason: HelpText };
export interface HelpStep {
  readonly title: HelpText;
  readonly description: HelpText;
  resolve(): Element | undefined;
  complete?(): boolean;
}
export interface HelpGuide {
  readonly actionLabel?: HelpText;
  availability(): HelpAvailability;
  subscribe?(listener: () => void): () => void;
  prepare(
    targetId: string,
    signal: AbortSignal,
  ): Promise<{
    steps: readonly HelpStep[];
    dispose(): void;
  }>;
}
export interface HelpQuestion {
  readonly id: string;
  readonly title: HelpText;
  readonly answer: HelpText;
  readonly keywords?: readonly string[];
  readonly guide?: HelpGuide;
  readonly askTob?: () => Promise<'filled' | 'preserved'>;
  readonly insertQuestion?: () => Promise<void>;
}
export interface HelpTopic {
  readonly id: string;
  readonly title: HelpText;
  readonly overview: HelpText;
  readonly panelId?: string;
  readonly questions: readonly HelpQuestion[];
}
export interface HelpContribution {
  readonly id: string;
  readonly topics: readonly HelpTopic[];
}
export interface HelpState {
  readonly phase: 'idle' | 'preparing' | 'running';
  readonly questionId?: string;
  readonly step?: number;
  readonly reason?: string;
}
export interface ClientHelpService {
  show(questionId: string): void;
  selection(): { readonly questionId: string; readonly revision: number } | undefined;
  register(contribution: HelpContribution): () => void;
  topics(): readonly HelpTopic[];
  search(query: string): readonly HelpQuestion[];
  availability(questionId: string): HelpAvailability;
  start(questionId: string, targetId?: string): Promise<void>;
  cancel(reason?: string): void;
  state(): HelpState;
  subscribe(listener: () => void): () => void;
}
