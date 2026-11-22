export const zh = {
  'privateAccounts.title': '密钥',
  'privateAccounts.note':
    '这个 Bot 通过私密输入向你要过的密钥，比如 API key、令牌或登录凭据。这里永远不会显示密钥的值。',
  'privateAccounts.loading': '正在加载密钥…',
  'privateAccounts.unavailable': '暂时无法读取密钥列表，这不代表没有保存的密钥。',
  'privateAccounts.empty': '这个 Bot 以后通过私密输入向你要的密钥会显示在这里。',
  'privateAccounts.locked': '这个 Host 未开启私密信息的执行，所以不能替换密钥；仍然可以删除。',
  'privateAccounts.status.configured': '可用',
  'privateAccounts.status.replacing': '正在替换',
  'privateAccounts.status.unavailable': '不可用',
  'privateAccounts.optional': '{label}（可选）',
  'privateAccounts.purpose': '用途：{purpose}',
  'privateAccounts.fields': '字段：{fields}',
  'privateAccounts.setAt': '配置时间：{time}',
  'privateAccounts.openRequest': '查看原始请求',
  'privateAccounts.cancelReplace': '取消替换',
  'privateAccounts.remove': '删除',
  'privateAccounts.removeConfirm':
    '删除密钥「{account}」？这会停止本地使用并立即清除保存的值，但不会在服务商那里撤销令牌；如果令牌可能泄露，请到服务商处轮换。',
  'privateAccounts.mcpTitle': '已记住的 MCP 服务',
  'privateAccounts.mcpConnected': '已连接',
  'privateAccounts.mcpStopped': '未连接',
  'privateAccounts.mcpCommand': '启动命令：{command}',
  'privateAccounts.mcpAccount': '使用的密钥：{account}',
  'privateAccounts.mcpApprovedAt': '{time}批准',
  'privateAccounts.mcpShared': '由这个 Bot 配置 · 其他 Bot 可在各自的设置里启用',
  'privateAccounts.mcpSharedBy': '由 {bot} 配置 · 打开开关后这个 Bot 也能使用',
  'privateAccounts.mcpEnable': '在这个 Bot 启用 {server}',
  'privateAccounts.mcpRemove': '移除',
  'privateAccounts.mcpRemoveConfirm':
    '移除 MCP 服务“{server}”？所有 Bot 上的它都会立即停止，之后不再自动连接。',
  'privateInput.title': '私密信息',
  'privateInput.pending': '需要填写',
  'privateInput.received': '已提交',
  'privateInput.replace': '替换',
  'privateInput.revoke': '撤销',
  'privateInput.replacementNote': '填写新的私密信息；旧值不会被取回。提交后旧引用失效。',
  'privateInput.revoked': '本地访问已撤销；服务端令牌和已完成的操作不会因此撤回。',
  'privateInput.superseded': '此配置已被新的私密信息替换，旧引用不能再使用。',
  'privateInput.unavailable': '此账号配置不可用，请向 Bot 发起新的私密输入请求。',
  'privateInput.stopSummary':
    '正在使用的任务：已停止 {stopped}，已完成 {completed}，结果不确定 {uncertain}。',
  'privateInput.expiresAt': '有效期至 {time}',
  'privateInput.expired': '此私密输入请求已过期，请向 Bot 发起新请求',
  'privateInput.account': '账号',
  'privateInput.connectRefused': 'Connect 尚未端到端加密。请在本机或通过 Tailscale 填写密钥。',
  'privateInput.note': '仅 Host 保存原值。Bot 只获得引用；执行仍需按现有权限批准。',
  'privateInput.configured': '已配置私密信息，输入内容已清除。',
  'privateInput.submit': '私密提交',
  'privateInput.cancel': '取消',
  'privateInput.error': '未能完成请求。请核对状态；如需重新填写，请勿粘贴到聊天中。',
  'privateInput.refused': '未接收（原因代码 {reason}）。{detail}反馈问题时可附上这个原因代码。',
  'privateInput.refused.not-owner': '只有 Bot 的 Owner 可以提交私密信息。',
  'privateInput.refused.not-pending':
    '这个请求在 Host 上已不再等待输入，可能已过期、已被回答，或在 Host 重启后失效。让 Bot 重新发起请求。',
  'privateInput.refused.busy': '这个请求的另一次提交还在保存中，请稍候再查看状态。',
  'privateInput.refused.invalid-fields': '有必填项为空，或提交了不属于这个请求的字段。',
  'privateInput.refused.store-unavailable': 'Host 的凭据存储不可用，未保存任何内容。',
  'privateInput.refused.expired': '保存过程中请求已过期，未保留任何内容。',
  'privateInput.refused.version-changed':
    '保存时这个账户已被另一个请求修改，改用这个账户最新的卡片。',
  'privateInput.refused.save-failed': 'Host 无法把私密信息写入凭据存储，未保留任何内容。',
  'privateInput.refused.not-committed':
    '私密信息已写入，但 Host 无法在聊天中记录结果，因此已丢弃。',
  'privateInput.refused.unknown': 'Host 没有说明原因。',
} as const;

export const en = {
  'privateAccounts.title': 'Secrets',
  'privateAccounts.note':
    'Secrets this Bot asked you for through private input, such as API keys, tokens or sign-in credentials. Values are never shown here.',
  'privateAccounts.loading': 'Loading secrets…',
  'privateAccounts.unavailable':
    'Secrets cannot be read right now. This does not mean none are stored.',
  'privateAccounts.empty': 'Secrets this Bot asks you for through private input will appear here.',
  'privateAccounts.locked':
    'This Host has private information execution turned off, so secrets cannot be replaced. You can still remove them.',
  'privateAccounts.status.configured': 'Active',
  'privateAccounts.status.replacing': 'Being replaced',
  'privateAccounts.status.unavailable': 'Unavailable',
  'privateAccounts.optional': '{label} (optional)',
  'privateAccounts.purpose': 'Purpose: {purpose}',
  'privateAccounts.fields': 'Fields: {fields}',
  'privateAccounts.setAt': 'Configured {time}',
  'privateAccounts.openRequest': 'Open original request',
  'privateAccounts.cancelReplace': 'Cancel replacement',
  'privateAccounts.remove': 'Remove',
  'privateAccounts.removeConfirm':
    'Remove secret “{account}”? This stops local use and erases the stored values now, but does not revoke the token at the provider. Rotate it there if it may have leaked.',
  'privateAccounts.mcpTitle': 'Remembered MCP servers',
  'privateAccounts.mcpConnected': 'Connected',
  'privateAccounts.mcpStopped': 'Not connected',
  'privateAccounts.mcpCommand': 'Command: {command}',
  'privateAccounts.mcpAccount': 'Secret used: {account}',
  'privateAccounts.mcpApprovedAt': 'Approved {time}',
  'privateAccounts.mcpShared': 'Set up by this Bot · other Bots can enable it in their settings',
  'privateAccounts.mcpSharedBy': 'Set up by {bot} · turn on to let this Bot use it',
  'privateAccounts.mcpEnable': 'Enable {server} for this Bot',
  'privateAccounts.mcpRemove': 'Remove',
  'privateAccounts.mcpRemoveConfirm':
    'Remove the MCP server "{server}"? It stops now for every Bot and will not reconnect.',
  'privateInput.title': 'Private information',
  'privateInput.pending': 'Input needed',
  'privateInput.received': 'Submitted',
  'privateInput.replace': 'Replace',
  'privateInput.revoke': 'Revoke',
  'privateInput.replacementNote':
    'Provide new private information; old values are never retrieved. Submission invalidates old references.',
  'privateInput.revoked':
    'Local access revoked. Remote tokens and completed effects are unchanged.',
  'privateInput.superseded':
    'New private information replaced this configuration. Old references cannot be used.',
  'privateInput.unavailable':
    'This account configuration is unavailable. Ask the Bot for a new private-input request.',
  'privateInput.stopSummary':
    'Active uses: {stopped} stopped, {completed} completed, {uncertain} uncertain.',
  'privateInput.expiresAt': 'Expires at {time}',
  'privateInput.expired': 'This private input request has expired. Ask the Bot for a new request.',
  'privateInput.account': 'Account',
  'privateInput.connectRefused':
    'Connect is not end-to-end encrypted. Enter secrets on this Host or over Tailscale.',
  'privateInput.note':
    'Only the Host stores the values. The Bot receives references; execution still follows existing approval.',
  'privateInput.configured': 'Private information configured. Input values cleared.',
  'privateInput.submit': 'Submit privately',
  'privateInput.cancel': 'Cancel',
  'privateInput.error':
    'The request could not be completed. Check its status; keep any replacement values out of Chat.',
  'privateInput.refused':
    'Not received (reason code {reason}). {detail} Include this reason code when you report the problem.',
  'privateInput.refused.not-owner': 'Only the Bot Owner can submit private information.',
  'privateInput.refused.not-pending':
    'This request is no longer open on the Host. It may have expired, been answered, or been lost when the Host restarted. Ask the Bot for a new request.',
  'privateInput.refused.busy':
    'Another submission for this request is still being saved. Wait a moment and check its status.',
  'privateInput.refused.invalid-fields':
    'A required field is empty, or a field does not belong to this request.',
  'privateInput.refused.store-unavailable':
    'The Host credential store is unavailable, so nothing was saved.',
  'privateInput.refused.expired': 'The request expired while saving, so nothing was kept.',
  'privateInput.refused.version-changed':
    'Another request changed this account while saving. Use the latest card for this account.',
  'privateInput.refused.save-failed':
    'The Host could not write the private information to its credential store, so nothing was kept.',
  'privateInput.refused.not-committed':
    'The private information was written, but the Host could not record the result in the chat, so it was discarded.',
  'privateInput.refused.unknown': 'The Host did not give a reason.',
} satisfies Record<keyof typeof zh, string>;
