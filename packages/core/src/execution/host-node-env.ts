export function hostNodeEnv<Value extends string | undefined>(
  env: Record<string, Value>,
  program = process.execPath,
): Record<string, Value | '1'> {
  return process.versions['electron'] !== undefined && program === process.execPath
    ? { ...env, ELECTRON_RUN_AS_NODE: '1' }
    : env;
}
