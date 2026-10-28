export function watchDisbandedGroups(): (listed: readonly { id: string }[]) => string[] {
  let previous: ReadonlySet<string> | undefined;
  return (listed) => {
    const current = new Set(listed.map((channel) => channel.id));
    const gone = [...(previous ?? [])].filter((id) => !current.has(id));
    previous = current;
    return gone;
  };
}
