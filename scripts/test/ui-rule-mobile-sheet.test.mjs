import { describe, expect, it } from 'vitest';
import { parseSource } from '../check-ui-rules.mjs';
import { mobileSheetSurface } from '../ui-rule-mobile-sheet.mjs';

const file = 'apps/mobile/src/ui/chat/example-sheet.tsx';
const check = (source, path = file) =>
  mobileSheetSurface(path, parseSource(source, path)).map(({ rule, text, line }) => [
    rule,
    text,
    line,
  ]);

describe('mobile sheet surface', () => {
  it('rejects a hand-coloured sheet, page layers and a bare DrawerHeader', () => {
    expect(
      check(`
        export function Example({ visible }) {
          return (
            <Sheet visible={visible} label="x" onClose={close}>
              <View style={{ backgroundColor: theme.color.surface }}>
                <DrawerHeader title="x" onClose={close} />
                <Button label="x" on="canvas" onPress={close} />
                <View style={{ backgroundColor: pressed ? theme.layer.canvas.pressed : '#ffffff' }} />
              </View>
            </Sheet>
          );
        }
      `),
    ).toEqual([
      ['sheetSurface', 'backgroundColor: theme.color.surface', 5],
      ['sheetHeader', 'DrawerHeader', 6],
      ['sheetSurface', 'on="canvas"', 7],
      ['sheetSurface', 'backgroundColor: theme.layer.canvas.pressed', 8],
    ]);
  });

  it('follows same-file wrappers and content into the sheet', () => {
    expect(
      check(`
        function Surface({ children }) {
          return <Modal visible presentationStyle="pageSheet">{children}</Modal>;
        }
        function Content() {
          return <View style={{ backgroundColor: theme.layer.sheet.fill }} />;
        }
        export function Example() {
          return <Surface><Content /></Surface>;
        }
      `),
    ).toEqual([['sheetSurface', 'backgroundColor: theme.layer.sheet.fill', 6]]);
  });

  it('checks native sheet colours and the whole route that returns a sheet', () => {
    expect(
      check(`
        export default function Route({ missing }) {
          if (missing) return <View style={{ backgroundColor: theme.color.base }} />;
          return (
            <SheetScreen>
              <ModalBottomSheet containerColor={theme.layer.canvas.fill} />
              <Group modifiers={[presentationBackground(theme.color.surface)]} />
              <Group modifiers={[presentationBackground(theme.overlay.fill)]} />
            </SheetScreen>
          );
        }
      `),
    ).toEqual([
      ['sheetSurface', 'backgroundColor: theme.color.base', 3],
      ['sheetSurface', 'ModalBottomSheet containerColor', 6],
      ['sheetSurface', 'presentationBackground: theme.color.surface', 7],
      ['sheetSurface', 'presentationBackground: theme.overlay.fill', 8],
    ]);
  });

  it('accepts the sheet tokens and leaves pages alone', () => {
    expect(
      check(`
        export function Page() {
          return <View style={{ backgroundColor: theme.color.base }}><Button on="canvas" /></View>;
        }
        export function Example() {
          return (
            <Sheet visible label="x" onClose={close}>
              <SheetHeader title="x" onClose={close} trailing={<SheetSaveButton />} />
              <View style={{ backgroundColor: theme.overlay.fill }}>
                <View style={{ backgroundColor: theme.layer[SHEET_GROUP].fill }} />
                <View style={{ backgroundColor: selected ? theme.layer.raised.selected : 'transparent' }} />
                <Button label="x" on="sheet" onPress={close} />
                <Toggle on={SHEET_GROUP} />
              </View>
            </Sheet>
          );
        }
      `),
    ).toEqual([]);
  });

  it('keeps the Material container on every ModalBottomSheet', () => {
    expect(
      check(`
        export function Example() {
          return (
            <ModalBottomSheet containerColor={theme.overlay.fill} contentColor={theme.color.fg}>
              <Card containerColor={theme.overlay.fill} />
            </ModalBottomSheet>
          );
        }
      `),
    ).toEqual([
      ['sheetSurface', 'ModalBottomSheet containerColor', 4],
      ['sheetSurface', 'ModalBottomSheet contentColor', 4],
    ]);
  });

  it('skips the sheet primitives that define the tokens', () => {
    expect(
      check(
        `export function SheetHeader() {
          return <Sheet><DrawerHeader title="x" /></Sheet>;
        }`,
        'apps/mobile/src/ui/primitives/sheet-header.tsx',
      ),
    ).toEqual([]);
  });
});
