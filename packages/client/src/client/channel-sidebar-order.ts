export function resolveEntryOrder(
  registered: readonly string[],
  saved: readonly string[],
): readonly string[] {
  return [...new Set([...saved, ...registered])];
}
export function moveEntry(order: readonly string[], id: string, target: string): readonly string[] {
  const from = order.indexOf(id);
  const to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return order;
  const next = [...order];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

export function insertEntryBefore(
  order: readonly string[],
  id: string,
  before: string | undefined,
): readonly string[] {
  if (!order.includes(id) || before === id || (before !== undefined && !order.includes(before)))
    return order;
  const next = order.filter((entry) => entry !== id);
  const index = before === undefined ? next.length : next.indexOf(before);
  return [...next.slice(0, index), id, ...next.slice(index)];
}

export function mergeSavedOrder(
  registered: readonly string[],
  saved: readonly string[],
): readonly string[] {
  const known = saved.filter((id, index) => registered.includes(id) && saved.indexOf(id) === index);
  let next = 0;
  return registered.map((id) => (known.includes(id) ? known[next++]! : id));
}
