// PROTOTYPE — throwaway (#4198). Three radically different Settings IAs on one page,
// switchable via ?variant=A|B|C (← / → keys or the bottom bar). ?device=mobile shows the phone,
// ?theme=dark, ?role=Owner|Admin|Member mocks your role on the Team-mode Host.
// Everything is in-memory; nothing talks to a Host.
(() => {
  const { envs, roles, sections, about, topTasks } = window.PROTO;
  const q = new URLSearchParams(location.search);
  const VARIANTS = { A: '范围切换', B: '常用优先', C: '环境即对象' };
  const state = {
    variant: VARIANTS[q.get('variant')] ? q.get('variant') : 'A',
    device: q.get('device') === 'mobile' ? 'mobile' : 'desktop',
    theme: q.get('theme') === 'dark' ? 'dark' : 'light',
    role: ['Owner', 'Admin', 'Member'].includes(q.get('role')) ? q.get('role') : 'Member',
    env: q.get('env') || 'studio',
    section: q.get('section') || null,
    page: q.get('page') || 'root', // variant C: 'root' or env id
    open: null, // open popover key
    search: '',
    flow: null,
    values: {},
    mobile: { left: 'root', sheet: null },
  };
  if (q.get('flow')) state.flow = newFlow(q.get('flow'), q.get('path'), Number(q.get('step') || 0));
  if (q.get('open')) state.open = q.get('open');
  if (q.get('sheet')) state.mobile.sheet = q.get('sheet');

  // ---------- model helpers ----------
  const env = (id = state.env) => envs.find((e) => e.id === id);
  const roleOf = (e) => (e.role === 'mock' ? state.role : e.role);
  const can = (e, perm) => !perm || !e.team || roles[roleOf(e)].includes(perm);
  const sec = (id) => sections.find((s) => s.id === id);
  const itemVisible = (e, it) => can(e, it.perm);
  function secVisible(s, e) {
    if (s.scope === 'device') return true;
    if (s.teamOnly && !e.team) return false;
    if (s.scope === 'me') return true;
    return can(e, s.perm) && s.items.some((it) => itemVisible(e, it));
  }
  const deviceSecs = () => sections.filter((s) => s.scope === 'device');
  const meSecs = (e) => sections.filter((s) => s.scope === 'me' && secVisible(s, e));
  const hostSecs = (e) => sections.filter((s) => s.scope === 'host' && secVisible(s, e));
  const hiddenHost = (e) => sections.filter((s) => s.scope === 'host' && !secVisible(s, e));
  const vkey = (it, s, e) => `${s.scope === 'device' ? 'device' : e.id}:${it.id}`;
  const val = (it, s, e) => {
    const k = vkey(it, s, e);
    return k in state.values ? state.values[k] : it.value;
  };
  const findItem = (id) => {
    for (const s of sections) {
      const it = s.items.find((i) => i.id === id);
      if (it) return [s, it];
    }
    return [];
  };

  // ---------- tiny view helpers ----------
  const ic = (n, cls = '') => `<i data-lucide="${n}" class="${cls}"></i>`;
  const esc = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
    );
  const glyph = (e, lg = false) =>
    e
      ? `<span class="glyph ${lg ? 'lg' : ''}" style="background:${e.color}">${ic(e.glyph)}</span>`
      : `<span class="glyph device ${lg ? 'lg' : ''}">${ic(state.device === 'mobile' ? 'smartphone' : 'laptop')}</span>`;
  const kindLabel = (e) => (e.kind === 'local' ? '本机' : '远程');
  const envSub = (e) => (e.status === 'offline' ? '离线' : `${kindLabel(e)} · ${roleOf(e)}`);
  const info = (text) => `<span class="info">${ic('info')}<span class="tip">${text}</span></span>`;

  function scopePill(s, e, opts = {}) {
    if (s.scope === 'device')
      return `<span class="scope">${glyph(null)}此设备<span class="sub">· 只保存在这台电脑</span></span>`;
    const who = s.scope === 'me' ? `我在 ${esc(e.name)} 上` : esc(e.name);
    const sub =
      s.scope === 'me' ? '· 只影响我' : e.team ? '· 团队共享' : `· 写入${kindLabel(e)} Host`;
    const btn = opts.picker ? 'btn' : '';
    return `<button class="scope ${btn}" ${opts.picker ? 'data-a="open" data-v="envmenu-head"' : ''}>${glyph(e)}${who}<span class="sub">${sub}</span>${opts.picker ? ic('chevrons-up-down') : ''}</button>`;
  }

  function control(it, s, e, disabled) {
    const v = val(it, s, e);
    const k = vkey(it, s, e);
    const dis = disabled ? 'disabled' : '';
    switch (it.control) {
      case 'switch':
        return `<button class="sw" role="switch" aria-checked="${!!v}" data-a="toggle" data-k="${k}" data-cur="${!!v}" ${dis}></button>`;
      case 'seg':
        return `<span class="seg">${it.options.map((o) => `<button aria-pressed="${o === v}" data-a="set" data-k="${k}" data-v="${esc(o)}" ${dis}>${esc(o)}</button>`).join('')}</span>`;
      case 'select':
        return `<span style="position:relative;display:inline-flex"><button class="sel" data-a="open" data-v="${k}" ${dis}><span>${esc(v)}</span>${ic('chevrons-up-down')}</button>${state.open === k ? `<div class="pop" style="left:auto;right:0">${it.options.map((o) => `<div class="mi" style="display:flex;gap:8px;padding:7px 8px;border-radius:8px;cursor:pointer" data-a="set" data-k="${k}" data-v="${esc(o)}">${o === v ? ic('check') : '<span style="width:16px"></span>'}${esc(o)}</div>`).join('')}</div>` : ''}</span>`;
      case 'stepper':
        return `<span class="stp"><button data-a="step" data-k="${k}" data-v="${-it.step}" data-cur="${v}" ${dis}>−</button><span>${v}${it.unit || ''}</span><button data-a="step" data-k="${k}" data-v="${it.step}" data-cur="${v}" ${dis}>+</button></span>`;
      case 'link':
        return `<span class="val">${esc(v)}${ic('chevron-right')}</span>`;
      case 'value':
        return `<span class="val">${esc(v)}${ic('pencil')}</span>`;
      case 'danger':
        return `<button class="btn danger sm" data-a="toast" data-v="原型：这里会先预览影响范围，再要求确认">${esc(v)}</button>`;
      case 'flow':
        return `<button class="btn primary sm" data-a="flow" data-v="${it.flow}">${ic('plus')}开始</button>`;
      default:
        return '';
    }
  }

  function row(it, s, e, opts = {}) {
    const locked = opts.locked;
    const link = (it.control === 'link' || it.control === 'value') && !locked;
    const tag = opts.tags ? scopeTag(s, e) : '';
    const desc = it.note && opts.notes ? `<span class="desc">${it.note}</span>` : '';
    const lockTag = locked
      ? `<span class="tag">${ic('lock')}由 ${e.owner || 'Owner'} 管理</span>`
      : '';
    return `<div class="row ${link ? 'link' : ''} ${locked ? 'locked' : ''}" ${link ? `data-a="toast" data-v="原型：打开「${it.label}」子页面"` : ''} id="row-${it.id}">
      <div class="txt"><span class="title">${esc(it.label)}${tag}${lockTag}</span>${desc}</div>
      ${locked ? `<span class="val">${esc(val(it, s, e))}</span>` : control(it, s, e)}
    </div>`;
  }
  function scopeTag(s, e) {
    if (s.scope === 'device') return `<span class="tag">${ic('laptop')}此设备</span>`;
    if (s.scope === 'me') return `<span class="tag">${ic('user-round')}只影响我</span>`;
    return `<span class="tag">${ic('server')}${esc(e.name)}</span>`;
  }
  function rowsFor(s, e, opts = {}) {
    return `<div class="rows">${s.items
      .filter((it) => itemVisible(e, it))
      .map((it) => row(it, s, e, opts))
      .join('')}</div>`;
  }
  function offline(e) {
    return `<div class="empty"><div class="big">${ic('cloud-off')}</div><b>${esc(e.name)} 现在离线</b><span>设置保存在 ${esc(e.name)} 上，连上后才能读取和修改。<br/>不会改到其他环境。</span><span style="display:flex;gap:8px"><button class="btn primary" data-a="toast" data-v="原型：重新连接 ${esc(e.name)}…">${ic('refresh-cw')}重新连接</button><button class="btn" data-a="toast" data-v="原型：打开连接自检">连接自检</button></span></div>`;
  }
  function hiddenNote(e) {
    const h = hiddenHost(e);
    if (!e.team || !h.length) return '';
    return `<div class="nav-group" style="font-weight:400">${ic('lock')}另有 ${h.length} 类由 ${e.owner} 管理 ${info(`你在 ${e.name} 上是 ${roleOf(e)}。${h.map((s) => s.label).join('、')} 只有被授权的人能看到和修改；Host 也会拒绝没有权限的修改。`)}</div>`;
  }
  function memberReadonly(e) {
    if (!e.team || roleOf(e) !== 'Member') return '';
    const [ms, mi] = findItem('defaultModel');
    const [as, ai] = findItem('template');
    return `<div class="sec"><div class="sec-title">${ic('lock')}这个 Host 的设置（只读）</div><div class="rows">${row(mi, ms, e, { locked: true })}${row(ai, as, e, { locked: true })}</div></div>`;
  }
  function sectionBody(s, e, opts = {}) {
    if (s.scope !== 'device' && e.status === 'offline') return offline(e);
    let html = '';
    if (s.id === 'me' && e.team)
      html += `<div class="note">${ic('user-round')}<span>这些偏好跟着你在 ${esc(e.name)} 上的账号走，团队里其他人看不到也改不了。</span></div>`;
    html += rowsFor(s, e, opts);
    if (s.id === 'me') html += memberReadonly(e);
    if (s.id === 'connections')
      html += `<div class="note" style="margin-top:12px">${ic('sparkles')}<span>想让 Bot 帮你配？每个连接步骤里都有「让 Bot 帮我配置」，复制提示词发给任意 Bot，它会用 <code>deepseekbot</code> CLI 完成，只把核对指纹留给你。</span></div>`;
    return html;
  }

  // ---------- search (A and B) ----------
  function searchResults(e) {
    const term = state.search.trim();
    const hits = [];
    for (const s of sections) {
      if (!secVisible(s, e)) continue;
      for (const it of s.items)
        if (itemVisible(e, it) && (it.label.includes(term) || s.label.includes(term)))
          hits.push([s, it]);
    }
    if (!hits.length)
      return `<div class="empty"><div class="big">${ic('search-x')}</div><b>没有找到「${esc(term)}」</b><span>换个说法，或者问问 Bot：「帮我在 Tobs 里设置 ${esc(term)}」</span></div>`;
    return `<div class="rows">${hits.map(([s, it]) => row(it, s, e, { tags: true })).join('')}</div>`;
  }

  // ======================================================================
  // Variant A — one dialog, environment picker always visible in the nav
  // ======================================================================
  function envMenu(anchorKey, style) {
    if (state.open !== anchorKey) return '';
    return `<div class="menu" style="${style}">
      ${envs.map((e) => `<div class="mi" data-a="env" data-v="${e.id}">${glyph(e)}<div class="t"><div>${esc(e.name)}</div><div class="s">${esc(e.via)}</div></div><span class="dot ${e.status === 'offline' ? 'off' : ''}"></span>${e.id === state.env ? ic('check') : ''}</div>`).join('')}
      <div class="sep"></div>
      <div class="mi" data-a="flow" data-v="computer">${ic('plus')}<div class="t">连接另一台电脑…</div></div>
    </div>`;
  }
  function variantA() {
    const e = env();
    const visible = [...deviceSecs(), ...meSecs(e), ...hostSecs(e)];
    const cur =
      sec(state.section) && visible.includes(sec(state.section))
        ? sec(state.section)
        : sec('models') && visible.includes(sec('models'))
          ? sec('models')
          : visible[0];
    const cell = (s) =>
      `<button class="nav-cell" aria-current="${cur === s && !state.search ? 'page' : 'false'}" data-a="sec" data-v="${s.id}">${ic(s.icon)}<span class="lbl">${s.label}</span></button>`;
    const nav = `<nav class="nav">
      <div class="nav-title">设置</div>
      <label class="search">${ic('search')}<input data-a="search" placeholder="搜索设置" value="${esc(state.search)}"/></label>
      <div class="nav-list">
        <div class="nav-group">${ic('laptop')}此设备</div>
        ${deviceSecs().map(cell).join('')}
        <div style="position:relative">
          <button class="envpick" data-a="open" data-v="envmenu">${glyph(e)}<div class="t"><div class="n">${esc(e.name)}</div><div class="s">${envSub(e)}</div></div>${ic('chevrons-up-down')}</button>
          ${envMenu('envmenu', 'left:2px;top:56px')}
        </div>
        ${meSecs(e).map(cell).join('')}
        ${hostSecs(e).length ? `<div class="nav-group">${ic('server')}${esc(e.name)} 的设置</div>` : ''}
        ${hostSecs(e).map(cell).join('')}
        ${hiddenNote(e)}
      </div>
      <button class="nav-cell" data-a="toast" data-v="${about.version} · ${about.build}">${ic('info')}<span class="lbl">关于</span><span class="tail">${about.version}</span></button>
    </nav>`;
    const head = state.search
      ? `<h2>搜索结果</h2>`
      : `<h2>${cur.label}</h2>${scopePill(cur, e, { picker: cur.scope !== 'device' })}${envMenu('envmenu-head', 'right:56px;top:48px')}`;
    const body = state.search ? searchResults(e) : sectionBody(cur, e, { notes: true });
    return dialog(nav, head, body);
  }

  // ======================================================================
  // Variant B — task-first home, goal-based groups, scope tag on every row
  // ======================================================================
  const B_GROUPS = [
    { label: '外观与通知', ids: ['appearance', 'notifications', 'window'] },
    { label: 'Bot 与模型', ids: ['models', 'approvals', 'prompts', 'tools'] },
    { label: '聊天', ids: ['me', 'collab', 'im'] },
    { label: '连接', ids: ['connections'] },
    { label: '团队与账号', ids: ['team', 'account'] },
    { label: '数据', ids: ['data'] },
  ];
  function tile(t, e) {
    const [s, it] = t.flow ? [] : findItem(t.id);
    if (s && !secVisible(s, e)) return '';
    if (it && !itemVisible(e, it)) return '';
    if (t.flow && !can(e, 'connections.manage')) return '';
    const value = it
      ? it.control === 'switch'
        ? val(it, s, e)
          ? '已开启'
          : '已关闭'
        : val(it, s, e)
      : '';
    const where = s
      ? s.scope === 'device'
        ? '此设备'
        : s.scope === 'me'
          ? '只影响我'
          : e.name
      : `到 ${e.name}`;
    const k = `tile-${t.id}`;
    let act = `data-a="sec" data-v="${t.section}" data-hl="${t.id}"`;
    if (t.flow) act = `data-a="flow" data-v="${t.flow}"`;
    else if (it.control === 'switch')
      act = `data-a="toggle" data-k="${vkey(it, s, e)}" data-cur="${!!val(it, s, e)}"`;
    else if (it.control === 'seg' || it.control === 'select') act = `data-a="open" data-v="${k}"`;
    const pop =
      state.open === k
        ? `<div class="pop">${it.options.map((o) => `<div class="mi" style="display:flex;gap:8px;padding:7px 8px;border-radius:8px;cursor:pointer" data-a="set" data-k="${vkey(it, s, e)}" data-v="${esc(o)}">${o === val(it, s, e) ? ic('check') : '<span style="width:16px"></span>'}${esc(o)}</div>`).join('')}</div>`
        : '';
    return `<div style="position:relative"><button class="tile" ${act} style="width:100%"><span class="ti">${ic(t.icon)}</span><span class="tl">${t.label}</span><span class="tv">${value ? esc(value) + ' · ' : ''}${esc(where)}</span></button>${pop}</div>`;
  }
  function variantB() {
    const e = env();
    const home = !state.section;
    const cur = home ? null : sec(state.section);
    const nav = `<nav class="nav">
      <div class="nav-title">设置</div>
      <div class="nav-list">
        <button class="nav-cell" aria-current="${home && !state.search ? 'page' : 'false'}" data-a="sec" data-v="">${ic('house')}<span class="lbl">常用</span></button>
        ${B_GROUPS.map((g) => {
          const items = g.ids.map(sec).filter((s) => secVisible(s, e));
          if (!items.length) return '';
          return `<div class="nav-group">${g.label}</div>${items.map((s) => `<button class="nav-cell" aria-current="${cur === s && !state.search ? 'page' : 'false'}" data-a="sec" data-v="${s.id}">${ic(s.icon)}<span class="lbl">${s.label}</span></button>`).join('')}`;
        }).join('')}
        ${hiddenNote(e)}
      </div>
      <button class="nav-cell" data-a="toast" data-v="${about.version} · ${about.build}">${ic('info')}<span class="lbl">关于</span><span class="tail">${about.version}</span></button>
    </nav>`;
    let head, body;
    if (state.search) {
      head = '<h2>搜索结果</h2>';
      body = searchResults(e);
    } else if (home) {
      head = `<h2>常用设置</h2><span style="position:relative"><button class="scope btn" data-a="open" data-v="envmenu-b">Host 设置作用于 ${glyph(e)}${esc(e.name)}${ic('chevrons-up-down')}</button>${envMenu('envmenu-b', 'right:0;top:34px')}</span>`;
      body = `<label class="search" style="height:38px;margin-bottom:14px">${ic('search')}<input data-a="search" placeholder="搜索设置，或描述你想做的事" value="${esc(state.search)}"/></label>
        <div class="tiles">${topTasks.map((t) => tile(t, e)).join('')}</div>
        <div class="h3">${ic('server')}环境 ${info('每台运行 Tobs 的电脑都是一个环境（Host）。Bot、模型和 IM 应用存在 Host 上；外观和通知只存在这台设备。')}</div>
        <div class="envcards">${envs.map((x) => `<button class="envcard" data-a="envgo" data-v="${x.id}"><span class="top">${glyph(x)}<span class="n">${esc(x.name)}</span>${x.id === state.env ? ic('check') : ''}</span><span class="s"><span class="dot ${x.status === 'offline' ? 'off' : ''}"></span>${esc(x.status === 'offline' ? '离线' : x.via)}</span><span class="s">${x.status === 'offline' ? '上次在线 2 天前' : `你是 ${roleOf(x)}`}</span></button>`).join('')}
          <button class="envcard add" data-a="flow" data-v="computer">${ic('plus')}连接电脑或手机</button></div>`;
    } else {
      head = `<h2>${cur.label}</h2>${cur.scope === 'device' ? scopePill(cur, e) : `<span style="position:relative">${scopePill(cur, e, { picker: true })}${envMenu('envmenu-head', 'right:0;top:34px')}</span>`}`;
      body = sectionBody(cur, e, { tags: false, notes: true });
    }
    return dialog(nav, head, body);
  }

  // ======================================================================
  // Variant C — device prefs flat, each environment is an object you open
  // ======================================================================
  function variantC() {
    const inEnv = state.page !== 'root' && env(state.page);
    const e = inEnv ? env(state.page) : env();
    let nav, head, body;
    if (!inEnv) {
      const cur =
        sec(state.section) && sec(state.section).scope === 'device'
          ? sec(state.section)
          : sections[0];
      nav = `<nav class="nav">
        <div class="nav-title">设置</div>
        <button class="envpick" data-a="toast" data-v="原型：Tobs 账号与个人资料" style="background:transparent;padding:4px 6px"><span class="glyph lg" style="background:#64748b;border-radius:50%;font-weight:600">V</span><div class="t"><div class="n">Vain</div><div class="s">Tobs 账号</div></div></button>
        <div class="nav-list">
          <div class="nav-group">${ic('laptop')}此设备</div>
          ${deviceSecs()
            .map(
              (s) =>
                `<button class="nav-cell" aria-current="${cur === s ? 'page' : 'false'}" data-a="sec" data-v="${s.id}">${ic(s.icon)}<span class="lbl">${s.label}</span></button>`,
            )
            .join('')}
          <div class="nav-group">${ic('server')}环境</div>
          ${envs.map((x) => `<button class="nav-cell" data-a="page" data-v="${x.id}">${glyph(x)}<span class="lbl">${esc(x.name)}</span><span class="dot ${x.status === 'offline' ? 'off' : ''}"></span>${ic('chevron-right')}</button>`).join('')}
          <button class="nav-cell" data-a="flow" data-v="computer" style="color:var(--accent)">${ic('plus')}<span class="lbl">连接新环境</span></button>
        </div>
        <button class="nav-cell" data-a="toast" data-v="${about.version} · ${about.build}">${ic('info')}<span class="lbl">关于</span><span class="tail">${about.version}</span></button>
      </nav>`;
      head = `<h2>${cur.label}</h2>${scopePill(cur, e)}`;
      body = sectionBody(cur, e, { notes: true });
    } else {
      const list = [...meSecs(e), ...hostSecs(e)];
      const cur =
        state.section === 'overview' || !list.includes(sec(state.section))
          ? null
          : sec(state.section);
      nav = `<nav class="nav">
        <button class="back" data-a="page" data-v="root">${ic('chevron-left')}设置</button>
        <div style="display:flex;align-items:center;gap:10px;padding:2px 6px">${glyph(e, true)}<div style="min-width:0"><div style="font-weight:600">${esc(e.name)}</div><div style="font-size:12px;color:var(--subtle);display:flex;align-items:center;gap:6px"><span class="dot ${e.status === 'offline' ? 'off' : ''}"></span>${envSub(e)}</div></div></div>
        <div class="nav-list">
          <button class="nav-cell" aria-current="${!cur ? 'page' : 'false'}" data-a="sec" data-v="overview">${ic('layout-dashboard')}<span class="lbl">概览</span></button>
          ${e.status === 'offline' ? '' : list.map((s) => `<button class="nav-cell" aria-current="${cur === s ? 'page' : 'false'}" data-a="sec" data-v="${s.id}">${ic(s.icon)}<span class="lbl">${s.label}</span></button>`).join('')}
          ${e.status === 'offline' ? '' : hiddenNote(e)}
        </div>
      </nav>`;
      if (cur) {
        head = `<h2>${cur.label}</h2>${scopePill(cur, e)}`;
        body = sectionBody(cur, e, { notes: true });
      } else {
        head = `<h2>概览</h2>`;
        if (e.status === 'offline') body = offline(e);
        else {
          const [ms, mi] = findItem('defaultModel');
          const [as, ai] = findItem('template');
          const quick = [];
          if (can(e, ms.perm)) quick.push(row(mi, ms, e));
          else quick.push(row(mi, ms, e, { locked: true }));
          if (can(e, as.perm)) quick.push(row(ai, as, e));
          else quick.push(row(ai, as, e, { locked: true }));
          body = `<div class="hero">${glyph(e, true)}<div style="flex:1;min-width:0"><div class="n">${esc(e.name)}</div><div class="s"><span style="display:inline-flex;align-items:center;gap:6px"><span class="dot"></span>在线</span><span>${esc(e.via)}</span></div></div><button class="btn sm" data-a="toast" data-v="原型：更改这台电脑在此设备上的名称和图标">${ic('pencil')}名称和图标</button></div>
            <div class="facts"><div class="fact"><div class="k">你的角色</div><div class="v">${roleOf(e)}</div></div><div class="fact"><div class="k">Bot</div><div class="v">${e.team ? '12 个' : '5 个'}</div></div><div class="fact"><div class="k">本周用量</div><div class="v">${e.team ? '1.2M' : '310K'} tokens</div></div></div>
            <div class="sec"><div class="sec-title">常用</div><div class="rows">${quick.join('')}
              ${can(e, 'connections.manage') ? `<div class="row"><div class="txt"><span class="title">连接手机到 ${esc(e.name)}</span></div><button class="btn primary sm" data-a="flow" data-v="phone">${ic('smartphone')}开始</button></div>` : ''}
              ${e.kind === 'remote' ? `<div class="row"><div class="txt"><span class="title">从这台设备断开 ${esc(e.name)}</span><span class="desc">不会删除 ${esc(e.name)} 上的任何数据</span></div><button class="btn danger sm" data-a="toast" data-v="原型：断开前确认">断开</button></div>` : ''}
            </div></div>`;
        }
      }
    }
    return dialog(nav, head, body);
  }

  function dialog(nav, head, body) {
    return `<div class="shell">${shellSide()}<div class="shell-main"><div class="bubble">帮我把上周的会议纪要整理成一页。</div><div class="bubble me">好的，我先读一下 /notes 里的文件…</div></div></div>
      <div class="scrim"><div class="dlg" role="dialog" aria-label="设置">${nav}<section class="content"><div class="content-head">${head}<button class="close" aria-label="关闭">${ic('x')}</button></div><div class="content-body">${body}</div></section>${state.flow ? stepper() : ''}</div></div>`;
  }
  function shellSide() {
    return `<aside class="shell-side"><div class="row">${ic('search')}搜索</div><div class="row on">${ic('message-circle')}DeepSeekBot</div><div class="row">${ic('hash')}产品周会</div><div class="row">${ic('hash')}设计评审</div><div class="row">${ic('bot')}Tob</div></aside>`;
  }

  // ======================================================================
  // Steppers — the complex connection flows, shared by all variants
  // ======================================================================
  function newFlow(kind, path, step = 0) {
    return {
      kind,
      path: path || (kind === 'computer' ? null : 'default'),
      step,
      prompt: false,
      more: false,
    };
  }
  const FP_HOST = ['K7QM', '2XHD', 'A9PE', 'W4TN', 'R6JC', '8BFL', 'Y3VU', 'N5GZ'];
  const FP_DEV = ['M2LC', 'Q8WA', 'H4RN', 'D7XE', 'P9KT', 'B3VJ', 'F6SY', 'U1ZG'];
  const fp = (a) => `<div class="fp">${a.map((x) => `<span>${x}</span>`).join('')}</div>`;
  const FLOW = {
    phone: {
      title: (e) => `连接手机到 ${e.name}`,
      steps: () => ['扫码', '核对指纹', '完成'],
      body(f, e) {
        if (f.step === 0)
          return `<div class="center">在手机上打开 Tobs → <b>添加电脑</b>，扫描二维码</div>
          <svg class="qr" viewBox="0 0 21 21" shape-rendering="crispEdges">${qr()}</svg>
          <div class="center" style="font-size:12px">${ic('timer')} 9:41 后失效 · <span class="disclosure" data-a="toast" data-v="原型：重新生成二维码">重新生成</span></div>
          <div class="note">${ic('route')}<span style="flex:1">连接方式：<b>自动</b>（Tobs Connect，在外网也能用）<br/>${f.more ? '可选：同一局域网 · Tailscale · 私有连接。自动模式会按可用性依次尝试，一般不用改。' : ''}</span><button class="disclosure" data-a="flowmore">${f.more ? '收起' : '更改'}</button></div>`;
        if (f.step === 1)
          return `<div class="center">确认手机上显示的指纹和这里<b>完全一致</b></div>${fp(FP_DEV)}<div class="center" style="font-size:12px">不一致就取消，不要继续。${info('指纹能确认你连上的是自己的手机，而不是中间人。')}</div>`;
        return `<div class="okbig">${ic('check')}</div><div class="center"><b style="color:var(--fg)">iPhone 17 已连接到 ${esc(e.name)}</b><br/>手机上可以直接和 ${esc(e.name)} 上的 Bot 聊天了。</div>`;
      },
      next: (f) => (f.step === 1 ? '一致，连接' : f.step === 2 ? '完成' : '手机已扫码'),
      prompt: (e) =>
        `请帮我把手机连接到「${e.name}」。\n1. 在 ${e.name} 上运行：deepseekbot device-offer --out ~/tobs-pair-link\n2. 用二维码或链接在手机上打开，然后运行 deepseekbot device-requests，把完整的设备指纹发给我核对。\n3. 我确认一致后，再运行 deepseekbot device-offer-status <receipt> 直到 redeemed，并把结果告诉我。\n不要把配对链接贴到聊天里。`,
    },
    computer: {
      title: () => '连接另一台电脑',
      steps: (f) =>
        f.path === 'account'
          ? ['选择电脑', '核对指纹', '完成']
          : f.path === 'team'
            ? ['选择电脑', '核对指纹', '登录', '设置新密码', '完成']
            : ['选择电脑', '粘贴链接', '核对指纹', '对方批准', '完成'],
      body(f, e) {
        const steps = this.steps(f);
        const label = steps[f.step];
        if (f.step === 0)
          return `<div style="font-size:12px;color:var(--muted)">同一个 Tobs 账号的电脑</div>
          ${choice('account', 'monitor', 'Office-PC', '同一账号 · 在线 · 一步连接', f)}
          <div style="font-size:12px;color:var(--muted);margin-top:4px">其他电脑</div>
          ${choice('link', 'link', '用连接链接', '在那台电脑上：设置 → 设备与连接 → 让其他设备连接', f)}
          ${choice('team', 'building-2', '登录团队 Host', '管理员给了你地址、用户名和初始密码', f)}`;
        if (label === '粘贴链接')
          return `<div class="field"><label>连接链接</label><textarea rows="3" placeholder="tobs://connect?…"></textarea></div><button class="btn sm" data-a="toast" data-v="原型：从二维码图片读取">${ic('image')}从二维码图片读取</button>`;
        if (label === '登录')
          return `<div class="field"><label>用户名</label><input value="vain"/></div><div class="field"><label>初始密码</label><input type="password" value="xxxxxxxx"/></div>`;
        if (label === '设置新密码')
          return `<div class="note">${ic('key-round')}<span>第一次登录需要换掉管理员给的初始密码。</span></div><div class="field"><label>新密码</label><input type="password" value="xxxxxxxxxx"/></div>`;
        if (label === '核对指纹')
          return `<div class="center">确认对方电脑上显示的指纹和这里<b>完全一致</b></div>${fp(FP_HOST)}<div class="center" style="font-size:12px">在对方电脑：设置 → 设备与连接 → 本机指纹</div>`;
        if (label === '对方批准')
          return `<div class="spin"></div><div class="center">请在对方电脑上点 <b>批准</b><br/>它会显示这台设备的指纹：</div>${fp(FP_DEV)}`;
        const name =
          f.path === 'team' ? '团队服务器' : f.path === 'account' ? 'Office-PC' : 'Studio-2';
        return `<div class="okbig">${ic('check')}</div><div class="center"><b style="color:var(--fg)">已连接 ${name}</b><br/>${f.path === 'team' ? '你以 vain（Member）身份登录，只会看到你有权限的设置。' : '它会出现在环境列表里。'}</div><div class="field"><label>在此设备上显示为</label><input value="${name}"/></div>`;
      },
      next(f) {
        const s = this.steps(f);
        if (f.step === 0) return '下一步';
        if (s[f.step] === '核对指纹') return '一致，继续';
        if (s[f.step] === '对方批准') return '模拟：对方已批准';
        if (f.step === s.length - 1) return '完成';
        return '下一步';
      },
      prompt: () =>
        `请帮我把这台电脑连接到另一台电脑上的 Tobs。\n1. 在那台电脑上运行：deepseekbot device-offer --out ~/tobs-pair-link，把链接文件安全地拷到这台电脑（不要贴到聊天里）。\n2. 在这台电脑上运行：deepseekbot connection-clients 选中当前窗口，然后 deepseekbot connection start --client-id <id> --connection-id c1 --link-file <文件>。\n3. 状态到 verify-host 时，把完整的 Host 指纹发给我，我确认后你再运行 connection confirm --fingerprint '<完整指纹>' --confirm。\n4. 状态到 approve-device 时提醒我去那台电脑上批准，直到 connected。`,
    },
    invite: {
      title: (e) => `邀请成员到 ${e.name}`,
      steps: () => ['填写', '发送'],
      body(f) {
        return f.step === 0
          ? `<div class="field"><label>用户名</label><input value="bob"/></div><div class="field"><label>显示名称</label><input value="Bob"/></div><div class="field"><label>角色</label><input value="成员"/></div>`
          : `<div class="okbig">${ic('check')}</div><div class="center">邀请链接已生成，复制后私下发给 Bob。<br/>Bob 第一次登录时会设置自己的密码。</div><button class="btn" data-a="toast" data-v="已复制邀请">${ic('copy')}复制邀请</button>`;
      },
      next: (f) => (f.step === 0 ? '生成邀请' : '完成'),
      prompt: (e) =>
        `请在「${e.name}」上创建成员 bob（显示名 Bob，角色成员）：deepseekbot members create --username bob --display-name Bob --initial-password-file <新私密文件>，然后告诉我怎样把初始密码安全地交给 Bob。`,
    },
    im: {
      title: (e) => `添加 IM 应用到 ${e.name}`,
      steps: () => ['选择平台', '授权', '完成'],
      body(f) {
        if (f.step === 0)
          return ['飞书', 'Discord', 'Slack', 'QQ']
            .map((p, i) => choice('p' + i, 'message-square', p, '', f))
            .join('');
        if (f.step === 1)
          return `<div class="field"><label>App ID</label><input/></div><div class="field"><label>App Secret</label><input type="password"/></div><div class="note">${ic('lock')}<span>Secret 只存在 Host 的凭据服务里，不会写进配置文件。</span></div>`;
        return `<div class="okbig">${ic('check')}</div><div class="center">已连接。下一步：选择哪个 Bot 接收消息。</div>`;
      },
      next: (f) => (f.step === 2 ? '完成' : '下一步'),
      prompt: (e) =>
        `请在「${e.name}」上添加一个飞书 IM 应用：用 deepseekbot im-app create，Secret 从 stdin 读，不要打印出来；完成后用 deepseekbot im-apps 读回给我看。`,
    },
  };
  function choice(id, icon, n, s, f) {
    return `<button class="choice" aria-pressed="${f.path === id}" data-a="path" data-v="${id}"><span class="glyph" style="background:var(--accent)">${ic(icon)}</span><span class="t"><div class="n">${n}</div>${s ? `<div class="s">${s}</div>` : ''}</span></button>`;
  }
  function qr() {
    let s = '';
    let seed = 7;
    for (let y = 0; y < 21; y++)
      for (let x = 0; x < 21; x++) {
        const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
        let on;
        if (finder) {
          const fx = x > 13 ? x - 14 : x,
            fy = y > 13 ? y - 14 : y;
          on =
            fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx > 1 && fx < 5 && fy > 1 && fy < 5);
        } else {
          seed = (seed * 9301 + 49297) % 233280;
          on = seed / 233280 > 0.5;
        }
        if (on) s += `<rect x="${x}" y="${y}" width="1" height="1" fill="#0f1115"/>`;
      }
    return s;
  }
  function stepper() {
    const f = state.flow,
      def = FLOW[f.kind],
      e = env();
    const steps = def.steps(f);
    const canNext =
      !(f.kind === 'computer' && f.step === 0 && !f.path) &&
      !(f.kind === 'im' && f.step === 0 && !f.path);
    const target =
      f.kind === 'computer'
        ? `<span class="scope">${glyph(null)}此设备</span>`
        : `<span class="scope">${glyph(e)}${esc(e.name)}</span>`;
    return `<div class="stepper-scrim"><div class="stepper" role="dialog">
      <div class="stepper-head"><h3>${def.title(e)}</h3>${target}<button class="close" data-a="flowclose" aria-label="关闭">${ic('x')}</button></div>
      <div class="steps">${steps.map((s, i) => `<span class="st ${i < f.step ? 'done' : i === f.step ? 'on' : ''}"><i></i>${s}</span>`).join('')}</div>
      <div class="stepper-body">
        ${f.prompt ? `<div class="prompt"><div style="display:flex;align-items:center;gap:6px;font-weight:500">${ic('sparkles')}发给任意 Bot，让它用 CLI 配好<span style="flex:1"></span><button class="btn sm" data-a="copy">${ic('copy')}复制</button></div><pre>${esc(def.prompt(e))}</pre></div>` : ''}
        ${def.body.call(def, f, e)}
      </div>
      <div class="stepper-foot"><button class="btn ghost sm" data-a="flowprompt">${ic('sparkles')}${f.prompt ? '收起提示词' : '让 Bot 帮我配置'}</button><span class="sp"></span>
        ${f.step > 0 && f.step < steps.length - 1 ? `<button class="btn" data-a="flowback">上一步</button>` : ''}
        ${f.step === 1 && /指纹/.test(steps[1]) ? `<button class="btn" data-a="flowclose">不一致，取消</button>` : ''}
        <button class="btn primary" data-a="flownext" ${canNext ? '' : 'disabled'}>${def.next.call(def, f)}</button></div>
    </div></div>`;
  }

  // ======================================================================
  // Mobile (iOS grouped list) — one phone per variant + a second screen
  // ======================================================================
  const M_COLORS = {
    appearance: '#5856d6',
    notifications: '#ff3b30',
    window: '#8e8e93',
    me: '#007aff',
    account: '#8e8e93',
    models: '#34c759',
    approvals: '#ff9500',
    prompts: '#af52de',
    collab: '#007aff',
    im: '#30b0c7',
    tools: '#5ac8fa',
    team: '#ff2d55',
    connections: '#34c759',
    data: '#8e8e93',
  };
  const M_DEVICE = [
    { id: 'm-look', label: '外观与聊天背景', icon: 'palette', color: '#5856d6', value: '跟随系统' },
    { id: 'm-notify', label: '通知', icon: 'bell', color: '#ff3b30', value: '' },
    { id: 'm-haptic', label: '触感反馈', icon: 'vibrate', color: '#ff9500', sw: true },
    { id: 'm-icon', label: 'App 图标', icon: 'app-window', color: '#8e8e93', value: '默认' },
  ];
  const mRow = (o) =>
    `<div class="m-row ${o.tap ? 'tap' : ''} ${o.icon ? '' : 'noicon'}" ${o.act || ''}>${o.icon ? `<span class="mi" style="background:${o.color}">${ic(o.icon)}</span>` : ''}<div class="t">${o.label}${o.sub ? `<div class="s">${o.sub}</div>` : ''}</div>${o.sw ? `<span class="sw" role="switch" aria-checked="true"></span>` : `<span class="v">${o.value || ''}${o.tap === false ? '' : ic('chevron-right')}</span>`}</div>`;
  const mSec = (s, e) =>
    mRow({
      icon: s.icon,
      color: M_COLORS[s.id],
      label: s.label,
      value: s.id === 'models' ? '' : '',
      tap: true,
      act: `data-a="toast" data-v="原型：打开 ${e.name} 的「${s.label}」"`,
      sub:
        s.id === 'models'
          ? val(s.items[0], s, e)
          : s.id === 'connections'
            ? 'iPhone 17 · iPad'
            : '',
    });
  const mEnvChip = (e, act) =>
    `<div class="m-envchip" ${act}>${glyph(e, true)}<div style="flex:1;min-width:0"><div style="font-weight:600">${esc(e.name)}</div><div style="font-size:13px;color:var(--m-label2);display:flex;align-items:center;gap:6px"><span class="dot ${e.status === 'offline' ? 'off' : ''}"></span>${envSub(e)}</div></div>${ic('chevrons-up-down')}</div>`;
  function mHostGroups(e) {
    if (e.status === 'offline')
      return `<div class="m-group" style="padding:20px;text-align:center;color:var(--m-label2)">${esc(e.name)} 离线，连上后才能修改它的设置。</div>`;
    let h = `<div class="m-h">我在 ${esc(e.name)} 上</div><div class="m-group">${meSecs(e)
      .map((s) => mSec(s, e))
      .join('')}</div>`;
    const hs = hostSecs(e);
    if (hs.length)
      h += `<div class="m-h">${esc(e.name)} 的设置</div><div class="m-group">${hs.map((s) => mSec(s, e)).join('')}</div>`;
    if (e.team && hiddenHost(e).length)
      h += `<div class="m-foot">另有 ${hiddenHost(e).length} 类设置由 ${e.owner} 管理。</div>`;
    return h;
  }
  const profile = () =>
    `<div class="m-group">${mRow({ icon: 'user-round', color: '#64748b', label: '<b>Vain</b>', sub: 'Tobs 账号 · 个人资料', tap: true, act: 'data-a="toast" data-v="原型：个人资料"' })}</div>`;
  const pairRow = () =>
    mRow({
      icon: 'plus',
      color: 'var(--accent)',
      label: '<span style="color:var(--accent)">添加电脑</span>',
      tap: true,
      act: 'data-a="msheet" data-v="pair0"',
    });
  function phone(content, title, opts = {}) {
    return `<div class="phone"><div class="status"><span>9:41</span><span>${ic('signal')} ${ic('wifi')} ${ic('battery-full')}</span></div>
      ${opts.nav ? `<div class="navbar">${opts.nav}</div>` : ''}${title ? `<div class="large">${title}</div>` : ''}
      <div class="scroll">${content}</div>
      <div class="tabbar"><span>${ic('message-circle')}聊天</span><span>${ic('activity')}动态</span><span class="on">${ic('settings')}设置</span></div>
      ${opts.sheet || ''}</div>`;
  }
  function mSheetEnv() {
    return `<div class="m-sheet" data-a="msheet" data-v=""><div class="sh" data-stop="1"><span class="grab"></span><div class="shh"><span style="width:40px"></span><b>选择要设置的环境</b><span style="width:40px"></span></div>
      <div class="m-group">${envs.map((x) => `<div class="m-row tap" data-a="env" data-v="${x.id}">${glyph(x, true)}<div class="t">${esc(x.name)}<div class="s">${envSub(x)}</div></div>${x.id === state.env ? ic('check') : ''}</div>`).join('')}</div>
      <div class="m-group">${pairRow()}</div></div></div>`;
  }
  function mSheetPair(step) {
    const steps = ['扫码', '核对指纹', '完成'];
    const bar = `<div class="steps" style="padding:0">${steps.map((s, i) => `<span class="st ${i < step ? 'done' : i === step ? 'on' : ''}"><i></i>${s}</span>`).join('')}</div>`;
    let body;
    if (step === 0)
      body = `<div style="height:220px;border-radius:16px;background:#111;display:flex;align-items:center;justify-content:center;color:#fff">${ic('scan-line', 'ic-lg')}&nbsp;对准电脑上的二维码</div><div class="m-cap">在电脑上：设置 → 设备与连接 → 连接手机</div><button class="m-btn sec" data-a="msheet" data-v="pair1">粘贴连接链接</button>`;
    else if (step === 1)
      body = `<div class="m-cap">确认电脑上显示的指纹和这里完全一致</div>${fp(FP_DEV)}<button class="m-btn" data-a="msheet" data-v="pair2">一致，连接</button><button class="m-btn sec" data-a="msheet" data-v="">不一致，取消</button>`;
    else
      body = `<div class="okbig">${ic('check')}</div><div class="m-cap"><b style="color:var(--fg)">已连接 Studio</b><br/>它已加到环境列表，并设为当前环境。</div><button class="m-btn" data-a="msheet" data-v="">完成</button>`;
    return `<div class="m-sheet"><div class="sh" data-stop="1"><span class="grab"></span><div class="shh"><span style="width:40px"></span><b>添加电脑</b><span style="width:40px;text-align:right;color:var(--accent);cursor:pointer" data-a="msheet" data-v="">${ic('x')}</span></div>${bar}${body}</div></div>`;
  }
  function mobile() {
    const e = env();
    const sheet =
      state.mobile.sheet === 'env'
        ? mSheetEnv()
        : state.mobile.sheet?.startsWith('pair')
          ? mSheetPair(Number(state.mobile.sheet.slice(4)))
          : '';
    let left, right, capL, capR;
    if (state.variant === 'A') {
      left = phone(
        `${profile()}<div class="m-h">${ic('smartphone')}此手机</div><div class="m-group">${M_DEVICE.map(mRow).join('')}</div>
        <div class="m-h">${ic('server')}正在设置</div>${mEnvChip(e, 'data-a="msheet" data-v="env"')}${mHostGroups(e)}<div class="m-h"></div><div class="m-group">${pairRow()}</div>`,
        '设置',
        { sheet },
      );
      right = phone(
        `${profile()}<div class="m-h">此手机</div><div class="m-group">${M_DEVICE.slice(0, 2).map(mRow).join('')}</div>`,
        '设置',
        { sheet: mSheetEnv() },
      );
      capL = '设置首页：此手机 + 当前环境';
      capR = '点环境卡片切换要设置的环境';
    } else if (state.variant === 'B') {
      const tiles = [
        ['默认模型', val(findItem('defaultModel')[1], sec('models'), e), 'cpu', '#34c759'],
        ['外观', '跟随系统', 'palette', '#5856d6'],
        ['添加电脑', '扫码连接', 'plus', '#007aff', 'data-a="msheet" data-v="pair0"'],
        ['通知', '已开启', 'bell', '#ff3b30'],
        ['审批方式', val(findItem('template')[1], sec('approvals'), e), 'shield-check', '#ff9500'],
        ['用量', '本周 310K', 'chart-column', '#af52de'],
      ];
      left = phone(
        `<div class="m-group" style="display:flex;align-items:center;gap:8px;padding:9px 12px;color:var(--m-label2)">${ic('search')}搜索设置</div><div class="m-h">常用 · ${glyph(e)} ${esc(e.name)}</div>
        <div class="m-tiles">${tiles.map(([l, v, i, c, a]) => `<div class="m-tile" ${a || `data-a="toast" data-v="原型：${l}"`}><span class="mi" style="width:28px;height:28px;border-radius:7px;background:${c};display:flex;align-items:center;justify-content:center;color:#fff">${ic(i)}</span><span class="tl">${l}</span><span class="tv">${esc(v)}</span></div>`).join('')}</div>
        <div class="m-h">更多</div><div class="m-group">${[
          ['外观与通知', 'palette', '#5856d6'],
          ['Bot 与模型', 'cpu', '#34c759'],
          ['聊天', 'message-square', '#007aff'],
          ['连接', 'cable', '#30b0c7'],
          ['团队与账号', 'users', '#ff2d55'],
          ['数据', 'database', '#8e8e93'],
        ]
          .map(([l, i, c]) => mRow({ icon: i, color: c, label: l, tap: true }))
          .join('')}</div>`,
        '设置',
        { sheet },
      );
      const ms = sec('models');
      right = phone(
        `<div class="m-h">应用于</div>${mEnvChip(e, 'data-a="msheet" data-v="env"')}<div class="m-h"></div><div class="m-group">${ms.items.map((it) => mRow({ label: it.label, value: it.control === 'switch' ? '' : esc(String(val(it, ms, e))), sw: it.control === 'switch', tap: true })).join('')}</div>`,
        '',
        {
          nav: `<button class="backm">${ic('chevron-left')}设置</button><span class="ttl">Bot 与模型</span><span style="width:56px"></span>`,
        },
      );
      capL = '常用磁贴：一步改最常用的设置';
      capR = 'Host 设置页顶部写明「应用于」哪个环境';
    } else {
      left = phone(
        `${profile()}<div class="m-h">此手机</div><div class="m-group">${M_DEVICE.map(mRow).join('')}</div>
        <div class="m-h">环境</div><div class="m-group">${envs.map((x) => `<div class="m-row tap" data-a="mpage" data-v="${x.id}">${glyph(x, true)}<div class="t">${esc(x.name)}<div class="s" style="display:flex;align-items:center;gap:6px"><span class="dot ${x.status === 'offline' ? 'off' : ''}"></span>${esc(x.status === 'offline' ? '离线' : x.via)}</div></div><span class="v">${ic('chevron-right')}</span></div>`).join('')}${pairRow()}</div>`,
        '设置',
        { sheet },
      );
      right = phone(
        `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:4px 0 6px">${glyph(e, true)}<b style="font-size:20px">${esc(e.name)}</b><span style="font-size:13px;color:var(--m-label2);display:flex;align-items:center;gap:6px"><span class="dot ${e.status === 'offline' ? 'off' : ''}"></span>${esc(e.via)} · ${roleOf(e)}</span></div>${mHostGroups(e)}`,
        '',
        {
          nav: `<button class="backm" data-a="mpage" data-v="root">${ic('chevron-left')}设置</button><span class="ttl"></span><span style="color:var(--accent);font-size:16px">编辑</span>`,
        },
      );
      capL = '环境是列表里的对象';
      capR = '点进去只看这台电脑的设置';
    }
    return `<div class="phone-stage"><div style="position:relative"><div class="phone-cap">${capL}</div>${left}</div><div style="position:relative"><div class="phone-cap">${capR}</div>${right}</div></div>`;
  }

  // ---------- switcher bar ----------
  function bar() {
    const keys = Object.keys(VARIANTS);
    return `<div class="proto-bar" data-proto>
      <button data-a="var" data-v="-1" aria-label="上一个">${ic('chevron-left')}</button><span class="lab">${state.variant} · ${VARIANTS[state.variant]}</span><button data-a="var" data-v="1" aria-label="下一个">${ic('chevron-right')}</button>
      <span class="sepv"></span>${['desktop', 'mobile'].map((d) => `<button class="${state.device === d ? 'on' : ''}" data-a="device" data-v="${d}">${ic(d === 'desktop' ? 'monitor' : 'smartphone')}</button>`).join('')}
      <button data-a="theme">${ic(state.theme === 'dark' ? 'moon' : 'sun')}</button>
      <span class="sepv"></span><span style="opacity:.7;padding-left:4px">团队 Host 上我是</span>${['Owner', 'Admin', 'Member'].map((r) => `<button class="${state.role === r ? 'on' : ''}" data-a="role" data-v="${r}">${r}</button>`).join('')}
      <span class="sepv"></span><span style="opacity:.5;padding:0 6px">PROTOTYPE · ${keys.join('/')}</span></div>`;
  }

  // ---------- render & events ----------
  const root = document.getElementById('app');
  let toastTimer;
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.append(t);
    }
    t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 1800);
  }
  function sync() {
    const p = new URLSearchParams();
    p.set('variant', state.variant);
    if (state.device === 'mobile') p.set('device', 'mobile');
    if (state.theme === 'dark') p.set('theme', 'dark');
    p.set('role', state.role);
    p.set('env', state.env);
    if (state.section) p.set('section', state.section);
    if (state.page !== 'root') p.set('page', state.page);
    history.replaceState(null, '', `?${p}`);
  }
  function render() {
    document.documentElement.dataset.theme = state.theme;
    const focusSearch = document.activeElement?.dataset?.a === 'search';
    const view =
      state.device === 'mobile'
        ? mobile()
        : state.variant === 'A'
          ? variantA()
          : state.variant === 'B'
            ? variantB()
            : variantC();
    root.innerHTML = view + (q.get('shot') ? '' : bar());
    window.lucide?.createIcons({ attrs: { 'stroke-width': 1.75 } });
    if (focusSearch) {
      const i = root.querySelector('input[data-a="search"]');
      i?.focus();
      i?.setSelectionRange(i.value.length, i.value.length);
    }
    if (state.hl) {
      const r = document.getElementById('row-' + state.hl);
      r?.classList.add('flash');
      r?.scrollIntoView({ block: 'center' });
      state.hl = null;
    }
    sync();
  }
  root.addEventListener('input', (ev) => {
    if (ev.target.dataset.a === 'search') {
      state.search = ev.target.value;
      render();
    }
  });
  root.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-a]');
    if (!el) {
      if (state.open) {
        state.open = null;
        render();
      }
      return;
    }
    if (el.disabled) return;
    const a = el.dataset.a,
      v = el.dataset.v;
    if (a === 'msheet' && el.classList.contains('m-sheet') && ev.target.closest('[data-stop]'))
      return;
    const prevOpen = state.open;
    state.open = null;
    switch (a) {
      case 'var': {
        const k = Object.keys(VARIANTS);
        state.variant = k[(k.indexOf(state.variant) + Number(v) + k.length) % k.length];
        state.section = null;
        state.page = 'root';
        state.search = '';
        break;
      }
      case 'device':
        state.device = v;
        break;
      case 'theme':
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        break;
      case 'role':
        state.role = v;
        break;
      case 'open':
        state.open = prevOpen === v ? null : v;
        break;
      case 'env':
        state.env = v;
        state.mobile.sheet = null;
        if (state.variant === 'C' && state.page !== 'root') state.page = v;
        break;
      case 'envgo':
        state.env = v;
        state.section = 'models';
        break;
      case 'sec':
        state.section = v || null;
        state.search = '';
        if (el.dataset.hl) state.hl = el.dataset.hl;
        break;
      case 'page':
        state.page = v;
        state.section = v === 'root' ? null : 'overview';
        if (v !== 'root') state.env = v;
        break;
      case 'mpage':
        if (v !== 'root') state.env = v;
        break;
      case 'toggle':
        state.values[el.dataset.k] = el.dataset.cur !== 'true';
        break;
      case 'set':
        state.values[el.dataset.k] = v;
        break;
      case 'step':
        state.values[el.dataset.k] = Number(el.dataset.cur) + Number(v);
        break;
      case 'toast':
        toast(v);
        return;
      case 'flow':
        state.flow = newFlow(v);
        break;
      case 'flowclose':
        state.flow = null;
        break;
      case 'flowprompt':
        state.flow.prompt = !state.flow.prompt;
        break;
      case 'flowmore':
        state.flow.more = !state.flow.more;
        break;
      case 'path':
        state.flow.path = v;
        break;
      case 'flowback':
        state.flow.step = Math.max(0, state.flow.step - 1);
        break;
      case 'flownext': {
        const f = state.flow;
        const n = FLOW[f.kind].steps(f).length;
        if (f.step >= n - 1) state.flow = null;
        else f.step++;
        break;
      }
      case 'copy':
        navigator.clipboard?.writeText(FLOW[state.flow.kind].prompt(env())).catch(() => {});
        toast('已复制提示词');
        return;
      case 'msheet':
        state.mobile.sheet = v || null;
        break;
      case 'search':
        return;
    }
    render();
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.target.closest?.('input, textarea, [contenteditable]')) return;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
      const k = Object.keys(VARIANTS);
      state.variant =
        k[(k.indexOf(state.variant) + (ev.key === 'ArrowRight' ? 1 : -1) + k.length) % k.length];
      state.section = null;
      state.page = 'root';
      render();
    }
    if (ev.key === 'Escape') {
      state.open = null;
      state.flow = null;
      render();
    }
  });
  render();
})();
