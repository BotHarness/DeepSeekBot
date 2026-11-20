import webp from '../assets/tilties.json';

const collections = [
  {
    id: 'ai',
    en: 'AI Girls',
    zh: 'AI 娘',
    names: [
      ['deepseek', 'DeepSeek', 'DeepSeek 娘'],
      ['gpt', 'GPT', 'GPT 娘'],
      ['claude', 'Claude', 'Claude 娘'],
      ['gemini', 'Gemini', 'Gemini 娘'],
      ['qwen', 'Qwen', '通义千问娘'],
      ['doubao', 'Doubao', '豆包娘'],
      ['kimi', 'Kimi', 'Kimi 娘'],
      ['grok', 'Grok', 'Grok 娘'],
      ['mistral', 'Mistral', 'Mistral 娘'],
    ],
  },
  {
    id: 'pioneers',
    en: 'Pioneers',
    zh: '先遣队',
    names: [
      ['spark-captain', 'Spark Captain', '星火队长'],
      ['night-owl', 'Night Owl', '夜航鸮'],
      ['moondock', 'Moondock', '月港领航员'],
      ['cloud-lamb', 'Cloud Lamb', '云朵羊'],
      ['blue-courier', 'Blue Courier', '蓝信使'],
      ['pedal-wolf', 'Pedal Wolf', '骑行狼'],
      ['beanie', 'Beanie', '绒帽团'],
      ['ping', 'Ping', '天线豆'],
      ['tabby', 'Tabby', '书签猫'],
    ],
  },
  {
    id: 'town',
    en: 'Town',
    zh: '街角',
    names: [
      ['teacake', 'Tea Host', '茶点师'],
      ['downbeat', 'Downbeat', '节拍手'],
      ['sprout', 'Gardener', '园艺师'],
      ['bun', 'Baker', '面包师'],
      ['drizzle', 'Drizzle', '雨衣仔'],
      ['patch', 'Mender', '补丁匠'],
      ['finch', 'Birdwatcher', '观鸟员'],
      ['palette', 'Painter', '调色师'],
      ['sugar-bear', 'Sugar Bear', '糖霜熊'],
    ],
  },
  {
    id: 'fantasy',
    en: 'Fantasy',
    zh: '奇幻',
    names: [
      ['ridge-guide', 'Ridge Guide', '山脊向导'],
      ['dawn-cartographer', 'Dawn Cartographer', '晨湾测绘师'],
      ['woodland-piper', 'Woodland Piper', '林间乐师'],
      ['basalt-smith', 'Basalt Smith', '玄岩工匠'],
      ['dusk-marshal', 'Dusk Marshal', '暮霆仪仗官'],
      ['glasshouse-curator', 'Glasshouse Curator', '温室馆长'],
      ['tide-theatre', 'Tide Theater Director', '潮汐剧场主'],
      ['ember-racer', 'Ember Racer', '熔光车手'],
      ['frost-archivist', 'Frost Archivist', '霜羽档案员'],
    ],
  },
] as const;

export type TiltiesCollectionId = (typeof collections)[number]['id'];

export const DEFAULT_TILTIES_COLLECTION = collections[0].id;

export const TILTIES_COLLECTIONS = collections.map(({ id, en, zh, names }) => ({
  id,
  en,
  zh,
  portraits: names.map(([id, en, zh]) => ({
    id,
    en,
    zh,
    image: `data:image/webp;base64,${webp[id]}`,
  })),
}));

const portraits = TILTIES_COLLECTIONS.flatMap((collection) => collection.portraits);

export function isTiltiesAvatar(image: string): boolean {
  return portraits.some((portrait) => portrait.image === image);
}

export function randomTiltiesAvatar(current?: string): string {
  const candidates = portraits.filter((portrait) => portrait.image !== current);
  const next = candidates[Math.floor(Math.random() * candidates.length)];
  if (next === undefined) throw new Error('Tilties requires at least two avatars.');
  return next.image;
}
