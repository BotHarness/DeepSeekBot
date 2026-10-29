import type { createBotCreationController } from './bot-creation';

export type CreationEntrySource = 'blank' | 'git' | 'zip';
type Controller = ReturnType<typeof createBotCreationController>;
type Entry = { kind: 'all' } | { kind: 'host'; hostId: string } | { kind: 'resume' };

export async function enterBotCreation(
  controller: Controller,
  source: CreationEntrySource,
  entry: Entry,
  preselect: (lastHostId: string) => string = () => '',
) {
  await controller.ready;
  if (entry.kind === 'resume' || controller.getSnapshot().busy) return 'ready';
  let record = controller.getSnapshot().record;
  const last = record.kind === 'submitted' ? record.operation.hostId : record.draft.hostId;
  if (record.kind === 'submitted' && record.acknowledged) {
    await controller.another(entry.kind === 'host' ? entry.hostId : '', 'fresh');
    record = controller.getSnapshot().record;
  }
  if (record.kind === 'submitted') return 'ready';
  if (
    source === 'zip'
      ? record.draft.source?.kind === 'git'
      : source === 'blank' && record.draft.source
  )
    await controller.blank();
  else if (
    source === 'git' &&
    (record.draft.source?.kind !== 'git' || record.draft.source.origin === 'marketplace')
  )
    await controller.beginImport({ gitUrl: '' });
  if (!controller.getSnapshot().error)
    await controller.enter(entry.kind === 'all' ? { kind: 'all', hostId: preselect(last) } : entry);
  return 'ready';
}
