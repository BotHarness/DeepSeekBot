import { describe, expect, it } from 'vitest';
import { countCardButtons, stacksCardButtons } from '../src/ui/chat/card-buttons';

const B = ({ label }: { label: string }) => <span>{label}</span>;

describe('card buttons', () => {
  it('counts shown buttons through fragments and skips empty slots', () => {
    const children = [
      <B key="a" label="Continue" />,
      null,
      false,
      <>
        <B label="Compact" />
        <B label="New session" />
      </>,
      <B key="d" label="Report" />,
    ];
    expect(countCardButtons(children)).toBe(4);
    expect(stacksCardButtons(children, false)).toBe(true);
  });

  it('keeps two decisions in a row unless asked to stack', () => {
    const two = [<B key="a" label="Compact" />, <B key="b" label="New session" />];
    expect(stacksCardButtons(two, false)).toBe(false);
    expect(stacksCardButtons(two, true)).toBe(true);
    expect(stacksCardButtons(<B label="One" />, false)).toBe(false);
  });
});
