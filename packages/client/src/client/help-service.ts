import type {
  ClientHelpService,
  HelpAvailability,
  HelpContribution,
  HelpGuide,
  HelpQuestion,
  HelpState,
  HelpStep,
  HelpTopic,
} from '../help-api.js';

export function createHelpService(
  present: (
    steps: readonly HelpStep[],
    signal: AbortSignal,
    progress: (step: number) => void,
    end: (reason: string) => void,
  ) => () => void,
  reveal: () => void = () => {},
): ClientHelpService {
  const registrations = new Map<string, HelpContribution>();
  const listeners = new Set<() => void>();
  let topics: readonly HelpTopic[] = [];
  let selection: { readonly questionId: string; readonly revision: number } | undefined;
  let selectionRevision = 0;
  let state: HelpState = { phase: 'idle' };
  let active:
    | { controller: AbortController; release?: () => void; presentation?: () => void }
    | undefined;
  const publish = () => {
    for (const listener of listeners) listener();
  };
  const question = (id: string): HelpQuestion | undefined =>
    topics.flatMap((t) => t.questions).find((q) => q.id === id);
  const unavailable: HelpAvailability = {
    status: 'unavailable',
    reason: { en: 'This guide is unavailable.', zh: '此教程暂不可用。' },
  };
  const service: ClientHelpService = {
    selection: () => selection,
    show(id) {
      if (!question(id)) throw new Error('help_question_unavailable');
      service.cancel('reading');
      selection = Object.freeze({ questionId: id, revision: ++selectionRevision });
      reveal();
      publish();
    },
    register(contribution) {
      if (!/^[a-z0-9.-]+:[a-z0-9._-]+$/i.test(contribution.id)) throw new Error('help_invalid_id');
      const ids = [
        contribution.id,
        ...contribution.topics.flatMap((t) => [t.id, ...t.questions.map((q) => q.id)]),
      ];
      const existing = [...registrations.values()].flatMap((c) => [
        c.id,
        ...c.topics.flatMap((t) => [t.id, ...t.questions.map((q) => q.id)]),
      ]);
      if (
        new Set(ids).size !== ids.length ||
        ids.some(
          (id) => !id.startsWith(contribution.id.split(':')[0] + ':') || existing.includes(id),
        )
      )
        throw new Error('help_duplicate_id');
      const copyText = (value: { readonly en: string; readonly zh?: string }) =>
        Object.freeze({ ...value });
      const owned = Object.freeze({
        ...contribution,
        topics: Object.freeze(
          contribution.topics.map((t) =>
            Object.freeze({
              ...t,
              title: copyText(t.title),
              overview: copyText(t.overview),
              questions: Object.freeze(
                t.questions.map((q) =>
                  Object.freeze({
                    ...q,
                    title: copyText(q.title),
                    answer: copyText(q.answer),
                    ...(q.keywords ? { keywords: Object.freeze([...q.keywords]) } : {}),
                    ...(q.guide
                      ? {
                          guide: Object.freeze({
                            ...q.guide,
                            ...(q.guide.actionLabel
                              ? { actionLabel: copyText(q.guide.actionLabel) }
                              : {}),
                          }),
                        }
                      : {}),
                  }),
                ),
              ),
            }),
          ),
        ),
      });
      registrations.set(owned.id, owned);
      topics = Object.freeze([...registrations.values()].flatMap((c) => c.topics));
      publish();
      return () => {
        if (registrations.get(owned.id) !== owned) return;
        if (owned.topics.some((t) => t.questions.some((q) => q.id === state.questionId)))
          service.cancel('plugin-removed');
        if (
          owned.topics.some((topic) => topic.questions.some((q) => q.id === selection?.questionId))
        )
          selection = undefined;
        registrations.delete(owned.id);
        topics = Object.freeze([...registrations.values()].flatMap((c) => c.topics));
        publish();
      };
    },
    topics: () => topics,
    search(query) {
      const terms = query.toLocaleLowerCase().trim().split(/\s+/);
      return topics.flatMap((t) =>
        t.questions.filter((q) => {
          const text = [t.title.en, t.title.zh, q.title.en, q.title.zh, ...(q.keywords ?? [])]
            .join(' ')
            .toLocaleLowerCase();
          return terms.every((term) => text.includes(term));
        }),
      );
    },
    availability: (id) => question(id)?.guide?.availability() ?? unavailable,
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    cancel(reason = 'closed') {
      const previous = active;
      active = undefined;
      state = {
        phase: 'idle',
        ...(state.questionId ? { questionId: state.questionId } : {}),
        reason,
      };
      previous?.controller.abort();
      try {
        previous?.presentation?.();
      } finally {
        previous?.release?.();
        publish();
      }
    },
    async start(id, targetId) {
      service.cancel('replaced');
      const guide: HelpGuide | undefined = question(id)?.guide;
      const availability = guide?.availability() ?? unavailable;
      const target =
        availability.status === 'ready'
          ? availability.target
          : availability.status === 'select'
            ? availability.targets.find((t) => t.id === targetId)
            : undefined;
      if (!guide || !target || (targetId !== undefined && target.id !== targetId))
        throw new Error('help_target_unavailable');
      const run = { controller: new AbortController() } as NonNullable<typeof active>;
      active = run;
      state = { phase: 'preparing', questionId: id };
      publish();
      try {
        const prepared = await guide.prepare(target.id, run.controller.signal);
        if (active !== run) {
          prepared.dispose();
          return;
        }
        run.release = prepared.dispose;
        state = { phase: 'running', questionId: id, step: 0 };
        publish();
        run.presentation = present(
          prepared.steps,
          run.controller.signal,
          (step) => {
            if (active !== run) return;
            state = { phase: 'running', questionId: id, step };
            publish();
          },
          (reason) => {
            if (active === run) service.cancel(reason);
          },
        );
        if (active !== run) run.presentation();
      } catch (error) {
        if (active !== run) return;
        service.cancel('target-unavailable');
        throw error;
      }
    },
  };
  return service;
}
