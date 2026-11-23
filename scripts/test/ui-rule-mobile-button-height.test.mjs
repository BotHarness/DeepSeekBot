import { describe, expect, it } from 'vitest';
import { compare, parseSource } from '../check-ui-rules.mjs';
import { mobileFixedButtonHeight } from '../ui-rule-mobile-button-height.mjs';

const file = 'apps/mobile/src/ui/example.android.tsx';
const check = (source) => mobileFixedButtonHeight(file, parseSource(source, file));

describe('mobile Compose button height', () => {
  it('rejects a fixed height or size on a Compose text button', () => {
    const found = check(`
      import { Button, OutlinedButton as Secondary } from '@expo/ui/jetpack-compose';
      import { height as fixedHeight, size, weight } from '@expo/ui/jetpack-compose/modifiers';
      const tall = [fixedHeight(56)];
      const example = <>
        <Button modifiers={[weight(1), fixedHeight(56)]} onClick={next} />
        <Secondary modifiers={[size(120, 48)]} onClick={back} />
        <Button modifiers={tall} onClick={next} />
      </>;
    `);
    expect(found.map(({ rule, text, line }) => [rule, text, line])).toEqual([
      ['fixedButtonHeight', 'Button', 6],
      ['fixedButtonHeight', 'OutlinedButton', 7],
      ['fixedButtonHeight', 'Button', 8],
    ]);
    expect(compare(found, {}).problems).toEqual([expect.stringContaining('minimum height')]);
  });

  it('accepts minimum heights, icon buttons and non-Compose buttons', () => {
    expect(
      check(`
        import { Button, IconButton } from '@expo/ui/jetpack-compose';
        import { defaultMinSize, size } from '@expo/ui/jetpack-compose/modifiers';
        import { Button as NativeButton } from 'react-native';
        const grow = [defaultMinSize({ minHeight: 56 })];
        const example = <>
          <Button modifiers={grow} onClick={next} />
          <Button modifiers={[defaultMinSize({ minHeight: 56 })]} onClick={next} />
          <IconButton modifiers={[size(48, 48)]} onClick={back} />
          <NativeButton title="Next" onPress={next} />
        </>;
      `),
    ).toEqual([]);
  });
});
