import type { SubagentActivation, SubagentActivationSpec } from '@deepseek-ai/dsh-subagent';

type CallerSpec = Omit<SubagentActivationSpec, 'delivery'>;
export type CallerRun = Pick<SubagentActivation, 'childId' | 'result' | 'dispose'>;
type LegacyRun = Omit<CallerRun, 'childId'> & { id: CallerRun['childId'] };

export interface SubagentCompatService {
  startActivation?: (spec: SubagentActivationSpec) => Promise<SubagentActivation>;
  start?: (
    provider: string,
    request: CallerSpec['request'] & Pick<CallerSpec, 'label' | 'signal'>,
  ) => Promise<LegacyRun>;
  startContinuable?: (spec: CallerSpec) => Promise<Pick<CallerRun, 'childId'>>;
}

export async function startCallerActivation(
  subagents: SubagentCompatService,
  spec: CallerSpec,
): Promise<CallerRun> {
  if (typeof subagents.startActivation !== 'function') {
    if (typeof subagents.start !== 'function')
      throw new Error('DSH caller Subagent capability is unavailable');
    const run = await subagents.start(spec.provider, {
      ...spec.request,
      label: spec.label,
      signal: spec.signal,
    });
    return { childId: run.id, result: run.result, dispose: () => run.dispose() };
  }
  const activation = await subagents.startActivation({ ...spec, delivery: 'caller' });
  let disposal: Promise<void> | undefined;
  const dispose = () => {
    spec.signal.removeEventListener('abort', onAbort);
    return (disposal ??= activation.dispose());
  };
  const onAbort = () => {
    void dispose().catch(() => undefined);
  };
  spec.signal.addEventListener('abort', onAbort, { once: true });
  if (spec.signal.aborted) onAbort();
  return {
    childId: activation.childId,
    result: activation.result.finally(() => spec.signal.removeEventListener('abort', onAbort)),
    dispose,
  };
}

export async function startParentActivation(
  subagents: SubagentCompatService,
  spec: CallerSpec,
  onFailure: (childId: string, error: unknown) => void,
): Promise<Pick<CallerRun, 'childId'>> {
  if (typeof subagents.startActivation !== 'function') {
    if (typeof subagents.startContinuable !== 'function')
      throw new Error('DSH parent-delivered Subagent capability is unavailable');
    return subagents.startContinuable(spec);
  }
  const activation = await subagents.startActivation({ ...spec, delivery: 'parent' });
  void activation.result.catch((error) => onFailure(activation.childId, error));
  return { childId: activation.childId };
}
