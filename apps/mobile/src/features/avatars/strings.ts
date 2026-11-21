export const en = {
  avatarEditor: {
    title: 'Customize',
    style: 'Avatar style',
    pixel: 'Pixel',
    tilties: 'Tilties',
    collections: 'Tilties collections',
    tiltiesName: (en: string, _zh: string) => en,
    preview: 'Avatar preview',
    saveFailed: 'Could not save the avatar. Try again.',
    unavailable: 'Open Bot creation to customize its avatar.',
  },
  avatarTitle: 'Avatar',
  avatarChange: 'Change avatar',
  avatarChoose: 'Choose photo',
  avatarRemove: 'Remove avatar',
  avatarPickFailed: 'Could not use that photo.',
  avatarSaveFailed: 'Could not save avatar.',
};

export const zh: typeof en = {
  avatarEditor: {
    title: '捏人',
    style: '头像风格',
    pixel: '像素风',
    tilties: '歪头团',
    collections: '歪头团分组',
    tiltiesName: (_en, zh) => zh,
    preview: '头像预览',
    saveFailed: '头像未保存，请重试。',
    unavailable: '请先打开创建 Bot。',
  },
  avatarTitle: '头像',
  avatarChange: '更换头像',
  avatarChoose: '选择头像',
  avatarRemove: '移除头像',
  avatarPickFailed: '无法使用这张照片。',
  avatarSaveFailed: '保存头像失败。',
};
