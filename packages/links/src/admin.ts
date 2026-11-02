import { Hono, type Context } from 'hono';
import { csrf } from 'hono/csrf';
import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import {
  DAILY_HEIGHT,
  linkChartHeight,
  type ChartData,
  type DailyClicks,
} from './chart-definitions.js';
import { accessAuth, devBypassEmail } from './access.js';
import type { AppEnv } from './env.js';
import * as operations from './operations.js';
import { SHORT_ORIGIN } from './redirect.js';
import {
  CampaignCreateSchema,
  CampaignUpdateSchema,
  LinkCreateSchema,
  LinkUpdateSchema,
  TokenCreateSchema,
  type Campaign,
  type Link,
  type Token,
} from './schemas.js';

type Markup = HtmlEscapedString | Promise<HtmlEscapedString>;
type AdminContext = Context<AppEnv>;

const RECENT_DAYS = 7;
const CHART_DAYS = 30;
const PLATFORMS = ['bilibili', 'x', 'youtube', 'producthunt', 'xiaohongshu', 'zhihu', 'wechat'];
const MEDIA = ['video', 'post', 'launch', 'article', 'thread', 'comment'];
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

const STYLE = `
:root{--bg:#f7f7f5;--panel:#fff;--text:#1d1d1b;--muted:#6b6b66;--line:#e3e3de;--accent:#2f5bd3;--accent-text:#fff;--danger:#b42318;--ok:#067647;--bar:#9db3ef;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--panel:#1d1d1b;--text:#ededea;--muted:#a3a39d;--line:#33332f;--accent:#7d9cf0;--accent-text:#0e0e0d;--danger:#f97066;--ok:#47cd89;--bar:#4a64b0;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line);background:var(--panel)}
header a{color:inherit;text-decoration:none;font-weight:600}
main{max-width:1100px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:4px 0 12px}h2{font-size:17px;margin:0 0 10px}
section{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;margin:0 0 16px}
.muted{color:var(--muted)}.small{font-size:13px}
.table{overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:640px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);font-weight:600}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
form.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end}
label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted)}
input,select{font:inherit;color:var(--text);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:7px 9px;min-width:0}
button{font:inherit;border:1px solid var(--accent);background:var(--accent);color:var(--accent-text);border-radius:6px;padding:7px 12px;cursor:pointer}
button.ghost{background:transparent;color:var(--accent)}
button.danger{background:transparent;border-color:var(--danger);color:var(--danger)}
.inline{display:inline}
.row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.badge{display:inline-block;font-size:12px;padding:1px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted)}
.badge.ok{color:var(--ok);border-color:var(--ok)}.badge.off{color:var(--danger);border-color:var(--danger)}
.flash{padding:10px 12px;border-radius:8px;margin:0 0 16px;border:1px solid}
.flash.error{border-color:var(--danger);color:var(--danger)}.flash.ok{border-color:var(--ok);color:var(--ok)}
.bars{display:inline-flex;gap:2px;align-items:flex-end;height:24px;vertical-align:middle}
.bars span{width:7px;background:var(--bar);border-radius:2px 2px 0 0;min-height:2px}
.secret{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;flex:1 1 320px;font-size:14px}
.short{white-space:nowrap}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.command{display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg);border:1px solid var(--line);border-radius:8px}
.command .secret,.command code{flex:1;min-width:0;border:0;padding:0;background:transparent;overflow-x:auto;white-space:nowrap}
.command .prompt{color:var(--ok);user-select:none}
dialog{width:min(560px,calc(100vw - 32px));border:1px solid var(--line);border-radius:12px;padding:20px;background:var(--panel);color:var(--text)}
dialog::backdrop{background:rgb(0 0 0 / .45)}
dialog h2{margin-bottom:6px}dialog h3{font-size:14px;margin:16px 0 6px}dialog p{margin:0 0 10px}
dialog .actions{display:flex;justify-content:flex-end;margin-top:18px}
.chart{position:relative;width:100%;max-width:960px;--ts-chart-1:#2f5bd3;--ts-chart-2:#e8833a;--ts-chart-3:#1f9d74;--ts-chart-4:#8b5cf6;--ts-chart-5:#d9468f;--ts-chart-6:#0e9fbf}
@media (prefers-color-scheme:dark){.chart{--ts-chart-1:#7d9cf0;--ts-chart-2:#f2a065;--ts-chart-3:#47cd89;--ts-chart-4:#a78bfa;--ts-chart-5:#f472b6;--ts-chart-6:#38bdf8}}
details summary{cursor:pointer;color:var(--accent)}
details form{margin-top:8px}
a{color:var(--accent)}
`;

const SCRIPT = `document.addEventListener('click',function(e){var b=e.target.closest('[data-copy]');if(!b)return;navigator.clipboard.writeText(b.getAttribute('data-copy')).then(function(){var t=b.textContent;b.textContent='Copied';setTimeout(function(){b.textContent=t},1200)})});
document.querySelectorAll('dialog[data-modal]').forEach(function(d){if(d.showModal){d.close();d.showModal()}});
document.querySelectorAll('form').forEach(function(f){var n=f.querySelector('[data-slug-source]'),t=f.querySelector('[data-slug-target]');if(!n||!t)return;t.addEventListener('input',function(){t.dataset.touched=t.value?'1':''});n.addEventListener('input',function(){if(!t.dataset.touched)t.value=n.value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64).replace(/-+$/,'')})});
document.addEventListener('submit',function(e){var m=e.target.getAttribute('data-confirm');if(m&&!confirm(m))e.preventDefault()});`;

const date = (value: string | null) => (value ? value.slice(0, 10) : '—');

function layout(c: AdminContext, title: string, body: Markup): Markup {
  const error = c.req.query('error');
  const ok = c.req.query('ok');
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>${title} · Campaign Links</title>
        <style>
          ${raw(STYLE)}
        </style>
        <script src="/admin/admin.js" defer></script>
      </head>
      <body>
        <header>
          <a href="/admin">Campaign Links admin</a>
          <span class="muted small">Signed in as ${c.var.adminEmail}</span>
        </header>
        <main>
          ${error ? html`<div class="flash error" role="alert">${error}</div>` : ''}
          ${ok ? html`<div class="flash ok" role="status">${ok}</div>` : ''} ${body}
        </main>
      </body>
    </html>`;
}

function copyButton(value: string) {
  return html`<button type="button" class="ghost" data-copy="${value}">Copy</button>`;
}

function bars(daily: { day: string; clicks: number }[]) {
  const days = Array.from({ length: RECENT_DAYS }, (_, index) =>
    operations.sinceDay(RECENT_DAYS - index),
  );
  const counts = days.map((day) => daily.find((entry) => entry.day === day)?.clicks ?? 0);
  const max = Math.max(1, ...counts);
  return html`<span class="bars" title="${days.map((day, i) => `${day}: ${counts[i]}`).join('\n')}"
      >${counts.map(
        (count) => html`<span style="height:${Math.round((count / max) * 100)}%"></span>`,
      )}</span
    >
    <span class="small muted">${counts.reduce((sum, count) => sum + count, 0)}</span>`;
}

function clickChartData(links: Link[], daily: { day: string; clicks: number }[][]): ChartData {
  const days = Array.from({ length: CHART_DAYS }, (_, index) =>
    operations.sinceDay(CHART_DAYS - index),
  );
  const byDayPlatform = new Map<string, DailyClicks>();
  links.forEach((link, index) => {
    for (const entry of daily[index] ?? []) {
      const key = `${entry.day}:${link.platform}`;
      const row = byDayPlatform.get(key) ?? { day: entry.day, platform: link.platform, clicks: 0 };
      row.clicks += entry.clicks;
      byDayPlatform.set(key, row);
    }
  });
  const rows = [...byDayPlatform.values()].sort(
    (a, b) => a.day.localeCompare(b.day) || a.platform.localeCompare(b.platform),
  );
  return {
    days,
    daily: rows,
    links: links.map((link) => ({ link: link.slug, clicks: link.clicks })),
  };
}

function chartSection(data: ChartData) {
  const json = JSON.stringify(data).replaceAll('<', '\\u003c');
  return html`<section>
    <h2>Clicks per day, last ${CHART_DAYS} days</h2>
    <div class="chart" data-chart="daily" style="height:${DAILY_HEIGHT}px"></div>
    <h2 style="margin-top:16px">Clicks by link</h2>
    <div class="chart" data-chart="links" style="height:${linkChartHeight(data.links)}px"></div>
    <script type="application/json" id="chart-data">
      ${raw(json)}
    </script>
    <script type="module" src="/admin/assets/admin-charts.js"></script>
  </section>`;
}

function options(values: string[], selected?: string) {
  return values.map(
    (value) =>
      html`<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`,
  );
}

function datalists() {
  return html`<datalist id="platforms">${options(PLATFORMS)}</datalist>
    <datalist id="media">${options(MEDIA)}</datalist>`;
}

function tokenRows(tokens: Token[]) {
  const now = new Date().toISOString();
  return tokens.map((token) => {
    const state = token.revokedAt
      ? html`<span class="badge off">revoked</span>`
      : token.expiresAt && token.expiresAt <= now
        ? html`<span class="badge off">expired</span>`
        : html`<span class="badge ok">active</span>`;
    return html`<tr>
      <td>${token.name}</td>
      <td><code>${token.prefix}…</code></td>
      <td>${token.scope}</td>
      <td>${date(token.createdAt)}</td>
      <td>${token.expiresAt ? date(token.expiresAt) : 'never'}</td>
      <td>${date(token.lastUsedAt)}</td>
      <td>${state}</td>
      <td>
        ${
          token.revokedAt
            ? ''
            : html`<form
                class="inline"
                method="post"
                action="/admin/tokens/${token.id}/revoke"
                data-confirm="Revoke ${token.name}? Agents using it stop working."
              >
                <button class="danger">Revoke</button>
              </form>`
        }
      </td>
    </tr>`;
  });
}

async function dashboard(c: AdminContext, created?: Token & { token: string }) {
  const store = c.var.store;
  const showArchived = c.req.query('archived') === '1';
  const [campaigns, links, tokens] = await Promise.all([
    store.campaigns(showArchived),
    store.links(undefined, true),
    store.tokens(),
  ]);
  const totals = new Map<string, { links: number; clicks: number }>();
  for (const link of links) {
    const total = totals.get(link.campaign) ?? { links: 0, clicks: 0 };
    total.clicks += link.clicks;
    if (!link.archivedAt) total.links += 1;
    totals.set(link.campaign, total);
  }
  const campaignRow = (campaign: Campaign) => {
    const total = totals.get(campaign.slug) ?? { links: 0, clicks: 0 };
    return html`<tr>
      <td><a href="/admin/campaigns/${campaign.slug}">${campaign.name}</a></td>
      <td><code>${campaign.slug}</code></td>
      <td class="num">${total.links}</td>
      <td class="num">${total.clicks}</td>
      <td>${date(campaign.createdAt)}</td>
      <td>${campaign.archivedAt ? html`<span class="badge off">archived</span>` : ''}</td>
    </tr>`;
  };
  return layout(
    c,
    created ? 'Token created' : 'Campaigns',
    html`${
        created
          ? html`<dialog open data-modal aria-labelledby="token-title">
              <h2 id="token-title">Token “${created.name}” created</h2>
              <p class="muted small">
                Scope ${created.scope}, expires
                ${created.expiresAt ? date(created.expiresAt) : 'never'}. Copy it now: it is shown
                only once and only its hash is stored.
              </p>
              <div class="command">
                <input class="secret" readonly value="${created.token}" aria-label="New token" />
                ${copyButton(created.token)}
              </div>
              <h3>Save it for bh-links</h3>
              <p class="small muted">
                Run this and paste the token at the prompt. It is checked against the API and saved
                to <code>~/.config/botharness/links.json</code> with mode 0600.
              </p>
              <div class="command">
                <code><span class="prompt">$ </span>bh-links login</code>
                ${copyButton('bh-links login')}
              </div>
              <form method="dialog" class="actions"><button>Done</button></form>
            </dialog>`
          : ''
      }
      <section>
        <div class="row" style="justify-content:space-between">
          <h2>Campaigns</h2>
          <a class="small" href="/admin${showArchived ? '' : '?archived=1'}"
            >${showArchived ? 'Hide archived' : 'Show archived'}</a
          >
        </div>
        <div class="table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug (utm_campaign)</th>
                <th class="num">Links</th>
                <th class="num">Clicks</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${
                campaigns.length
                  ? campaigns.map(campaignRow)
                  : html`<tr>
                      <td colspan="6" class="muted">No campaigns yet.</td>
                    </tr>`
              }
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2>New campaign</h2>
        <form class="grid" method="post" action="/admin/campaigns">
          <label>Name<input name="name" required placeholder="PH Launch" data-slug-source /></label>
          <label
            >Slug (utm_campaign)<input
              name="slug"
              pattern="[a-z0-9-]+"
              placeholder="from the name"
              data-slug-target
          /></label>
          <label>Description<input name="description" /></label>
          <button>Create campaign</button>
        </form>
      </section>
      <section>
        <h2>Personal Access Tokens</h2>
        <p class="small muted">
          For agents and scripts calling the <a href="/openapi.json">/v1 API</a>. Read tokens can
          only list and read; write tokens can change everything.
        </p>
        <div class="table">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th>Scope</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Last used</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${
                tokens.length
                  ? tokenRows(tokens)
                  : html`<tr>
                      <td colspan="8" class="muted">No tokens yet.</td>
                    </tr>`
              }
            </tbody>
          </table>
        </div>
        <form class="grid" method="post" action="/admin/tokens" style="margin-top:12px">
          <label>Name<input name="name" required placeholder="launch agent" /></label>
          <label
            >Scope<select name="scope">
              <option value="read">read</option>
              <option value="write">write</option>
            </select></label
          >
          <label
            >Expires<select name="expiresInDays">
              <option value="30">in 30 days</option>
              <option value="90" selected>in 90 days</option>
              <option value="365">in a year</option>
              <option value="never">never</option>
            </select></label
          >
          <button>Create token</button>
        </form>
      </section>`,
  );
}

function linkForm(link: Link) {
  return html`<details>
    <summary>Edit</summary>
    <form class="grid" method="post" action="/admin/links/${link.slug}">
      <label>Platform<input name="platform" list="platforms" value="${link.platform}" /></label>
      <label>Media<input name="media" list="media" value="${link.media}" /></label>
      <label>Path<input name="path" value="${link.path}" /></label>
      <label
        >Language<select name="language">
          ${options(['zh', 'en'], link.language)}
        </select></label
      >
      <label>Note<input name="note" value="${link.note ?? ''}" /></label>
      <button>Save</button>
    </form>
  </details>`;
}

async function campaignPage(c: AdminContext, slug: string) {
  const store = c.var.store;
  const campaign = await store.campaign(slug);
  if (!campaign) return c.html(layout(c, 'Not found', html`<p>No campaign “${slug}”.</p>`), 404);
  const records = await store.links(slug, true);
  const daily = await Promise.all(
    records.map((link) => store.dailyClicks(link.id, operations.sinceDay(CHART_DAYS))),
  );
  const links = records.map(operations.presentLink);
  const total = links.reduce((sum, link) => sum + link.clicks, 0);
  const charts = total > 0 ? clickChartData(links, daily) : null;
  const archived = Boolean(campaign.archivedAt);
  const linkRow = (link: Link, index: number) => html`<tr>
    <td>
      <div class="row">
        <code class="short">${link.shortUrl.replace(/^https:\/\//, '')}</code
        >${copyButton(link.shortUrl)}
      </div>
      ${link.note ? html`<div class="small muted">${link.note}</div>` : ''}
    </td>
    <td>${link.platform}</td>
    <td>${link.media}</td>
    <td>
      <a href="${link.target}" rel="noreferrer" class="small"
        >${link.language === 'en' ? `/en${link.path}` : link.path}</a
      >
    </td>
    <td class="num">${link.clicks}</td>
    <td>${bars(daily[index] ?? [])}</td>
    <td>${date(link.lastClickedAt)}</td>
    <td>
      ${
        link.archivedAt
          ? html`<span class="badge off">archived</span>`
          : html`${linkForm(link)}
              <form
                class="inline"
                method="post"
                action="/admin/links/${link.slug}/archive"
                data-confirm="Archive ${link.slug}? It will redirect to the site root without UTMs."
              >
                <button class="danger">Archive</button>
              </form>`
      }
    </td>
  </tr>`;
  return c.html(
    layout(
      c,
      campaign.name,
      html`<p class="small"><a href="/admin">← All campaigns</a></p>
        <h1>
          ${campaign.name} <code class="muted">${campaign.slug}</code>
          ${archived ? html`<span class="badge off">archived</span>` : ''}
        </h1>
        ${campaign.description ? html`<p>${campaign.description}</p>` : ''}
        <p class="muted">${total} clicks across ${links.length} links.</p>
        ${
          archived
            ? ''
            : html`<section>
                <h2>New link</h2>
                ${datalists()}
                <form class="grid" method="post" action="/admin/links">
                  <input type="hidden" name="campaign" value="${campaign.slug}" />
                  <label
                    >Platform (utm_source)<input
                      name="platform"
                      list="platforms"
                      required
                      placeholder="x"
                  /></label>
                  <label
                    >Media (utm_medium)<input name="media" list="media" required placeholder="post"
                  /></label>
                  <label>Path<input name="path" value="/" /></label>
                  <label
                    >Language<select name="language">
                      ${options(['zh', 'en'], 'zh')}
                    </select></label
                  >
                  <label>Note<input name="note" /></label>
                  <label
                    >Slug (utm_content)<input
                      name="slug"
                      pattern="[a-z0-9-]+"
                      placeholder="auto: platform-media"
                  /></label>
                  <button>Create link</button>
                </form>
                <p class="small muted">
                  Links open ${SHORT_ORIGIN.replace('https://', '')}/&lt;slug&gt;. Leave the slug
                  empty to get &lt;platform&gt;-&lt;media&gt;, numbered when taken; en targets the
                  same path under /en.
                </p>
              </section>`
        }
        ${charts ? chartSection(charts) : ''}
        <section>
          <h2>Links</h2>
          <div class="table">
            <table>
              <thead>
                <tr>
                  <th>Short URL</th>
                  <th>Platform</th>
                  <th>Media</th>
                  <th>Target</th>
                  <th class="num">Clicks</th>
                  <th>Last ${RECENT_DAYS} days</th>
                  <th>Last click</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${
                  links.length
                    ? links.map(linkRow)
                    : html`<tr>
                        <td colspan="8" class="muted">No links yet.</td>
                      </tr>`
                }
              </tbody>
            </table>
          </div>
        </section>
        ${
          archived
            ? ''
            : html`<section>
                <h2>Campaign</h2>
                <form class="grid" method="post" action="/admin/campaigns/${campaign.slug}">
                  <label>Name<input name="name" required value="${campaign.name}" /></label>
                  <label
                    >Description<input name="description" value="${campaign.description ?? ''}"
                  /></label>
                  <button>Save</button>
                </form>
                <form
                  method="post"
                  action="/admin/campaigns/${campaign.slug}/archive"
                  data-confirm="Archive ${campaign.slug}? Its links will stop carrying UTMs."
                  style="margin-top:12px"
                >
                  <button class="danger">Archive campaign</button>
                </form>
              </section>`
        }`,
    ),
  );
}

function slugify(name: string) {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

async function form(c: AdminContext): Promise<Record<string, string | undefined>> {
  const body = await c.req.parseBody();
  const fields: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') fields[key] = value.trim() === '' ? undefined : value.trim();
  }
  return fields;
}

function back(c: AdminContext, path: string, message: { error?: string; ok?: string }) {
  const query = new URLSearchParams(message as Record<string, string>).toString();
  return c.redirect(`${path}${query ? `?${query}` : ''}`, 303);
}

function invalid(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`).join('; ');
}

export const admin = new Hono<AppEnv>();

admin.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  if (c.env.ADMIN_ORIGIN && url.origin !== c.env.ADMIN_ORIGIN) {
    if (!['GET', 'HEAD'].includes(c.req.method)) {
      return c.text('Use the configured admin origin', 403);
    }
    const target = new URL(c.env.ADMIN_ORIGIN);
    target.pathname = url.pathname;
    target.search = url.search;
    c.header('cache-control', 'no-store');
    return c.redirect(target.toString(), 302);
  }
  await next();
});

admin.use('*', accessAuth);
admin.use(
  '*',
  csrf({
    origin: (origin, c) =>
      origin === SHORT_ORIGIN ||
      origin === new URL(c.req.url).origin ||
      (devBypassEmail(c.env) !== null && LOCAL_ORIGIN.test(origin)),
  }),
);
admin.use('*', async (c, next) => {
  await next();
  c.header('cache-control', 'no-store');
  c.header('x-frame-options', 'DENY');
  c.header('referrer-policy', 'same-origin');
  c.header(
    'content-security-policy',
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );
});

admin.get('/assets/*', (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.notFound()));

admin.get('/admin.js', (c) =>
  c.body(SCRIPT, 200, { 'content-type': 'text/javascript; charset=utf-8' }),
);

admin.get('/', async (c) => c.html(await dashboard(c)));

admin.get('/campaigns/:slug', (c) => campaignPage(c, c.req.param('slug')));

admin.post('/campaigns', async (c) => {
  const fields = await form(c);
  const parsed = CampaignCreateSchema.safeParse({
    ...fields,
    slug: fields.slug ?? slugify(fields.name ?? ''),
  });
  if (!parsed.success) return back(c, '/admin', { error: invalid(parsed.error.issues) });
  const result = await operations.createCampaign(c.var.store, parsed.data);
  if (!result.ok) return back(c, '/admin', { error: result.code });
  return back(c, `/admin/campaigns/${result.value.slug}`, { ok: 'Campaign created.' });
});

admin.post('/campaigns/:slug', async (c) => {
  const slug = c.req.param('slug');
  const fields = await form(c);
  const parsed = CampaignUpdateSchema.safeParse({
    name: fields.name,
    description: fields.description ?? null,
  });
  const page = `/admin/campaigns/${slug}`;
  if (!parsed.success) return back(c, page, { error: invalid(parsed.error.issues) });
  const result = await operations.updateCampaign(c.var.store, slug, parsed.data);
  return back(c, page, result.ok ? { ok: 'Campaign saved.' } : { error: result.code });
});

admin.post('/campaigns/:slug/archive', async (c) => {
  const slug = c.req.param('slug');
  const result = await operations.archiveCampaign(c.var.store, slug);
  return back(
    c,
    `/admin/campaigns/${slug}`,
    result.ok ? { ok: 'Campaign archived.' } : { error: result.code },
  );
});

admin.post('/links', async (c) => {
  const fields = await form(c);
  const page = fields.campaign ? `/admin/campaigns/${fields.campaign}` : '/admin';
  const parsed = LinkCreateSchema.safeParse(fields);
  if (!parsed.success) return back(c, page, { error: invalid(parsed.error.issues) });
  const result = await operations.createLink(c.var.store, parsed.data);
  return back(
    c,
    page,
    result.ok ? { ok: `Created ${result.value.shortUrl}` } : { error: result.code },
  );
});

admin.post('/links/:slug', async (c) => {
  const slug = c.req.param('slug');
  const fields = await form(c);
  const parsed = LinkUpdateSchema.safeParse({ ...fields, note: fields.note ?? null });
  const found = await c.var.store.link(slug);
  const page = found ? `/admin/campaigns/${found.campaign}` : '/admin';
  if (!parsed.success) return back(c, page, { error: invalid(parsed.error.issues) });
  const result = await operations.updateLink(c.var.store, slug, parsed.data);
  return back(c, page, result.ok ? { ok: `Saved ${slug}.` } : { error: result.code });
});

admin.post('/links/:slug/archive', async (c) => {
  const slug = c.req.param('slug');
  const result = await operations.archiveLink(c.var.store, slug);
  if (!result.ok) return back(c, '/admin', { error: result.code });
  return back(c, `/admin/campaigns/${result.value.campaign}`, { ok: `Archived ${slug}.` });
});

admin.post('/tokens', async (c) => {
  const fields = await form(c);
  const parsed = TokenCreateSchema.safeParse({
    name: fields.name,
    scope: fields.scope,
    expiresInDays:
      fields.expiresInDays === 'never' ? null : Number(fields.expiresInDays ?? Number.NaN),
  });
  if (!parsed.success) return back(c, '/admin', { error: invalid(parsed.error.issues) });
  const created = await operations.createToken(c.var.store, parsed.data);
  return c.html(await dashboard(c, created));
});

admin.post('/tokens/:id/revoke', async (c) => {
  const result = await operations.revokeToken(c.var.store, c.req.param('id'));
  return back(
    c,
    '/admin',
    result.ok ? { ok: `Revoked ${result.value.name}.` } : { error: result.code },
  );
});
