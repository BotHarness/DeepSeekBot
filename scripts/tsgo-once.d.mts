export function sharedRoot(tsdownPid: number): string;
export function splitOutDir(args: string[]): {
  outDir: string;
  withOutDir(dir: string): string[];
  key: string;
};
export function removeShared(tsdownPid: number): void;
