import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../scripts/check-hardware-send-ios-results.mjs', import.meta.url),
);
const ordinary = 'testOrdinaryCommandReturnSendsThroughTheResponderChain()';
const focus = 'testCachedCommandCannotSendAfterFocusLeavesTheComposer()';
const marked = 'testCachedCommandDoesNotSendMarkedTextAndNextCommandStillWorks()';
const summary = (count = 1) => ({
  result: 'Passed',
  totalTestCount: count,
  passedTests: count,
  failedTests: 0,
  skippedTests: 0,
  expectedFailures: 0,
  testFailures: [],
});
const testCase = (name = ordinary) => ({
  nodeType: 'Test Case',
  name,
  nodeIdentifier: `HardwareSendViewTests/${name}`,
  result: 'Passed',
});
const tree = (cases: unknown[] = [testCase()]) => ({
  testNodes: [{ nodeType: 'Test Plan', children: [{ nodeType: 'Test Suite', children: cases }] }],
});
const check = (counts: unknown, tests: unknown, phase = 'positive') => {
  const directory = mkdtempSync(join(tmpdir(), 'hardware-send-results-'));
  try {
    const countsPath = join(directory, 'summary.json');
    const testsPath = join(directory, 'tests.json');
    writeFileSync(countsPath, JSON.stringify(counts));
    writeFileSync(testsPath, JSON.stringify(tests));
    return spawnSync(process.execPath, [script, phase, countsPath, testsPath], {
      encoding: 'utf8',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

describe('HardwareSend UIKit result gate', () => {
  it('accepts exactly the ordinary-send method and ignores its device-run child', () => {
    const result = check(
      summary(),
      tree([{ ...testCase(), children: [{ ...testCase(), nodeType: 'Test Case Run' }] }]),
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({
      phase: 'positive',
      count: 1,
      methods: [`HardwareSendViewTests/${ordinary}`],
    });
  });

  it('accepts exactly both cached-command methods in either order', () => {
    const result = check(summary(2), tree([testCase(marked), testCase(focus)]), 'regressions');
    expect(result.status, result.stderr).toBe(0);
  });

  it.each([
    ['empty result', summary(0), tree([])],
    ['missing summary', {}, tree()],
    ['missing tree', summary(), {}],
    ['malformed children', summary(), { testNodes: [{ nodeType: 'Test Plan', children: {} }] }],
    ['wrong phase', summary(2), tree([testCase(focus), testCase(marked)])],
    ['extra method', summary(2), tree([testCase(), testCase(focus)])],
    ['duplicate method', summary(2), tree([testCase(), testCase()])],
    [
      'crashed host placeholder',
      summary(),
      tree([
        {
          ...testCase(),
          name: 'AppHost encountered an error',
          nodeIdentifier: 'AppHost encountered an error',
        },
      ]),
    ],
    ['missing method identifier', summary(), tree([{ ...testCase(), nodeIdentifier: '' }])],
    ['wrong method name', summary(), tree([{ ...testCase(), name: 'other()' }])],
    ['failed method', summary(), tree([{ ...testCase(), result: 'Failed' }])],
    ['skipped method', summary(), tree([{ ...testCase(), result: 'Skipped' }])],
    ['failed summary', { ...summary(), result: 'Failed' }, tree()],
    ['inconsistent total', { ...summary(), totalTestCount: 2 }, tree()],
    ['inconsistent passed count', { ...summary(), passedTests: 0 }, tree()],
    ['failed count', { ...summary(), failedTests: 1 }, tree()],
    ['skipped count', { ...summary(), skippedTests: 1 }, tree()],
    ['expected failure', { ...summary(), expectedFailures: 1 }, tree()],
    ['failure details', { ...summary(), testFailures: [{ failureText: 'failure' }] }, tree()],
  ])('rejects %s', (_name, counts, tests) => {
    expect(check(counts, tests).status).toBe(1);
  });

  it('rejects duplicate regression methods even with the expected total', () => {
    expect(check(summary(2), tree([testCase(focus), testCase(focus)]), 'regressions').status).toBe(
      1,
    );
  });
});
