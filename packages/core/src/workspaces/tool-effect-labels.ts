import type { ToolEffects } from './tool-effects.js';

export function toolEffectLabels(effects: ToolEffects, locale: 'en' | 'zh'): string[] {
  const labels =
    locale === 'zh'
      ? {
          changes: { none: '只读', reversible: '可撤销更改', irreversible: '不可撤销' },
          reach: { local: '本机', memory: '记忆', workspace: '工作区', external: '外部影响' },
          personalData: '涉及个人数据',
          secrets: '使用密钥',
          management: '权限管理',
        }
      : {
          changes: {
            none: 'Read only',
            reversible: 'Reversible changes',
            irreversible: 'Irreversible',
          },
          reach: {
            local: 'Local',
            memory: 'Memory',
            workspace: 'Workspace',
            external: 'External effect',
          },
          personalData: 'Personal data',
          secrets: 'Uses secrets',
          management: 'Permission management',
        };
  return [
    labels.changes[effects.changes],
    labels.reach[effects.reach],
    ...(effects.personalData ? [labels.personalData] : []),
    ...(effects.secrets ? [labels.secrets] : []),
    ...(effects.authority === 'management' ? [labels.management] : []),
  ];
}
