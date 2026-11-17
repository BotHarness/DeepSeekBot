import { useId, type ReactElement } from 'react';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { MODEL_BRAND_ICONS, type ModelBrand } from './model-brand-icons.js';

export type { ModelBrand };

export interface ModelIdentity {
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly name?: string | undefined;
}

const MODEL_FAMILIES: readonly (readonly [ModelBrand, RegExp])[] = [
  ['deepseek', /deepseek/],
  ['claude', /claude|\b(opus|sonnet|haiku)\b/],
  ['gemma', /gemma/],
  ['gemini', /gemini/],
  ['openai', /\b(chat)?gpt|\bo[1-9](\b|-)|codex|dall-e|whisper/],
  ['qwen', /qwen|qwq|qvq/],
  ['kimi', /kimi|moonshot/],
  ['glm', /\b(chat)?glm|zhipu/],
  ['grok', /grok/],
  ['mistral', /mistral|mixtral|codestral|devstral|magistral|pixtral/],
  ['llama', /llama/],
  ['minimax', /minimax|abab/],
  ['doubao', /doubao|\bseed-/],
  ['hunyuan', /hunyuan/],
  ['ernie', /ernie|wenxin/],
  ['step', /\bstep-/],
  ['yi', /\byi-/],
  ['baichuan', /baichuan/],
  ['cohere', /\bcommand-|\baya\b|cohere/],
  ['perplexity', /\bsonar\b|perplexity/],
  ['nvidia', /nemotron/],
  ['phi', /\bphi-?[0-9]/],
  ['internlm', /internlm|intern-s/],
  ['longcat', /longcat/],
  ['spark', /\bspark\b/],
];

const PROVIDER_BRANDS: readonly (readonly [ModelBrand, RegExp])[] = [
  ['deepseek', /deepseek/],
  ['openai', /openai|azure/],
  ['claude', /anthropic|claude/],
  ['gemini', /google|gemini|vertex/],
  ['qwen', /qwen|dashscope|alibaba|aliyun|bailian/],
  ['kimi', /moonshot|kimi/],
  ['glm', /zhipu|bigmodel|z\.?ai/],
  ['grok', /\bx\.?ai\b|grok/],
  ['mistral', /mistral/],
  ['minimax', /minimax/],
  ['doubao', /doubao|volcengine|ark/],
  ['openrouter', /openrouter/],
  ['ollama', /ollama/],
  ['siliconflow', /silicon/],
];

const FAMILY_PREFIXES: Partial<Record<ModelBrand, RegExp>> = {
  deepseek: /^deepseek/i,
  openai: /^(chat)?gpt/i,
  claude: /^claude/i,
  gemini: /^gemini/i,
  gemma: /^gemma/i,
  qwen: /^qwen/i,
  kimi: /^kimi/i,
  glm: /^(chat)?glm/i,
  grok: /^grok/i,
  mistral: /^mistral/i,
  llama: /^(meta[\s-]*)?llama/i,
  minimax: /^minimax/i,
  doubao: /^doubao/i,
  hunyuan: /^hunyuan/i,
  ernie: /^ernie/i,
  step: /^step/i,
  yi: /^yi/i,
  baichuan: /^baichuan/i,
  phi: /^phi/i,
  longcat: /^longcat/i,
};

const VENDOR_PREFIX = /^[^:/\s][^:/]{0,31}(?:: |\/)/;

function familyOf(text: string): ModelBrand | undefined {
  const lower = text.toLowerCase();
  return MODEL_FAMILIES.find(([, pattern]) => pattern.test(lower))?.[0];
}

export function modelBrand(identity: ModelIdentity): ModelBrand | undefined {
  const named = [identity.model, identity.name].filter(
    (value): value is string => value !== undefined && value !== '',
  );
  for (const text of named) {
    const brand = familyOf(text);
    if (brand !== undefined) return brand;
  }
  const provider = identity.provider?.toLowerCase();
  if (provider === undefined || provider === '') return undefined;
  return PROVIDER_BRANDS.find(([, pattern]) => pattern.test(provider))?.[0];
}

export function modelShortName(label: string, brand: ModelBrand | undefined): string {
  const stripped = label.replace(VENDOR_PREFIX, '').trim();
  const unprefixed =
    stripped === '' || (label.includes('/') && familyOf(stripped) === undefined) ? label : stripped;
  const prefix = brand === undefined ? undefined : FAMILY_PREFIXES[brand];
  if (prefix === undefined || brand !== familyOf(unprefixed)) return unprefixed;
  const rest = unprefixed.replace(prefix, '').replace(/^[\s\-_.:]+/, '');
  if (!/[0-9a-z]/i.test(rest)) return unprefixed;
  return /\s/.test(rest) ? rest : rest.replaceAll(/[-_]+/g, ' ');
}

export function ModelBrandIcon({
  brand,
  size = 14,
}: {
  brand: ModelBrand | undefined;
  size?: number;
}): ReactElement {
  const id = useId().replaceAll(':', '');
  if (brand === undefined) return <ChannelSidebarIcon name="cpu" size={size} />;
  const icon: { title: string; markup: string; evenodd?: boolean } = MODEL_BRAND_ICONS[brand];
  return (
    <svg
      data-model-brand={brand}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule={icon.evenodd === true ? 'evenodd' : undefined}
      aria-hidden="true"
      dangerouslySetInnerHTML={{
        __html: icon.markup.replaceAll('{id}', `bh-model-${brand}-${id}`),
      }}
    />
  );
}
