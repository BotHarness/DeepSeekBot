interface ReleaseActivitySource {
  agents: readonly {
    id: string;
    status: string;
    inbox: { nextTurn: readonly unknown[]; nextStep: readonly unknown[] };
    runMaintenance(task: () => Promise<void>): Promise<void>;
  }[];
  jobs: { list(owner?: string): readonly { status: string }[] } | undefined;
}

export function hostReleaseActivity(source: ReleaseActivitySource): 'idle' | 'busy' | 'unknown' {
  for (const agent of source.agents) {
    if (
      agent.status === 'running' ||
      agent.inbox.nextTurn.length > 0 ||
      agent.inbox.nextStep.length > 0
    ) {
      return 'busy';
    }
    if (agent.status !== 'idle') return 'unknown';
  }
  const registry = source.jobs;
  if (registry === undefined) return 'unknown';
  const jobs = [...registry.list(), ...source.agents.flatMap((agent) => registry.list(agent.id))];
  if (jobs.some((job) => job.status === 'running' || job.status === 'stopping')) return 'busy';
  if (!jobs.every((job) => ['completed', 'killed', 'failed'].includes(job.status)))
    return 'unknown';
  for (const agent of source.agents) {
    let entered = false;
    if (typeof agent.runMaintenance !== 'function') return 'unknown';
    try {
      void agent
        .runMaintenance(async () => {
          entered = true;
        })
        .catch(() => undefined);
    } catch {
      return 'busy';
    }
    if (!entered) return 'unknown';
  }
  return 'idle';
}
