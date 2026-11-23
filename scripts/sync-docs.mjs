#!/usr/bin/env node

import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { collectDevReference } from './docs-reference.mjs';
import {
  DEVELOPMENT_SUMMARY_IDENTITY,
  parseReleaseLedger,
  validateReleaseLedgerPair,
} from './release-ledger.mjs';

import {
  CONTENT,
  DIAGRAMS_PUBLIC,
  DIAGRAMS_RENDERED,
  ROOT,
  testOutputRoot,
} from './sync-docs-output.mjs';
import {
  DEV_SECTION_ORDER,
  DSH_CONTEXT_DIAGRAMS_EN,
  DSH_CONTEXT_DIAGRAMS_ZH,
  PAGES,
} from './sync-docs-pages.mjs';

export { DEV_SECTION_ORDER, PAGES } from './sync-docs-pages.mjs';

const GITHUB_BLOB = 'https://github.com/BotHarness/BotHarness/blob/main/';
const SKILL = '.agents/skills/dsh-plugin-dev/';

const LINK_REWRITES = [
  [
    /\]\((?:\.\.\/){1,2}decisions\/([a-z0-9-]+)\.md(#[\w-]+)?\)/g,
    `](${GITHUB_BLOB}docs/decisions/$1.md$2)`,
  ],
  [/\]\((?:\.\.\/){1,2}adr\/([0-9]{4}-[a-z0-9-]+)\.md\)/g, '](/dev/adr/$1)'],
  [
    /\]\((?:\.\.\/){1,2}architecture\/botharness-architecture\.md\)/g,
    '](/dev/design/architecture)',
  ],
  [
    /\]\((?:\.\.\/){1,2}(?:dev\/guides\/)?personabot-output(?:\.zh)?\.md\)/g,
    '](/dev/guides/personabot-output)',
  ],
  [/\]\((?:\.\.\/|\.?\/?docs\/)?file-open(?:\.zh)?\.md\)/g, '](/docs/file-open)'],
  [/\]\(adr\/([0-9]{4}-[a-z0-9-]+)\.md\)/g, '](/dev/adr/$1)'],
  [
    /\]\(\.?\/?docs\/architecture\/botharness-architecture\.(?:md|html)\)/g,
    '](/dev/design/architecture)',
  ],
  [/\]\(\.?\/?docs\/botharness\.md\)/g, '](/dev/design/architecture)'],
  [/\]\(\.?\/?PRD\.md\)/g, '](/dev/design/architecture)'],
  [/\]\(\.?\/?CONTEXT\.md\)/g, '](/dev/design/context)'],
  [/\]\((?:\.\.\/){1,2}CONTEXT\.md\)/g, '](/dev/design/context)'],
  [/\]\(\.?\/?docs\/client-bridge\.md\)/g, '](/dev/guides/client-bridge)'],
  [/\]\(\.?\/?docs\/adr\/([0-9]{4}-[a-z0-9-]+)\.md\)/g, '](/dev/adr/$1)'],
  [/\]\(([0-9]{4}-[a-z0-9-]+)\.md\)/g, '](/dev/adr/$1)'],
  [/\]\(\.?\/?README\.en?\.md\)/g, `](${GITHUB_BLOB}README.md)`],
];

const MERMAID_OPEN = '<pre class="mermaid">{`';
const MERMAID_CLOSE = '`}</pre>';

function readText(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function writeText(relativePath, content) {
  const absolute = join(CONTENT, relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, 'utf8');
}

function mermaidFenceToRuntime(code) {
  return `${MERMAID_OPEN}\n${String(code).trimEnd()}\n${MERMAID_CLOSE}\n`;
}

function transformMermaid(body) {
  return body.replace(/```mermaid\r?\n([\s\S]*?)```\r?\n?/g, (_match, code) =>
    mermaidFenceToRuntime(code),
  );
}

function transformDiagrams(body, diagrams, lang) {
  let index = 0;
  return body.replace(/```mermaid\r?\n([\s\S]*?)```\r?\n?/g, (_match, code) => {
    const diagram = diagrams[index];
    index += 1;
    if (!diagram) return mermaidFenceToRuntime(code);
    const langAttr = lang === 'en' ? ' lang="en"' : '';
    const caption = diagram.caption ? ` caption=${JSON.stringify(diagram.caption)}` : '';
    return `<Diagram name="${diagram.name}"${caption}${langAttr} />\n`;
  });
}

function rewriteLinks(body) {
  let output = body;
  for (const [pattern, replacement] of LINK_REWRITES) output = output.replace(pattern, replacement);
  return output;
}

function stripFrontmatter(body) {
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: '', body };
  return { frontmatter: match[1] ?? '', body: body.slice(match[0].length) };
}

function stripH1(body) {
  return body.replace(/^#\s+.*\r?\n+/, '');
}

function titleFrom(body, fallback) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? String(match[1]).trim() : fallback;
}

function frontmatter({ title, description, order, untranslated, extra = [] }) {
  const lines = ['---', `title: ${JSON.stringify(title)}`];
  if (description) lines.push(`description: ${JSON.stringify(description)}`);
  lines.push('sidebar:', `  order: ${order}`);
  if (untranslated) lines.push('untranslated: true');
  lines.push(...extra);
  lines.push('---', '', '');
  return lines.join('\n');
}

function stripMaintainerNote(body) {
  return body.replace(/^(#\s+[^\r\n]*\r?\n+)\s*<!--[\s\S]*?-->\s*\r?\n+/, '$1');
}

function prepare(body, diagrams, lang) {
  const source = stripMaintainerNote(body);
  const transformed = diagrams
    ? transformDiagrams(stripH1(source), diagrams, lang)
    : transformMermaid(stripH1(source));
  return rewriteLinks(transformed);
}

function renderPage(variant, order, untranslated) {
  const raw = readText(variant.source);
  const { body } = stripFrontmatter(raw);
  const title = variant.configuredTitle ? variant.title : titleFrom(body, variant.title);
  return (
    frontmatter({
      title,
      description: variant.description,
      order,
      untranslated,
    }) + prepare(body, variant.diagrams, variant.lang)
  );
}

function syncPages() {
  for (const page of PAGES) {
    const enTarget = `docs/${page.slug}.mdx`;
    const zhTarget = `docs-zh/${page.slug}.mdx`;
    if (page.en) {
      writeText(enTarget, renderPage(page.en, page.order, false));
      process.stdout.write(`en: ${page.en.source} -> ${enTarget}\n`);
    } else {
      writeText(enTarget, renderPage(page.zh, page.order, true));
      process.stdout.write(`en: ${page.zh.source} -> ${enTarget} (untranslated)\n`);
    }
    if (page.zh) {
      writeText(zhTarget, renderPage(page.zh, page.order, false));
      process.stdout.write(`zh: ${page.zh.source} -> ${zhTarget}\n`);
    } else {
      writeText(zhTarget, renderPage(page.en, page.order, true));
      process.stdout.write(`zh: ${page.en.source} -> ${zhTarget} (untranslated)\n`);
    }
  }
}

const TOOL_COPY_ZH = {
  memory_read: {
    description: '读取当前 Session 所属 PersonaBot Memory 中的一份 Markdown 文件。',
    parameters: {
      path: 'Memory 根目录下的相对 .md 路径，例如 customers/acme.md',
    },
  },
  memory_search: {
    description: '在当前 Session 所属 PersonaBot Memory 中执行不区分大小写的子字符串搜索。',
    parameters: { query: '不区分大小写的搜索子字符串' },
  },
  memory_write: {
    description:
      '原子创建或覆盖当前 Session 所属 PersonaBot Memory 中的一份 Markdown 文件，并提交 Git 记录。',
    parameters: {
      path: 'Memory 根目录下的相对 .md 路径',
      body: '文件的完整 Markdown 正文',
      summary: '一行变更摘要，同时作为 Git commit message',
      sources: '事实来源，例如 feishu:group-42 或 2026-09-17',
      tags: '可选主题标签',
    },
  },
  memory_list: {
    description: '列出当前 Session 所属 PersonaBot 的 Memory Tree。',
    parameters: {},
  },
};

function markdownCell(value) {
  if (value === undefined) return '—';
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function codeValue(value) {
  return value === undefined ? '—' : `\`${JSON.stringify(value)}\``;
}

function referenceIntro(language, source) {
  return language === 'zh'
    ? `> 本页在每次文档同步时从 \`${source}\` 生成，只描述当前代码，不承诺尚未实现的 Design。\n\n`
    : `> This page is generated from \`${source}\` on every docs sync. It describes current code, not unimplemented Design.\n\n`;
}

function renderReferenceIndex(language) {
  if (language === 'zh') {
    return (
      'Reference 从当前代码生成，是“现在实现了什么”的权威表面。目标边界与未来能力请查看 [Design](/zh/dev/design)。\n\n' +
      '- [Config](/zh/dev/reference/config)：core plugin 当前接受的配置。\n' +
      '- [Tools](/zh/dev/reference/tools)：当前注册给模型的 tools。\n' +
      '- [Events](/zh/dev/reference/events)：core 当前公开使用的 Cordis event seams。\n\n' +
      '生成器遇到动态名称或无法静态解析的定义时会让文档构建失败，避免静默发布过期目录。\n'
    );
  }
  return (
    'Reference is generated from the current codebase and is authoritative for what exists now. Use [Design](/dev/design) for target boundaries and future capabilities.\n\n' +
    '- [Config](/dev/reference/config): configuration currently accepted by the core plugin.\n' +
    '- [Tools](/dev/reference/tools): tools currently registered for models.\n' +
    '- [Events](/dev/reference/events): public Cordis event seams currently used by core.\n\n' +
    'The generator fails the docs build when it encounters dynamic names or definitions it cannot statically resolve, preventing a silently stale catalog.\n'
  );
}

function renderConfigReference(config, language) {
  const header =
    language === 'zh'
      ? '| Key | Type | Default | 说明 |\n| --- | --- | --- | --- |\n'
      : '| Key | Type | Default | Description |\n| --- | --- | --- | --- |\n';
  const rows = config
    .map((field) => {
      const description =
        language === 'zh' && field.name === 'enabled' ? '启用 BotHarness core' : field.description;
      return `| \`${field.name}\` | \`${field.type}\` | ${codeValue(field.default)} | ${markdownCell(description)} |`;
    })
    .join('\n');
  return referenceIntro(language, 'packages/core/src/plugin.ts') + header + rows + '\n';
}

function renderToolsReference(tools, language) {
  const sections = tools.map((tool) => {
    const translation = TOOL_COPY_ZH[tool.name];
    if (language === 'zh' && !translation) {
      throw new Error(`docs reference: missing Chinese copy for tool ${tool.name}`);
    }
    const description = language === 'zh' ? translation.description : tool.description;
    const parameterHeader =
      language === 'zh'
        ? '| Parameter | Type | Required | 说明 |\n| --- | --- | --- | --- |'
        : '| Parameter | Type | Required | Description |\n| --- | --- | --- | --- |';
    const parameters =
      tool.parameters.length === 0
        ? language === 'zh'
          ? '_无参数。_'
          : '_No parameters._'
        : [
            parameterHeader,
            ...tool.parameters.map((parameter) => {
              const translated = translation?.parameters[parameter.name];
              if (language === 'zh' && !translated) {
                throw new Error(
                  `docs reference: missing Chinese copy for ${tool.name}.${parameter.name}`,
                );
              }
              return `| \`${parameter.name}\` | \`${parameter.type}\` | ${parameter.required ? 'yes' : 'no'} | ${markdownCell(language === 'zh' ? translated : parameter.description)} |`;
            }),
          ].join('\n');
    return `## \`${tool.name}\`\n\n${description}\n\n${parameters}\n\n_Source: \`${tool.source}\`_`;
  });
  return referenceIntro(language, 'packages/core/src/memory/tools.ts') + sections.join('\n\n');
}

function renderEventsReference(events, language) {
  const intro = referenceIntro(language, 'packages/core/src/**/*.ts');
  if (events.length === 0) {
    return (
      intro +
      (language === 'zh'
        ? '**当前没有已发布的 Cordis event 契约。**\n\n`BotStateEvent` 与 `states.on(...)` 是 core 进程内 callback 数据，不是 Cordis Event、Client wire contract 或 durable authority，因此不会出现在这里。\n'
        : '**There is no published Cordis event contract in the current core.**\n\n`BotStateEvent` and `states.on(...)` are in-process callback data, not a Cordis Event, Client wire contract, or durable authority, so they are intentionally absent.\n')
    );
  }
  const header =
    language === 'zh'
      ? '| Event | Direction | Cordis operation | Source |\n| --- | --- | --- | --- |\n'
      : '| Event | Direction | Cordis operation | Source |\n| --- | --- | --- | --- |\n';
  const rows = events
    .map((event) => {
      const direction =
        language === 'zh' ? (event.direction === 'consumes' ? '消费' : '发出') : event.direction;
      return `| \`${event.name}\` | ${direction} | \`${event.operation}\` | \`${event.source}\` |`;
    })
    .join('\n');
  return intro + header + rows + '\n';
}

function syncReference() {
  const reference = collectDevReference(ROOT);
  const pages = [
    {
      slug: 'index',
      order: DEV_SECTION_ORDER.reference,
      en: {
        title: 'Reference',
        description: 'Generated current-code contracts for config, tools, and public events',
        body: renderReferenceIndex('en'),
      },
      zh: {
        title: 'Reference',
        description: '由当前代码生成的 config、tools 与 public events 契约',
        body: renderReferenceIndex('zh'),
      },
    },
    {
      slug: 'config',
      order: 1,
      en: {
        title: 'Core config reference',
        description: 'Configuration accepted by the current BotHarness core plugin',
        body: renderConfigReference(reference.config, 'en'),
      },
      zh: {
        title: 'Core config reference',
        description: '当前 BotHarness core plugin 接受的配置',
        body: renderConfigReference(reference.config, 'zh'),
      },
    },
    {
      slug: 'tools',
      order: 2,
      en: {
        title: 'Model tool reference',
        description: 'Tools registered for models by the current BotHarness core',
        body: renderToolsReference(reference.tools, 'en'),
      },
      zh: {
        title: 'Model tool reference',
        description: '当前 BotHarness core 注册给模型的 tools',
        body: renderToolsReference(reference.tools, 'zh'),
      },
    },
    {
      slug: 'events',
      order: 3,
      en: {
        title: 'Cordis event reference',
        description: 'Public Cordis event seams used by the current BotHarness core',
        body: renderEventsReference(reference.publicEvents, 'en'),
      },
      zh: {
        title: 'Cordis event reference',
        description: '当前 BotHarness core 使用的公开 Cordis event seams',
        body: renderEventsReference(reference.publicEvents, 'zh'),
      },
    },
  ];
  for (const page of pages) {
    for (const [tree, language] of [
      ['docs', 'en'],
      ['docs-zh', 'zh'],
    ]) {
      const variant = page[language];
      const target = `${tree}/dev/reference/${page.slug}.mdx`;
      writeText(
        target,
        frontmatter({
          title: variant.title,
          description: variant.description,
          order: page.order,
        }) + variant.body,
      );
      process.stdout.write(`reference: ${language} -> ${target}\n`);
    }
  }
}

function syncAdr() {
  const topics = readdirSync(join(ROOT, 'docs', 'decisions'))
    .filter((file) => /^[a-z0-9-]+\.md$/.test(file))
    .sort()
    .flatMap((file) => {
      const { frontmatter: metadata, body } = stripFrontmatter(readText(`docs/decisions/${file}`));
      if (!/^Publish: true$/m.test(metadata)) return [];
      const slug = file.replace(/\.md$/, '');
      const title = titleFrom(body, slug);
      const content = prepare(body).replace(
        /\]\(((?:\.\.?\/)*[a-zA-Z0-9_./-]+)(#[\w-]+)?\)/g,
        (link, target, anchor = '') => {
          if (target.startsWith('/')) return link;
          const path = relative(ROOT, resolve(ROOT, 'docs', 'decisions', target))
            .split(sep)
            .join('/');
          return `](${GITHUB_BLOB}${path}${target.endsWith('/') ? '/' : ''}${anchor})`;
        },
      );
      const page = `dev/adr/${slug}.mdx`;
      writeText(`docs/${page}`, frontmatter({ title, order: 0 }) + content);
      writeText(
        `docs-zh/${page}`,
        frontmatter({ title, order: 0, untranslated: true }) +
          content.replaceAll('](/dev/', '](/zh/dev/'),
      );
      return [{ slug, title }];
    });
  const topicList = (prefix) =>
    topics.map(({ slug, title }) => `- [${title}](${prefix}/dev/adr/${slug})`).join('\n');
  const directory = join(ROOT, 'docs', 'adr');
  const files = readdirSync(directory)
    .filter((name) => /^\d{4}-[a-z0-9-]+\.md$/.test(name))
    .sort();
  const entries = files.map((file) => {
    const raw = readFileSync(join(directory, file), 'utf8');
    const { frontmatter: sourceFrontmatter, body } = stripFrontmatter(raw);
    return {
      file,
      body,
      title: titleFrom(body, file),
      status: sourceFrontmatter.match(/^Status:\s*(.+)$/m)?.[1]?.trim(),
    };
  });
  const indexList = entries
    .map(
      ({ file, title, status }) =>
        `- [${title}](/dev/adr/${file.replace(/\.md$/, '')})${status ? ` — ${status}` : ''}`,
    )
    .join('\n');
  const indexListZh = indexList.replaceAll('](/dev/adr/', '](/zh/dev/adr/');
  writeText(
    'docs/dev/adr/index.mdx',
    frontmatter({
      title: 'Architecture decisions',
      description: 'Current topic decisions and numbered records for BotHarness architecture',
      order: DEV_SECTION_ORDER.adr,
    }) +
      'Topic documents describe the current decisions. Check the status of a numbered record before relying on it. See the [living architecture](/dev/design/architecture) for how the system fits together.\n\n' +
      `${topicList('')}\n\n<details>\n<summary>Numbered decisions (${entries.length})</summary>\n\n${indexList}\n\n</details>\n`,
  );
  writeText(
    'docs-zh/dev/adr/index.mdx',
    frontmatter({
      title: 'Architecture decisions',
      description: 'BotHarness 当前架构决策与编号记录',
      order: DEV_SECTION_ORDER.adr,
    }) +
      '主题文档说明当前决策。引用编号记录前，请查看其状态。[现行架构](/zh/dev/design/architecture) 说明系统如何协作。\n\n' +
      `${topicList('/zh')}\n\n<details>\n<summary>编号决策（${entries.length}）</summary>\n\n${indexListZh}\n\n</details>\n`,
  );
  process.stdout.write(`adr: index -> ${entries.length} decision(s)\n`);
  for (const entry of entries) {
    const { file, body, title, status } = entry;
    const number = Number.parseInt(file.slice(0, 4), 10);
    const statusLine = status ? `> Status: ${status}\n\n` : '';
    const order = Number.isNaN(number) ? 99 : number;
    const relative = `dev/adr/${file.replace(/\.md$/, '.mdx')}`;
    writeText(
      `docs/${relative}`,
      frontmatter({ title, order, untranslated: true }) + statusLine + prepare(body),
    );
    writeText(
      `docs-zh/${relative}`,
      frontmatter({ title, order }) +
        statusLine +
        prepare(body).replaceAll('](/dev/adr/', '](/zh/dev/adr/'),
    );
    process.stdout.write(`adr: ${file} -> docs/${relative} + docs-zh/${relative}\n`);
  }
}

function renderReleaseLedgerEntry(release, language) {
  const development = release.identity === DEVELOPMENT_SUMMARY_IDENTITY;
  const title = development
    ? language === 'zh'
      ? '首个版本前的开发进展'
      : 'Pre-release development'
    : `DeepSeekBot ${release.identity}`;
  const tags = release.sections.map((section) => section.name);
  const lines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(release.summary)}`,
    `date: ${release.date}`,
  ];
  if (tags.length > 0) lines.push(`tags: [${tags.join(', ')}]`);
  if (development) lines.push('developmentSummary: true');
  else lines.push(`releaseVersion: ${release.identity}`);
  lines.push('---', '', '', release.summary, '');
  for (const section of release.sections) {
    lines.push(`## ${section.name}`, '');
    for (const entry of section.entries) lines.push(`- ${entry.text}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function releaseLedgerSiteEntries(english, chinese) {
  const errors = validateReleaseLedgerPair(english, chinese);
  if (errors.length > 0) {
    throw new Error(
      `Release Ledger cannot be synchronized:\n${errors
        .map((error) => `${error.source} [${error.code}] ${error.message}`)
        .join('\n')}`,
    );
  }

  const en = parseReleaseLedger(english).releases;
  const zh = parseReleaseLedger(chinese).releases;
  return en
    .map((release, index) => ({ release, counterpart: zh[index] }))
    .filter(({ release }) => release.identity !== 'Unreleased')
    .map(({ release, counterpart }) => ({
      slug:
        release.identity === DEVELOPMENT_SUMMARY_IDENTITY ? 'development' : `v${release.identity}`,
      english: renderReleaseLedgerEntry(release, 'en'),
      chinese: renderReleaseLedgerEntry(counterpart, 'zh'),
    }));
}

function syncChangelog() {
  rmSync(join(CONTENT, 'changelog'), { recursive: true, force: true });
  rmSync(join(CONTENT, 'changelog-zh'), { recursive: true, force: true });

  const entries = releaseLedgerSiteEntries(readText('CHANGELOG.md'), readText('CHANGELOG.zh.md'));
  for (const entry of entries) {
    writeText(`changelog/${entry.slug}.mdx`, entry.english);
    writeText(`changelog-zh/${entry.slug}.mdx`, entry.chinese);
    process.stdout.write(`changelog: ${entry.slug} (ledger en + zh)\n`);
  }
}

function syncDiagrams() {
  rmSync(DIAGRAMS_PUBLIC, { recursive: true, force: true });

  const copySvgs = (source, target) => {
    let files = [];
    try {
      files = readdirSync(source)
        .filter((name) => name.endsWith('.svg'))
        .sort();
    } catch {
      return null;
    }
    if (files.length === 0) return null;
    mkdirSync(target, { recursive: true });
    for (const file of files) {
      copyFileSync(join(source, file), join(target, file));
    }
    return files.length;
  };

  const zh = copySvgs(DIAGRAMS_RENDERED, DIAGRAMS_PUBLIC);
  if (zh === null) {
    process.stderr.write(
      'diagrams: docs/architecture/diagrams/rendered is missing — run "pnpm diagrams"\n',
    );
    return;
  }
  process.stdout.write(`diagrams: ${zh} SVG(s) -> apps/docs/public/diagrams\n`);

  const en = copySvgs(join(DIAGRAMS_RENDERED, 'en'), join(DIAGRAMS_PUBLIC, 'en'));
  if (en === null) {
    process.stderr.write(
      'diagrams: docs/architecture/diagrams/rendered/en is missing — run "pnpm diagrams"\n',
    );
    return;
  }
  process.stdout.write(`diagrams: ${en} SVG(s) -> apps/docs/public/diagrams/en\n`);
}

function skillProvenance() {
  const { frontmatter: text } = stripFrontmatter(readText(`${SKILL}SKILL.md`));
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === 'metadata:');
  const fields = {};
  if (start === -1) return fields;
  for (const line of lines.slice(start + 1)) {
    const match = line.match(/^\s+([A-Za-z][A-Za-z0-9]*):\s*"?(.*?)"?\s*$/);
    if (!match) break;
    fields[match[1]] = match[2];
  }
  return fields;
}

function provenanceFields({ skillVersion, verifiedAgainst, upstreamSha, verifiedAt }) {
  return [
    `skillVersion: ${JSON.stringify(skillVersion)}`,
    `verifiedAgainst: ${JSON.stringify(verifiedAgainst)}`,
    `upstreamSha: ${JSON.stringify(upstreamSha)}`,
    `verifiedAt: ${JSON.stringify(verifiedAt)}`,
  ];
}

const SKILL_PAGES = [
  {
    slug: 'dsh/context',
    order: 1,
    en: {
      source: `${SKILL}references/context.md`,
      title: 'Canonical context',
      description: 'Precise DSH and Cordis vocabulary, boundaries, and concept maps',
      lang: 'en',
      diagrams: DSH_CONTEXT_DIAGRAMS_EN,
    },
    zh: {
      source: `${SKILL}references/context.zh.md`,
      title: '规范 Context',
      description: '精确的 DSH 与 Cordis 术语、边界与概念图',
      diagrams: DSH_CONTEXT_DIAGRAMS_ZH,
    },
  },
  {
    slug: 'dsh/decision-tree',
    order: 2,
    en: {
      source: `${SKILL}references/decision-tree.md`,
      title: 'Decision tree',
      description: 'Choose the correct DSH seam before implementation',
    },
    zh: {
      source: `${SKILL}references/decision-tree.zh.md`,
      title: 'Decision Tree',
      description: '在实现前选择正确的 DSH seam',
    },
  },
  {
    slug: 'dsh/releases',
    order: 3,
    en: {
      source: `${SKILL}CHANGELOG.md`,
      title: 'DSH Skill release history',
      description: 'Independent Skill SemVer and verified DSH provenance',
    },
    zh: {
      source: `${SKILL}CHANGELOG.zh.md`,
      title: 'DSH Skill 更新日志',
      description: '独立的 Skill SemVer 与核验过的 DSH provenance',
    },
  },
];

const SKILL_LINKS = new Map([
  ['context', 'context'],
  ['decision-tree', 'decision-tree'],
]);

function prepareSkill(body, tree, diagrams, lang) {
  const prefix = tree === 'docs-zh' ? '/zh' : '';
  return prepare(body, diagrams, lang).replace(
    /\]\((?:references\/)?([a-z-]+)(?:\.zh)?\.md\)/g,
    (match, sourceName) => {
      const slug = SKILL_LINKS.get(sourceName);
      return slug ? `](${prefix}/dsh/${slug})` : match;
    },
  );
}

function syncSkill() {
  const provenance = provenanceFields(skillProvenance());

  const landing = [
    {
      tree: 'docs',
      source: 'docs/dsh/index.md',
      description:
        'Stable DSH and Cordis vocabulary, concept maps, and architectural decision tree',
      untranslated: false,
    },
    {
      tree: 'docs-zh',
      source: 'docs/dsh/index.zh.md',
      description: '稳定的 DSH 与 Cordis 术语、概念图与架构 Decision Tree',
      untranslated: false,
    },
  ];
  for (const variant of landing) {
    const raw = readText(variant.source);
    const { body } = stripFrontmatter(raw);
    const title = titleFrom(body, 'DSH Plugin Development');
    writeText(
      `${variant.tree}/dsh/index.mdx`,
      frontmatter({
        title,
        description: variant.description,
        order: 0,
        untranslated: variant.untranslated,
        extra: provenance,
      }) + prepare(body),
    );
    process.stdout.write(`skill: ${variant.source} -> ${variant.tree}/dsh/index.mdx\n`);
  }

  for (const page of SKILL_PAGES) {
    for (const [tree, language] of [
      ['docs', 'en'],
      ['docs-zh', 'zh'],
    ]) {
      const variant = page[language];
      if (!variant?.source) {
        throw new Error(`skill: ${page.slug} is missing its ${language} source`);
      }
      const raw = readText(variant.source);
      const { body } = stripFrontmatter(raw);
      writeText(
        `${tree}/${page.slug}.mdx`,
        frontmatter({
          title: variant.title,
          description: variant.description,
          order: page.order,
          untranslated: false,
          extra: provenance,
        }) + prepareSkill(body, tree, variant.diagrams, variant.lang),
      );
      process.stdout.write(`skill: ${variant.source} -> ${tree}/${page.slug}.mdx\n`);
    }
  }
}

export function syncDocs() {
  for (const stale of [
    'docs/spec',
    'docs/adr',
    'docs/architecture.mdx',
    'docs/dev',
    'docs-zh/dev',
    'docs/dsh',
    'docs-zh/dsh',
  ]) {
    rmSync(join(CONTENT, stale), { recursive: true, force: true });
  }

  syncPages();
  syncReference();
  syncAdr();
  syncChangelog();
  syncSkill();
  syncDiagrams();
  process.stdout.write('docs sync complete\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncDocs();
}
