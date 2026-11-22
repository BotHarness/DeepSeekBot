import { useLocalSearchParams } from 'expo-router';

import {
  modelScopeKey,
  type AssignmentEffortTarget,
  type ModelScope,
} from '@botharness/host-client/model-settings';
import { useHostSession } from '../../host/host-session';
import { useStrings } from '../strings';
import { ModelsView } from './model-settings-screen';
import { SubChoicePicker } from './sub-choice-picker';
import { SheetNote } from './sheet';

export function ModelSettingsScreen({
  kind,
  pick = false,
}: {
  kind: ModelScope['kind'];
  pick?: boolean;
}) {
  const t = useStrings();
  const {
    slug = '',
    id = '',
    field = 'orchestrator',
    provider = '',
    model = '',
    group = '',
    engine = '',
    account = '',
  } = useLocalSearchParams<{
    slug: string;
    id: string;
    field: string;
    provider: string;
    model: string;
    group: string;
    engine: string;
    account: string;
  }>();
  const { client, saved } = useHostSession();
  const scope: ModelScope =
    kind === 'bot'
      ? { kind, slug }
      : kind === 'preset' || (pick && id !== '')
        ? { kind: 'preset', id }
        : { kind: 'global' };
  if (client === undefined) return <SheetNote>{t.unreachable}</SheetNote>;
  if (pick && (field === 'sub-add' || field === 'sub-effort')) {
    const target: AssignmentEffortTarget | undefined =
      engine === 'codex' || engine === 'claude'
        ? {
            kind: 'engine',
            engine,
            ...(account === '' ? {} : { accountId: account }),
            ...(model === '' ? {} : { model }),
          }
        : group !== ''
          ? { kind: 'group', id: group }
          : provider !== '' && model !== ''
            ? { kind: 'model', provider, model }
            : undefined;
    return (
      <SubChoicePicker
        key={`${saved?.hostId}:${modelScopeKey(scope)}:${field}:${group}:${provider}/${model}:${engine}/${account}`}
        client={client}
        scope={scope}
        field={field}
        target={target}
      />
    );
  }
  const picker =
    pick && (field === 'orchestrator' || field === 'orchestrator-effort') ? field : undefined;
  return (
    <ModelsView
      key={`${saved?.hostId}:${modelScopeKey(scope)}:${picker ?? ''}`}
      client={client}
      scope={scope}
      picker={picker}
    />
  );
}
