import { locale } from '../strings';

const en = {
  title: 'Create Bot',
  name: 'Name',
  persona: 'Persona',
  personaHint: 'How should this Bot behave?',
  destination: 'Environment',
  choose: 'Choose an environment',
  details: 'Bio and tags',
  bio: 'Bio',
  tags: 'Tags, separated by commas',
  create: 'Create Bot',
  retry: 'Check and resume',
  working: 'Checking creation…',
  accepted: 'Your computer has accepted this creation. You can leave this page.',
  uncertain: 'Creation has not been confirmed. Check the same operation to continue safely.',
  completed: 'Your Bot is ready',
  open: 'Open Bot',
  resume: 'Resume Bot creation',
  another: 'Create another Bot',
  edit: 'Edit before sending',
  pair: 'Pair a computer',
  more: 'Show bio and tags',
  less: 'Hide bio and tags',
  model: 'Uses this computer’s default model. You can configure it in the Bot’s settings.',
  setupModel: 'Model settings',
  targetFixed: 'The environment and details are fixed for this creation.',
  beforeSend: 'Nothing has been sent for creation. You can edit before trying again.',
  errors: {
    'storage-invalid':
      'Could not read the saved creation. Keep this app’s data and try reopening the app.',
    'storage-write': 'Could not save your creation on this phone. Free some space and try again.',
    'name-required': 'Enter a name for your Bot.',
    'target-unpaired':
      'The original computer pairing is unavailable. Your saved creation has been kept.',
    'host-update-required':
      'Update DeepSeekBot on this computer to create Bots safely from your phone.',
    'invalid-receipt':
      'The computer did not confirm this creation. Check again to recover the same Bot.',
    unreachable:
      'Could not reach this computer. Your creation is saved. Check again when connected.',
    'device-revoked':
      'This phone was removed from the computer. Your saved creation has been kept.',
    'device-unknown':
      'This computer no longer recognizes the phone. Your saved creation has been kept.',
    'device-credential-missing': 'This computer needs the phone’s pairing credential.',
    'creation-key-conflict':
      'This creation has different saved details. It cannot be retried with changed input.',
    'creation-identity-unavailable':
      'The original Bot is archived or deleted. This creation cannot recreate it.',
    'creation-needs-repair':
      'The computer needs to repair this creation. Your original Bot has been kept.',
  },
  refused: 'This computer could not finish creation. The saved operation has been kept.',
};
const zh: typeof en = {
  title: '创建 Bot',
  name: '名称',
  persona: '人设',
  personaHint: '这个 Bot 应该如何回应和行动？',
  destination: '环境',
  choose: '选择环境',
  details: '简介和标签',
  bio: '简介',
  tags: '标签，用逗号分隔',
  create: '创建 Bot',
  retry: '检查并恢复',
  working: '正在确认创建结果…',
  accepted: '电脑已接收此次创建。你可以离开此页面。',
  uncertain: '尚未确认创建结果。检查并恢复此次操作，即可安全继续。',
  completed: 'Bot 已创建',
  open: '打开 Bot',
  resume: '继续创建 Bot',
  another: '再创建一个 Bot',
  edit: '修改后再提交',
  pair: '配对电脑',
  more: '显示简介和标签',
  less: '收起简介和标签',
  model: '使用此电脑的默认模型，可在 Bot 设置中配置。',
  setupModel: '模型设置',
  targetFixed: '此次创建的环境和内容已固定。',
  beforeSend: '尚未发送创建请求，可以修改后再提交。',
  errors: {
    'storage-invalid': '无法读取已保存的创建操作。请保留 App 数据，并尝试重新打开 App。',
    'storage-write': '无法在手机上保存此次创建。请释放一些空间后重试。',
    'name-required': '请输入 Bot 名称。',
    'target-unpaired': '原电脑配对不可用，已保留此次创建。',
    'host-update-required': '请更新此电脑上的 DeepSeekBot，以便从手机安全创建 Bot。',
    'invalid-receipt': '电脑尚未确认此次创建。请再次检查，恢复同一个 Bot。',
    unreachable: '无法连接此电脑，已保存此次创建。连接后请再次检查。',
    'device-revoked': '此手机已被电脑移除，已保留此次创建。',
    'device-unknown': '电脑已不再识别此手机，已保留此次创建。',
    'device-credential-missing': '此电脑需要手机的配对凭据。',
    'creation-key-conflict': '此次创建的已保存内容不一致，不能使用修改后的内容重试。',
    'creation-identity-unavailable': '原 Bot 已归档或删除，此次操作不会重新创建它。',
    'creation-needs-repair': '电脑需要修复此次创建，已保留原 Bot。',
  },
  refused: '电脑无法完成此次创建，已保留原操作。',
};
export const creationCopy = locale === 'zh' ? zh : en;
export function creationError(code: string): string {
  const entry = Object.entries(creationCopy.errors).find(([key]) => key === code);
  return entry?.[1] ?? `${creationCopy.refused} (${code})`;
}
