import { Document, isMap, isSeq, parseDocument } from 'yaml';

export function genuiPreviewPatch(source, browserPath) {
  const parsed = parseDocument(source, {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value) => value }],
  });
  if (parsed.errors.length || !isSeq(parsed.contents))
    throw new Error('Cannot read composed Profile for GenUI preview configuration');
  const found = [];
  const visit = (rows) => {
    for (const row of rows.items) {
      if (!isMap(row)) continue;
      if (row.get('id') === 'botharness-core') found.push(row);
      if (isSeq(row.get('config'))) visit(row.get('config'));
    }
  };
  visit(parsed.contents);
  const row = found[0];
  if (
    found.length !== 1 ||
    row.get('name') !== '@botharness/core' ||
    (row.has('disabled') && row.get('disabled') !== false)
  )
    throw new Error('GenUI preview configuration requires one enabled BotHarness core Plugin');
  const output = new Document([]);
  const original = row.get('config');
  if (original !== undefined && (!isMap(original) || original.tag))
    throw new Error('GenUI preview configuration requires a static core config mapping');
  const config = original?.clone() ?? output.createNode({});
  config.set('genuiPreviewBrowserPath', browserPath);
  const patch = output.createNode({ id: 'botharness-core' });
  patch.set('config', config);
  output.contents.add(patch);
  return String(output);
}
