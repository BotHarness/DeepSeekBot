export class HostAnswerInvalid extends Error {}

export interface HostCall {
  call(method: string, args?: Record<string, unknown>): Promise<unknown>;
}

export function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function text(value: unknown): value is string {
  return typeof value === 'string';
}

export function some<T>(rows: unknown, parse: (value: unknown) => T | undefined): T[] {
  return Array.isArray(rows)
    ? rows.flatMap((row) => {
        const parsed = parse(row);
        return parsed === undefined ? [] : [parsed];
      })
    : [];
}

export function answerRecord(value: unknown, method: string): Record<string, unknown> {
  const answer = record(value);
  if (answer === undefined) throw new HostAnswerInvalid(`${method} returned no answer.`);
  return answer;
}
