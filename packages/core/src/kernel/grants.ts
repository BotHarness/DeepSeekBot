export interface GrantSource<Capability extends string> {
  allow: readonly Capability[];
  deny: readonly Capability[];
  delegateAllow?: readonly Capability[] | undefined;
  delegateDeny?: readonly Capability[] | undefined;
}

export interface ResolvedGrants<Capability extends string, Source> {
  granted: Capability[];
  denied: Capability[];
  delegable: Capability[];
  deniedDelegable: Capability[];
  sources: Source[];
}

function union<Capability extends string>(
  lists: (readonly Capability[] | undefined)[],
  catalog: readonly Capability[] | undefined,
): Capability[] {
  const seen = new Set(lists.flatMap((list) => list ?? []));
  return catalog ? catalog.filter((capability) => seen.has(capability)) : [...seen];
}

export function resolveGrants<Capability extends string, Source extends GrantSource<Capability>>(
  sources: readonly Source[],
  catalog?: readonly Capability[],
): ResolvedGrants<Capability, Source> {
  const denied = union(
    sources.map((source) => source.deny),
    catalog,
  );
  const deniedDelegable = union(
    sources.map((source) => source.delegateDeny),
    catalog,
  );
  return {
    granted: union(
      sources.map((source) => source.allow),
      catalog,
    ).filter((capability) => !denied.includes(capability)),
    denied,
    delegable: union(
      sources.map((source) => source.delegateAllow),
      catalog,
    ).filter((capability) => !deniedDelegable.includes(capability)),
    deniedDelegable,
    sources: [...sources],
  };
}

export function narrow<Capability extends string, Source>(
  resolved: ResolvedGrants<Capability, Source>,
  ceiling: readonly NoInfer<Capability>[],
): ResolvedGrants<Capability, Source> {
  const allowed = new Set(ceiling);
  return {
    ...resolved,
    granted: resolved.granted.filter((capability) => allowed.has(capability)),
    delegable: resolved.delegable.filter((capability) => allowed.has(capability)),
  };
}
