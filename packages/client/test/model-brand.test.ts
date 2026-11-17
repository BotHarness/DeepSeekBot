import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ModelBrandIcon, modelBrand, modelShortName } from '../src/client/model-brand.js';
import { MODEL_BRAND_ICONS } from '../src/client/model-brand-icons.js';

describe('model brand', () => {
  it('matches the model family before the provider that serves it', () => {
    expect(modelBrand({ provider: 'openrouter', model: 'deepseek/deepseek-v4-pro' })).toBe(
      'deepseek',
    );
    expect(modelBrand({ provider: 'siliconflow', model: 'deepseek-ai/DeepSeek-V3.2' })).toBe(
      'deepseek',
    );
    expect(modelBrand({ provider: 'azure', model: 'gpt-6.1-sol' })).toBe('openai');
    expect(modelBrand({ provider: 'bedrock', model: 'claude-opus-5-5' })).toBe('claude');
    expect(modelBrand({ provider: 'ollama', model: 'qwen3:8b' })).toBe('qwen');
    expect(modelBrand({ provider: 'custom', model: 'x', name: 'Kimi K2' })).toBe('kimi');
    expect(modelBrand({ provider: 'vertex', model: 'gemma-3-27b' })).toBe('gemma');
    expect(modelBrand({ provider: 'zhipu', model: 'glm-5' })).toBe('glm');
    expect(modelBrand({ provider: 'openai', model: 'o4-mini' })).toBe('openai');
  });

  it('falls back to the provider, then to nothing', () => {
    expect(modelBrand({ provider: 'openrouter', model: 'unknown-model' })).toBe('openrouter');
    expect(modelBrand({ provider: 'deepseek', model: 'chat' })).toBe('deepseek');
    expect(modelBrand({ provider: 'my-proxy', model: 'house-model' })).toBeUndefined();
  });

  it('drops the family name the icon already shows', () => {
    expect(modelShortName('GPT-6.1 Sol', 'openai')).toBe('6.1 Sol');
    expect(modelShortName('Claude Opus 5.5', 'claude')).toBe('Opus 5.5');
    expect(modelShortName('DeepSeek V4 Pro', 'deepseek')).toBe('V4 Pro');
    expect(modelShortName('deepseek-v4-pro', 'deepseek')).toBe('v4 pro');
    expect(modelShortName('deepseek/deepseek-v4', 'deepseek')).toBe('v4');
    expect(modelShortName('Qwen3-Max', 'qwen')).toBe('3 Max');
    expect(modelShortName('qwen3:8b', 'qwen')).toBe('3:8b');
    expect(modelShortName('Meta Llama 4 Maverick', 'llama')).toBe('4 Maverick');
  });

  it('keeps the name when the icon does not say the family', () => {
    expect(modelShortName('o3', 'openai')).toBe('o3');
    expect(modelShortName('DeepSeek-V41-Long/Reasoning', 'deepseek')).toBe('V41 Long/Reasoning');
    expect(modelShortName('DeepSeek', 'deepseek')).toBe('DeepSeek');
    expect(modelShortName('house-model', undefined)).toBe('house-model');
    expect(modelShortName('Kimi K2', 'openrouter')).toBe('Kimi K2');
  });

  it('renders the brand logo with ids unique to each icon', () => {
    const markup = renderToStaticMarkup(
      createElement('div', null, [
        createElement(ModelBrandIcon, { key: 'a', brand: 'gemini' }),
        createElement(ModelBrandIcon, { key: 'b', brand: 'gemini' }),
      ]),
    );
    const ids = [...markup.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(markup).not.toContain('{id}');
    expect(markup).toContain('data-model-brand="gemini"');
    expect(renderToStaticMarkup(createElement(ModelBrandIcon, { brand: undefined }))).not.toContain(
      'data-model-brand',
    );
  });

  it('ships a square logo for every brand', () => {
    for (const icon of Object.values(MODEL_BRAND_ICONS)) {
      expect(icon.markup).toMatch(/^<(path|g|defs|circle|rect)/);
      expect(icon.markup).not.toMatch(/<script|on\w+=/i);
    }
  });
});
