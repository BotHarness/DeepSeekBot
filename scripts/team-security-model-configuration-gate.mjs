export function runModelConfigurationGate(s, { member, tag }, check) {
  const operator = `operator-${tag}`;
  s.member(operator, [], ['admin']);
  const viewer = s.cli(['team-mode', 'status'], { as: operator }).viewer;
  check('Admin holds models.configure by default', viewer.permissions.includes('models.configure'));
  check(
    'Admin lacks modelSources.manage by default',
    !viewer.permissions.includes('modelSources.manage'),
  );

  const catalog = s.cli(['model-catalog']);
  const route = catalog.models.find(
    ({ provider, model }) => provider === 'opencode-go' && model === 'deepseek-v4.1-flash',
  );
  if (!route) throw new Error('Expected the OpenCode Go model in the isolated Host');
  const { provider, model } = route;
  const { preset: pinned } = s.cli(['model-default']);
  const updateDefault = ['model-preset-update', pinned.id, '--name', `M15 Default ${tag}`];
  const deleteDefault = [
    'model-preset-delete',
    pinned.id,
    '--expected-revision',
    String(pinned.revision),
    '--confirm',
  ];
  const create = [
    'model-preset-create',
    '--name',
    `M15 ${tag}`,
    '--orchestrator-provider',
    provider,
    '--orchestrator-model',
    model,
    '--assignment-provider',
    provider,
    '--assignment-model',
    model,
  ];
  const createGroup = ['model-group-create', '--name', `M15 routes ${tag}`, '--members-stdin'];
  const members = JSON.stringify({ members: [{ kind: 'model', provider, model }] });
  const { preset } = s.cli(create, { as: operator });
  const { group } = s.cli(createGroup, { as: operator, input: members });
  check(
    'Admin created the preset and the Routing Group',
    preset?.revision === 1 && group?.revision === 1,
  );
  const sub = JSON.stringify({
    choices: [{ kind: 'group', group: group.id }],
    default: { kind: 'group', group: group.id },
  });
  const setSub = (id, revision) => [
    'model-preset-sub-set',
    id,
    '--expected-revision',
    String(revision),
    '--plan-stdin',
  ];
  const memberSub = s.cli(['model-preset-sub', pinned.id], { as: member });
  check(
    'Member reads the pinned sub choices',
    memberSub.id === pinned.id && memberSub.revision === pinned.revision,
  );
  const deniedSub = s.cli(setSub(pinned.id, pinned.revision), {
    as: member,
    input: sub,
    allowFail: true,
  });
  check(
    'Member cannot replace the pinned sub choices',
    deniedSub.error?.code === 'permission-required',
  );
  const changedSub = s.cli(setSub(preset.id, preset.revision), { as: operator, input: sub });
  check(
    'Admin can save a Routing Group as the only sub choice',
    changedSub.sub?.choices.length === 1 && changedSub.sub.default?.group === group.id,
  );
  const staleSub = s.cli(setSub(preset.id, preset.revision), {
    as: operator,
    input: sub,
    allowFail: true,
  });
  check('A stale sub write is refused', staleSub.error?.code === 'stale-setting');

  const update = ['model-preset-update', preset.id, '--name', `M15 edited ${tag}`];
  const updateGroup = ['model-group-update', group.id, '--name', `M15 routes edited ${tag}`];
  const deletePreset = (revision) => [
    'model-preset-delete',
    preset.id,
    '--expected-revision',
    String(revision),
    '--confirm',
  ];
  const deleteGroup = ['model-group-delete', group.id];
  for (const args of [
    [
      'home-model-set',
      '--provider',
      provider,
      '--model',
      model,
      '--expected-revision',
      String(catalog.defaultRevision ?? 0),
    ],
    create,
    updateDefault,
    deleteDefault,
    update,
    deletePreset(1),
    createGroup,
    updateGroup,
    deleteGroup,
  ]) {
    const result = s.cli(args, {
      as: member,
      allowFail: true,
      input: args.includes('--members-stdin') ? members : undefined,
    });
    check(
      `Member ${args[0]} requires models.configure`,
      result?.error?.code === 'permission-required',
      result?.error?.code,
    );
  }

  const list = s.cli(['model-presets', '--include-usage'], { as: member });
  const groups = s.cli(['model-groups'], { as: member });
  check('Member reads the pinned Default first', list.presets[0]?.id === pinned.id);
  const pinnedRefusal = s.cli(deleteDefault, { as: operator, allowFail: true });
  check(
    'Admin cannot delete the pinned Default',
    pinnedRefusal?.error?.code === 'default-preset-pinned',
  );
  check(
    'Refused writes leave the pinned Default intact',
    s.cli(['model-default']).preset.revision === pinned.revision,
  );
  const defaultModel = s.cli(['model-catalog'], { as: member }).default;
  check(
    'Member reads all three shared settings',
    list.presets.some(({ id }) => id === preset.id) &&
      list.usage.some(({ presetId }) => presetId === preset.id) &&
      groups.groups.some(({ id }) => id === group.id) &&
      JSON.stringify(defaultModel) === JSON.stringify(catalog.default),
  );

  const changed = s.cli(update, { as: operator });
  const reordered = s.cli(updateGroup, { as: operator });
  check(
    'Admin can edit both entries',
    changed.preset.revision === 3 &&
      reordered.group.revision === 2 &&
      changed.preset.sub?.choices.length === 1,
  );
  const deleted = s.cli(deletePreset(3), { as: operator });
  const removed = s.cli(deleteGroup, { as: operator });
  check('Admin can delete both entries', deleted.id === preset.id && removed.group.id === group.id);
}
