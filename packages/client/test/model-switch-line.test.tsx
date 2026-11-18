import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { parseChannelMessage } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { ModelSwitchLine, modelSwitchReason } from '../src/client/model-switch-line.js';

const notice = {
  id: 'model-switch-1',
  at: '2026-11-18T00:00:00.000Z',
  body: '',
  author: { kind: 'system' },
  modelSwitch: {
    botSlug: 'ada',
    botName: 'Ada',
    sessionId: 's-1',
    from: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
    to: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
    reason: 'quota',
    until: '2026-11-22T10:00:00.000Z',
  },
};

it('parses a Model Switch Notice only from the system and only when complete (#4417)', () => {
  expect(parseChannelMessage(notice)?.modelSwitch).toEqual(notice.modelSwitch);
  expect(parseChannelMessage({ ...notice, author: { kind: 'bot', slug: 'ada' } })).toBeUndefined();
  expect(parseChannelMessage({ ...notice, modelSwitch: { botSlug: 'ada' } })).toBeUndefined();
});

it('renders the switch line with both routes and the reason (#4417)', () => {
  const record = parseChannelMessage(notice)!.modelSwitch!;
  const { until: _until, ...withoutUntil } = record;
  const html = renderToStaticMarkup(
    <ModelSwitchLine messageId="model-switch-1" record={record} bots={[]} t={zhTranslate} />,
  );
  expect(html).toContain('data-model-switch');
  expect(html).toContain('切换模型');
  expect(html).toContain('opencode-go/deepseek-v4.1-flash');
  expect(html).toContain('deepseek-official/deepseek-v4-pro');
  expect(modelSwitchReason(record, zhTranslate)).toMatch(/^额度用完，.+ 重置$/u);
  expect(modelSwitchReason({ ...withoutUntil, reason: 'credential' }, zhTranslate)).toBe(
    '凭据不可用',
  );
});
