export type WorkerLogLevel = 'info' | 'warn' | 'error';

export function logWorker(level: WorkerLogLevel, fields: Record<string, unknown>): void {
  const line = JSON.stringify(fields);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export function logLine(line: string): void {
  console.log(line);
}
