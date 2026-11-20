export const zh = {
  'skills.empty': '{name} 还没有 Skill。可以在对话里让它安装一个。',
  'skills.modelOnly': '仅模型调用',
  'skills.back': '返回 Skill 列表',
  'skills.remove': '删除',
  'skills.removeLabel': '删除 /{name}',
  'skills.removeConfirm': '从 {bot} 的 Memory 删除 /{name}？删除会提交到 git，可从历史恢复。',
  'skills.cancel': '取消',
  'skills.loadFailed': '无法加载 Skill：{error}',
  'skills.retry': '重试',
  'skills.removeFailed': '无法删除 /{name}：{error}',
} as const;

export const en = {
  'skills.empty': '{name} has no Skills yet. Ask in chat to install one.',
  'skills.modelOnly': 'Model only',
  'skills.back': 'Back to Skills',
  'skills.remove': 'Delete',
  'skills.removeLabel': 'Delete /{name}',
  'skills.removeConfirm':
    "Delete /{name} from {bot}'s Memory? The deletion is committed and can be restored from git history.",
  'skills.cancel': 'Cancel',
  'skills.loadFailed': "Couldn't load Skills: {error}",
  'skills.retry': 'Retry',
  'skills.removeFailed': "Couldn't delete /{name}: {error}",
} satisfies Record<keyof typeof zh, string>;
