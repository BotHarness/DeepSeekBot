export const en = {
  privateInputHint: 'Open this request in the conversation and fill in the private form.',
  privateInputTitle: (bot: string) => `${bot} needs private information`,
  privateInputNote: 'Open this request in the conversation and fill in the private form.',
  privateInputDone: 'Handled',
  privateInputOpen: 'Fill privately',
  privateInputSubmit: 'Save privately',
  privateInputRefreshError: 'Could not refresh this request. Try again.',
  privateInputError: 'Could not save. Your values are still here; try again.',
  privateInputEmpty: 'This request is no longer available.',
  privateInputSecureNote: 'Sent only to your computer. Kept out of chat history.',
};

export const zh: typeof en = {
  privateInputHint: '在聊天中打开这项请求，使用私密表单填写。',
  privateInputTitle: (bot: string) => `${bot} 需要私密信息`,
  privateInputNote: '在聊天中打开这项请求，使用私密表单填写。',
  privateInputDone: '已处理',
  privateInputOpen: '私密填写',
  privateInputSubmit: '私密保存',
  privateInputRefreshError: '未能刷新这项请求，再试一次。',
  privateInputError: '保存失败，内容已保留，再试一次。',
  privateInputEmpty: '这项请求已不可用。',
  privateInputSecureNote: '仅发送到你的电脑，不进入聊天记录。',
};
