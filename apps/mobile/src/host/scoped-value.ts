export interface Scoped<T> {
  readonly scope: string;
  readonly value: T;
}

export function settleScoped<T>(
  current: Scoped<T> | undefined,
  next: Scoped<T>,
): Scoped<T> | undefined {
  return current === undefined || current.scope === next.scope ? next : current;
}
