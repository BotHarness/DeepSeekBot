export function segmentTestID(testID: string | undefined, value: string): string | undefined {
  return testID === undefined ? undefined : `${testID}-${value.toLowerCase()}`;
}
