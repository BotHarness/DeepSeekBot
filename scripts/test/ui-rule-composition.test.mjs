import { describe, expect, it } from 'vitest';
import { parseSource, walk } from '../check-ui-rules.mjs';
import { catalogueExports, desktopComposition, renderCatalogue } from '../ui-rule-composition.mjs';

const designSystem = 'packages/client/src/client/ds/dense.tsx';
const feature = 'packages/client/src/client/feature.tsx';
const names = new Set(['Button', 'SettingsRow', 'Icon', 'Select']);
const inspect = (source) => desktopComposition(feature, parseSource(source, feature), walk, names);

describe('G1 rule 7', () => {
  it('requires a replacement entry for each exported component, including aliases', () => {
    const source = `
export const DenseButton = forwardRef(() => <button />);
const DenseRow = () => <div />;
export { DenseRow as ListRow };
export const ConfigContext = createContext(null);
`;
    const entries = catalogueExports(parseSource(source, designSystem), designSystem, walk);
    expect(entries.map(({ name }) => name)).toEqual(['DenseButton', 'ListRow']);
    const result = renderCatalogue(entries, {
      'dense.tsx#DenseButton': 'a hand-styled compact button.',
      'dense.tsx#RetiredButton': 'an old control.',
    });
    expect(result.missing.map(({ text }) => text)).toEqual(['dense.tsx#ListRow']);
    expect(result.stale).toEqual(['dense.tsx#RetiredButton']);
    const updated = renderCatalogue(entries, {
      'dense.tsx#ListRow': 'an unaligned compact row.',
      'dense.tsx#DenseButton': 'a hand-styled compact button.',
    });
    expect(updated.missing).toEqual([]);
    expect(updated.stale).toEqual([]);
    expect(updated.markdown).toContain('[ListRow](dense.tsx) replaces an unaligned compact row.');
  });

  it('blocks reused design-system names and feature copies built from raw controls', () => {
    const source = `
import { Button as TobsButton } from './ds/button.js';
import { Icon } from './ds/icon.js';
const Button = () => <TobsButton />;
const SearchButton = () => <button><Icon name="search" /></button>;
const SettingRow = () => <div />;
const RetryButton = () => <TobsButton />;
const Heading = () => <div />;
`;
    expect(inspect(source).map(({ text }) => text)).toEqual([
      'Button',
      'SearchButton',
      'SettingRow',
    ]);
  });

  it('accepts a feature component composed from the owning design-system primitive', () => {
    const source = `
import { Select as TobsSelect } from './ds/select.js';
const ProviderSelect = () => <TobsSelect items={providers} />;
`;
    expect(inspect(source)).toEqual([]);
  });
});

describe('G1 rule 11', () => {
  it('flags repeated settings slots, explicit multiple description lines, and two controls', () => {
    const source = `
import { SettingsRow as Row } from './ds/settings-row.js';
const view = <Row title={title} title={otherTitle}
  description={<><p>{hint}</p><p>{anotherHint}</p></>}
  control={<><Switch /><Button /></>}
/>;
`;
    expect(inspect(source).map(({ rule, text }) => [rule, text])).toEqual([
      ['settingsRow', 'duplicate title'],
      ['settingsRow', 'multiple description lines'],
      ['settingsRow', 'multiple controls'],
    ]);
  });

  it('counts separately visible primary actions in one surface, including an inline footer', () => {
    const source = `
import { Button as Action } from './ds/button.js';
const view = <Dialog footer={<Action variant="primary">{save}</Action>}>
  {enabled && <Action variant="primary">{apply}</Action>}
  <Dialog><Action variant="primary">{finish}</Action></Dialog>
</Dialog>;
`;
    expect(inspect(source).map(({ rule, text }) => [rule, text])).toEqual([
      ['primaryAction', 'Dialog'],
    ]);
  });

  it('counts the supplied submit action of a FormDialog', () => {
    const source = `
const view = <FormDialog onSubmit={submit} secondary={<Button variant="primary">{extra}</Button>} />;
`;
    expect(inspect(source)).toMatchObject([{ rule: 'primaryAction', text: 'FormDialog' }]);
  });

  it('accepts a single control, exclusive branches, and a primary action in a nested dialog', () => {
    const source = `
const view = <Dialog>
  <SettingsRow title={title} description={hint} control={editing ? <Input /> : <Switch />} />
  {editing ? <Button variant="primary">{save}</Button> : <Button variant="primary">{edit}</Button>}
  <Dialog><Button variant="primary">{done}</Button></Dialog>
</Dialog>;
`;
    expect(inspect(source)).toEqual([]);
  });
});
