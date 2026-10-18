export interface TobManagementProposal {
  readonly command: string;
  readonly target: string;
  readonly previousValue: unknown;
  readonly patch: unknown;
  readonly expectedRevision?: number;
}

export interface PreparedTobOperation {
  readonly proposal?: TobManagementProposal;
  run(guard: () => void, beforeEffect?: () => void): unknown | Promise<unknown>;
}

export interface TobCliCapability {
  command: string;
  description: string;
  write: boolean;
}

export type PrepareTobOperation = (
  command: string,
  args: Record<string, unknown>,
) => PreparedTobOperation | undefined | Promise<PreparedTobOperation | undefined>;
