import type { PersonaBotRecord, UpdatePersonaBotResult } from './persona-bot.js';
import type { ModelLinkMigration, PersonaBotRegistry } from './registry.js';
import type { attachOperationalModule } from '../database/owner.js';
import {
  linkFromCopiedPlan,
  mainOverrideOf,
  subOverrideOf,
  withPlanSub,
  type BotModelLink,
} from '../models/bot-model-link.js';
import {
  DEFAULT_MODEL_PRESET_ID,
  defaultPresetPlan,
  presetGroups,
  readModelPreset,
  type ModelPreset,
  type PersonaBotModelPlan,
} from '../models/presets.js';

type ModelMethods = Pick<
  PersonaBotRegistry,
  | 'inheritModel'
  | 'applyModelPreset'
  | 'resetModelSlots'
  | 'migrateModelLinks'
  | 'migrateLegacyModel'
  | 'customizeModelPlan'
  | 'setAssignmentModels'
  | 'setModelPlanSub'
  | 'setModelPlan'
>;

export function createRegistryModelMethods({
  port,
  now,
  active,
  read,
  list,
  write,
}: {
  port: ReturnType<typeof attachOperationalModule>;
  now: () => Date;
  active: (slug: string) => PersonaBotRecord | undefined;
  read: (slug: string) => PersonaBotRecord | undefined;
  list: () => PersonaBotRecord[];
  write: (record: PersonaBotRecord) => void;
}): ModelMethods {
  const presetFor = (id: string): ModelPreset | undefined =>
    port.read(
      (database) =>
        readModelPreset(database, id) ?? readModelPreset(database, DEFAULT_MODEL_PRESET_ID),
    );
  const planRevision = (record: PersonaBotRecord): number =>
    record.modelPlan?.revision ?? record.modelPlanRevision ?? 0;
  const linkOf = (record: PersonaBotRecord): BotModelLink => {
    if (record.modelLink !== undefined) return structuredClone(record.modelLink);
    const plan = record.modelPlan;
    const linkedAt = now().toISOString();
    if (plan === undefined) return { presetId: DEFAULT_MODEL_PRESET_ID, linkedAt };
    return {
      presetId: DEFAULT_MODEL_PRESET_ID,
      linkedAt,
      main: mainOverrideOf(plan),
      ...(plan.assignmentDefault === undefined ? {} : { sub: subOverrideOf(plan) }),
    };
  };
  const writeLink = (
    record: PersonaBotRecord,
    link: BotModelLink | undefined,
  ): UpdatePersonaBotResult => {
    record.modelPlanRevision = planRevision(record) + 1;
    delete record.modelPlan;
    delete record.model;
    if (link === undefined) delete record.modelLink;
    else record.modelLink = link;
    write(record);
    const saved = read(record.slug);
    return saved === undefined ? { ok: false, reason: 'not-found' } : { ok: true, record: saved };
  };
  const migrateModelLinks = ({ dryRun = false }: { dryRun?: boolean } = {}) => {
    const changes: ModelLinkMigration[] = [];
    for (const record of list()) {
      const plan = record.modelPlan;
      if (record.modelLink !== undefined || plan === undefined) continue;
      const preset = presetFor(plan.sourcePresetId || DEFAULT_MODEL_PRESET_ID);
      if (preset === undefined) continue;
      const link = linkFromCopiedPlan(plan, preset, now().toISOString());
      changes.push({
        slug: record.slug,
        presetId: link.presetId,
        overrides: (['main', 'sub'] as const).filter((slot) => link[slot] !== undefined),
      });
      if (dryRun) continue;
      record.modelPlanRevision = Math.max(plan.revision, record.modelPlanRevision ?? 0);
      delete record.modelPlan;
      record.modelLink = link;
      write(record);
    }
    return changes;
  };
  return {
    inheritModel(slug, expectedRevision) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (planRevision(record) !== expectedRevision) return { ok: false, reason: 'invalid-input' };
      if (record.modelPlan === undefined && record.model === undefined) return { ok: true, record };
      return writeLink(record, undefined);
    },
    applyModelPreset(slug, preset, { keepOverrides = false } = {}) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const current = linkOf(record);
      if (presetFor(preset.id)?.id !== preset.id) {
        const copy = defaultPresetPlan(preset);
        return writeLink(record, {
          presetId: DEFAULT_MODEL_PRESET_ID,
          linkedAt: now().toISOString(),
          main: mainOverrideOf(copy),
          sub: subOverrideOf(copy),
        });
      }
      return writeLink(record, {
        presetId: preset.id,
        linkedAt: now().toISOString(),
        ...(keepOverrides && current.main !== undefined ? { main: current.main } : {}),
        ...(keepOverrides && current.sub !== undefined ? { sub: current.sub } : {}),
      });
    },
    resetModelSlots(slug, slots, expectedRevision) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (record.model !== undefined) return { ok: false, reason: 'invalid-input' };
      if (planRevision(record) !== expectedRevision) return { ok: false, reason: 'invalid-input' };
      const link = linkOf(record);
      for (const slot of slots) delete link[slot];
      return writeLink(record, link);
    },
    migrateModelLinks,
    migrateLegacyModel(slug, expectedModel, route) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (record.modelPlan !== undefined) return { ok: true, record };
      if (record.model !== expectedModel) return { ok: false, reason: 'invalid-input' };
      return writeLink(record, {
        presetId: DEFAULT_MODEL_PRESET_ID,
        linkedAt: now().toISOString(),
        main: { orchestrator: { ...route } },
        sub: { assignmentDefault: { ...route } },
      });
    },
    customizeModelPlan(
      slug,
      orchestrator,
      expectedRevision,
      orchestratorGroupId,
      orchestratorGroupEffort,
    ) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (record.model !== undefined) return { ok: false, reason: 'invalid-input' };
      if (planRevision(record) !== expectedRevision) return { ok: false, reason: 'invalid-input' };
      const link = linkOf(record);
      link.main = {
        orchestrator: { ...orchestrator },
        ...(orchestratorGroupId === undefined ? {} : { orchestratorGroupId }),
        ...(orchestratorGroupId === undefined ||
        orchestratorGroupEffort === undefined ||
        orchestratorGroupEffort.trim() === ''
          ? {}
          : { orchestratorGroupEffort: orchestratorGroupEffort.trim() }),
      };
      return writeLink(record, link);
    },
    setAssignmentModels(
      slug,
      assignmentDefault,
      assignmentModels,
      expectedRevision,
      openAssignmentModels,
      groups,
    ) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const current = record.modelPlan;
      if (current === undefined || current.revision !== expectedRevision)
        return { ok: false, reason: 'invalid-input' };
      const open = openAssignmentModels ?? current.openAssignmentModels === true;
      const ids = groups === undefined ? (current.assignmentGroups ?? []) : groups.ids;
      const defaultGroup =
        groups === undefined ? current.assignmentDefaultGroupId : groups.defaultId;
      const options = (groups?.options ?? current.assignmentGroupOptions)?.filter((option) =>
        ids.includes(option.group),
      );
      const link = linkOf(record);
      link.sub = {
        ...(open ? { openAssignmentModels: true } : {}),
        ...(ids.length === 0 ? {} : { assignmentGroups: [...ids] }),
        ...(ids.length === 0 || defaultGroup === undefined
          ? {}
          : { assignmentDefaultGroupId: defaultGroup }),
        ...(options === undefined || options.length === 0
          ? {}
          : { assignmentGroupOptions: options.map((option) => ({ ...option })) }),
        assignmentDefault: { ...assignmentDefault },
        assignmentModels: assignmentModels.map((option) => ({
          ...option,
          allowedEfforts: [...option.allowedEfforts],
        })),
      };
      return writeLink(record, link);
    },
    setModelPlanSub(slug, sub, expectedRevision) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const plan = record.modelPlan;
      if (plan === undefined || plan.revision !== expectedRevision)
        return { ok: false, reason: 'invalid-input' };
      const link = linkOf(record);
      link.sub = subOverrideOf(withPlanSub(plan, sub));
      return writeLink(record, link);
    },
    setModelPlan(slug, routes, expectedRevision) {
      const record = active(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (planRevision(record) !== expectedRevision) return { ok: false, reason: 'invalid-input' };
      const main: PersonaBotModelPlan = {
        revision: 1,
        sourcePresetId: '',
        sourcePresetName: '',
        appliedAt: '',
        orchestrator: { ...routes.orchestrator },
        ...(routes.groups === undefined ? {} : presetGroups(routes.groups)),
      };
      const plan =
        routes.sub === undefined
          ? {
              ...main,
              assignmentDefault: { ...routes.assignmentDefault },
              assignmentModels: routes.assignmentModels.map((option) => ({
                ...option,
                allowedEfforts: [...option.allowedEfforts],
              })),
              ...(routes.openAssignmentModels === true
                ? { openAssignmentModels: true as const }
                : {}),
            }
          : withPlanSub(main, routes.sub);
      return writeLink(record, {
        ...linkOf(record),
        main: mainOverrideOf(plan),
        sub: subOverrideOf(plan),
      });
    },
  };
}
