export const en = {
  prompts: {
    title: 'Prompt presets',
    hint: 'Behavior text for Bots',
    global: 'Global preset',
    globalHint: 'Every Bot that has not chosen its own preset uses this one.',
    globalTag: 'Global',
    builtIn: 'Built-in',
    presets: 'Presets',
    presetsHint: 'Create and edit presets in BotHarness on your computer.',
    none: 'No presets yet',
    changed: (count: number) =>
      count === 0 ? 'No edits' : `${count} ${count === 1 ? 'part' : 'parts'} changed`,
    defaultChanged: 'Default updated',
    failed: 'Could not change the global preset.',
  },
};

export const zh: typeof en = {
  prompts: {
    title: '提示词预设',
    hint: 'Bot 的行为文字',
    global: '全局预设',
    globalHint: '没有单独选择预设的 Bot 都使用它。',
    globalTag: '全局',
    builtIn: '内置',
    presets: '预设',
    presetsHint: '新建和编辑预设请在电脑上的 BotHarness 里进行。',
    none: '还没有预设',
    changed: (count: number) => (count === 0 ? '没有改动' : `改了 ${count} 处`),
    defaultChanged: '默认已更新',
    failed: '没能更换全局预设。',
  },
};
