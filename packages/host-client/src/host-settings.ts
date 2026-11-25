import { HostAnswerInvalid, record, text, type HostCall } from './host-answer';

export interface HostSettingsNamespace {
  ns: string;
  revision?: unknown;
  value: Record<string, unknown>;
}

export async function describeHostSettings(host: HostCall): Promise<HostSettingsNamespace[]> {
  const namespaces = record(await host.call('settings/describe', {}))?.['namespaces'];
  if (!Array.isArray(namespaces))
    throw new HostAnswerInvalid('settings/describe returned no namespaces.');
  return namespaces.flatMap((entry) => {
    const row = record(entry);
    if (!text(row?.['ns'])) return [];
    const value = record(row['value']);
    if (value === undefined)
      throw new HostAnswerInvalid(`settings/describe returned no value for ${row['ns']}.`);
    return [
      {
        ns: row['ns'],
        ...('revision' in row ? { revision: row['revision'] } : {}),
        value,
      },
    ];
  });
}

export async function updateHostSettings(
  host: HostCall,
  ns: string,
  patch: Record<string, unknown>,
  expectedRevision: unknown,
): Promise<HostSettingsNamespace> {
  const row = record(
    await host.call('settings/update', {
      ns,
      patch,
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    }),
  );
  const value = record(row?.['value']);
  if (row === undefined || value === undefined)
    throw new HostAnswerInvalid(`settings/update returned no value for ${ns}.`);
  return { ns, ...('revision' in row ? { revision: row['revision'] } : {}), value };
}
