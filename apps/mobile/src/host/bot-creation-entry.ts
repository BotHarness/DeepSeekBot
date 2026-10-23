import type { createBotCreationController } from './bot-creation';

export type CreationEntrySource = 'blank' | 'git' | 'zip';
type Controller = ReturnType<typeof createBotCreationController>;
type Entry = Parameters<Controller['enter']>[0];

export async function enterBotCreation(
  controller: Controller,
  source: CreationEntrySource,
  entry: Entry,
) {
  await controller.ready;
  if (entry.kind === 'resume' || controller.getSnapshot().busy) return 'ready';
  let record = controller.getSnapshot().record;
  if (record.kind === 'submitted' && record.acknowledged) {
    await controller.another(entry.kind === 'host' ? entry.hostId : '');
    record = controller.getSnapshot().record;
  }
  if (record.kind === 'submitted') return 'ready';
  if (source === 'zip') {
    const previous = record.draft.source;
    await controller.beginZip();
    const next = controller.getSnapshot();
    if (next.error) return 'ready';
    if (next.record.kind !== 'draft' || next.record.draft.source === previous) return 'cancelled';
  } else if (source === 'blank' && record.draft.source) {
    await controller.blank();
  } else if (
    source === 'git' &&
    (record.draft.source?.kind !== 'git' || record.draft.source.origin === 'marketplace')
  ) {
    await controller.beginImport({ gitUrl: '' });
  }
  if (!controller.getSnapshot().error) await controller.enter(entry);
  return 'ready';
}
