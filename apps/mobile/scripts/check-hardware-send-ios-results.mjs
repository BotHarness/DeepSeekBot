import { readFileSync } from 'node:fs';

const expected = {
  positive: ['HardwareSendViewTests/testOrdinaryCommandReturnSendsThroughTheResponderChain()'],
  regressions: [
    'HardwareSendViewTests/testCachedCommandCannotSendAfterFocusLeavesTheComposer()',
    'HardwareSendViewTests/testCachedCommandDoesNotSendMarkedTextAndNextCommandStillWorks()',
  ],
};
const casesIn = (nodes) => {
  if (!Array.isArray(nodes)) throw new Error('Missing or malformed test nodes');
  return nodes.flatMap((node) => {
    if (!node || typeof node.nodeType !== 'string') throw new Error('Malformed test node');
    return [
      ...(node.nodeType === 'Test Case' ? [node] : []),
      ...(node.children === undefined ? [] : casesIn(node.children)),
    ];
  });
};

try {
  const [phase, summaryPath, testsPath, extra] = process.argv.slice(2);
  const methods = expected[phase];
  if (!methods || !summaryPath || !testsPath || extra)
    throw new Error('Expected phase, summary and tests paths');
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const tests = JSON.parse(readFileSync(testsPath, 'utf8'));
  const cases = casesIn(tests.testNodes);
  const counts = {
    totalTestCount: methods.length,
    passedTests: methods.length,
    failedTests: 0,
    skippedTests: 0,
    expectedFailures: 0,
  };
  if (
    summary.result !== 'Passed' ||
    Object.entries(counts).some(([key, count]) => summary[key] !== count) ||
    !Array.isArray(summary.testFailures) ||
    summary.testFailures.length !== 0
  )
    throw new Error('Expected an exact passing summary with no skipped or failed tests');
  if (
    cases.length !== methods.length ||
    cases.some(
      (test) =>
        test.result !== 'Passed' ||
        !methods.includes(test.nodeIdentifier) ||
        test.name !== test.nodeIdentifier.split('/').at(-1),
    ) ||
    JSON.stringify(cases.map((test) => test.nodeIdentifier).sort()) !==
      JSON.stringify([...methods].sort())
  )
    throw new Error('Executed test methods do not match the expected passing cases');
  process.stdout.write(`${JSON.stringify({ phase, count: cases.length, methods })}\n`);
} catch (error) {
  process.stderr.write(`HardwareSend UIKit result rejected: ${error.message}\n`);
  process.exitCode = 1;
}
