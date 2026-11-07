import type { GenuiDocument } from '../../src/channels/genui-document.js';

export const syntheticGenuiDocument: GenuiDocument = {
  version: 2,
  snapshotId: 'synthetic-rich-document-1',
  observedAt: '2026-11-08T00:00:00.000Z',
  title: 'Synthetic project explorer',
  stateContract: {
    version: 1,
    fields: {
      filter: { type: 'string', initial: '', maxLength: 120 },
      sort: { type: 'choice', initial: 'descending', options: ['ascending', 'descending'] },
      selected: { type: 'choice', initial: 'none', options: ['none', 'alpha', 'beta', 'gamma'] },
      scene: {
        type: 'choice',
        initial: 'all',
        options: [
          'all',
          'metrics',
          'comparison',
          'table',
          'bar',
          'line',
          'donut',
          'flow',
          'relations',
          'timeline',
        ],
      },
      details: { type: 'boolean', initial: false },
    },
  },
  html: `<style>
    body { padding:var(--space-5); font-size:14px; line-height:1.5 }
    h1 { font-size:22px; margin:0 0 4px } h2 { font-size:16px; margin:0 0 12px }
    p { margin:4px 0 12px } .muted { color:var(--muted) }
    .toolbar { display:flex; flex-wrap:wrap; gap:var(--space-3); margin:var(--space-5) 0 }
    input,select,button { font:inherit; color:var(--foreground); background:var(--well); border:0; border-radius:var(--radius); padding:var(--space-3) var(--space-4) }
    input { min-width:0; flex:1 } button { cursor:pointer }
    .metric-grid { display:flex; gap:24px; flex-wrap:wrap } .metric strong { display:block; font-size:28px }
    .comparison { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px }
    figure { margin:0 } svg:not(.pele) { display:block; width:100%; height:auto; max-height:220px } svg:not(.pele) text { fill:var(--foreground); font-size:12px }
    .table-scroll { overflow-x:auto } .wide { grid-column:1/-1 }
    ol { margin:0; padding-left:22px } li { padding:4px 0 }
    [hidden] { display:none!important }
    .legend-key { color:var(--series-color); font-weight:500 }
    @media(max-width:480px) { .comparison { grid-template-columns:1fr } body { padding:12px } }
  </style>
  <header><h1>Project explorer</h1><p class="muted">Synthetic data · 8 Nov 2026 · local exploration, no business actions</p></header>
  <div class="toolbar">
    <input id="filter" aria-label="Filter projects" placeholder="Filter projects" maxlength="120">
    <select id="sort" aria-label="Sort score"><option value="descending">Score: high to low</option><option value="ascending">Score: low to high</option></select>
    <select id="scene" aria-label="Content scene"><option value="all">All content</option><option value="metrics">Metrics</option><option value="comparison">Comparison cards</option><option value="table">Table</option><option value="bar">Bar chart</option><option value="line">Line chart</option><option value="donut">Donut chart</option><option value="flow">Flow diagram</option><option value="relations">Relationship diagram</option><option value="timeline">Timeline</option></select>
  </div>
  <div class="genui-grid">
    <section data-scene="metrics" class="genui-surface"><h2>Key metrics</h2><div class="metric-grid"><div class="metric"><span>Projects</span><strong>3</strong></div><div class="metric"><span>Top score</span><strong>92</strong></div><div class="metric"><span>Change</span><strong>+12%</strong></div></div></section>
    <section data-scene="comparison" class="genui-surface"><h2>Compare options</h2><div class="comparison"><div class="genui-well"><strong>Alpha</strong><p>92 points</p><span>Best reach</span></div><div class="genui-well"><strong>Beta</strong><p>74 points</p><span>Lowest cost</span></div><div class="genui-well"><strong>Gamma</strong><p>86 points</p><span>Balanced</span></div></div></section>
    <section data-scene="table" class="wide genui-surface"><h2>Project table</h2><div class="table-scroll"><table class="genui-table"><caption class="muted">The same immutable project snapshot</caption><thead><tr><th>Project</th><th>Score</th><th>Cost</th><th>Pick</th></tr></thead><tbody id="rows"></tbody></table></div><p id="empty" hidden>No matching projects</p><p id="selected" class="muted"></p><button id="details" type="button" aria-expanded="false">Show details</button><p id="detail-body" class="genui-selection" hidden>Synthetic comparison only. Alpha prioritizes reach; Beta prioritizes cost; Gamma balances both.</p></section>
    <section data-scene="bar" class="genui-surface"><h2>Bar chart</h2><figure><svg viewBox="0 0 320 190" role="img" aria-label="Project scores: Alpha 92, Beta 74, Gamma 86"><path class="genui-axis" d="M58 5V150H308"/><text x="0" y="32">Alpha</text><rect x="58" y="12" width="230" height="28" rx="4" fill="var(--chart-1)"/><text x="292" y="32">92</text><text x="0" y="82">Beta</text><rect x="58" y="62" width="185" height="28" rx="4" fill="var(--chart-2)"/><text x="247" y="82">74</text><text x="0" y="132">Gamma</text><rect x="58" y="112" width="215" height="28" rx="4" fill="var(--chart-3)"/><text x="277" y="132">86</text><text x="54" y="178">0</text><text x="280" y="178">100</text></svg><figcaption><ul class="genui-legend" aria-label="Score legend"><li class="genui-series" data-series="1"><span class="legend-key">1</span> Alpha 92</li><li class="genui-series" data-series="2"><span class="legend-key">2</span> Beta 74</li><li class="genui-series" data-series="3"><span class="legend-key">3</span> Gamma 86</li></ul></figcaption></figure></section>
    <section data-scene="line" class="genui-surface"><h2>Line chart</h2><figure><svg viewBox="0 0 320 170" role="img" aria-label="Weekly progress: Alpha 20, 38, 35, 68, 82; Beta 12, 24, 31, 45, 60; Gamma 30, 32, 49, 54, 70"><path class="genui-axis" d="M20 10V145H300"/><polyline points="25,120 90,95 155,100 220,48 285,25" fill="none" stroke="var(--chart-1)" stroke-width="3"/><g fill="var(--chart-1)"><circle cx="25" cy="120" r="4"/><circle cx="90" cy="95" r="4"/><circle cx="155" cy="100" r="4"/><circle cx="220" cy="48" r="4"/><circle cx="285" cy="25" r="4"/></g><polyline points="25,130 90,114 155,105 220,85 285,61" fill="none" stroke="var(--chart-2)" stroke-width="3" stroke-dasharray="8 4"/><g fill="var(--chart-2)"><rect x="21" y="126" width="8" height="8"/><rect x="86" y="110" width="8" height="8"/><rect x="151" y="101" width="8" height="8"/><rect x="216" y="81" width="8" height="8"/><rect x="281" y="57" width="8" height="8"/></g><polyline points="25,106 90,103 155,78 220,71 285,48" fill="none" stroke="var(--chart-3)" stroke-width="3" stroke-dasharray="2 4"/><g fill="var(--chart-3)"><path d="M25 101l5 9H20Z M90 98l5 9H85Z M155 73l5 9H150Z M220 66l5 9H215Z M285 43l5 9H280Z"/></g><text x="20" y="165">Week 1</text><text x="250" y="165">Week 5</text></svg><figcaption><ul class="genui-legend" aria-label="Weekly progress legend"><li class="genui-series" data-series="1"><span class="legend-key">● ━</span> Alpha: 20 → 38 → 35 → 68 → 82</li><li class="genui-series" data-series="2"><span class="legend-key">■ ┄</span> Beta: 12 → 24 → 31 → 45 → 60</li><li class="genui-series" data-series="3"><span class="legend-key">▲ ┈</span> Gamma: 30 → 32 → 49 → 54 → 70</li></ul></figcaption></figure></section>
    <section data-scene="donut" class="genui-surface"><h2>Donut chart</h2><figure><svg viewBox="0 0 320 170" role="img" aria-label="Allocation: sector 1 research 50%, sector 2 build 30%, sector 3 review 20%"><g transform="translate(160 85) rotate(-90)"><circle r="55" fill="none" stroke="var(--chart-6)" stroke-width="26"/><circle r="55" fill="none" stroke="var(--chart-5)" stroke-width="26" stroke-dasharray="276.46 345.58"/><circle r="55" fill="none" stroke="var(--chart-4)" stroke-width="26" stroke-dasharray="172.79 345.58"/></g><text x="140" y="90">100%</text><text x="236" y="90">1</text><text x="83" y="133">2</text><text x="110" y="25">3</text><path class="genui-axis" d="M225 85H233M107 124L95 131M122 33L118 27"/></svg><figcaption><ul class="genui-legend" aria-label="Allocation legend"><li class="genui-series" data-series="4"><span class="legend-key">1</span> Research 50%</li><li class="genui-series" data-series="5"><span class="legend-key">2</span> Build 30%</li><li class="genui-series" data-series="6"><span class="legend-key">3</span> Review 20%</li></ul></figcaption></figure></section>
    <section data-scene="flow" class="genui-surface"><h2>Flow diagram</h2><figure><svg viewBox="0 0 320 170" role="img" aria-label="Observe then compare then choose"><path d="M160 43V65M160 105V125" stroke="var(--axis)" stroke-width="3"/><g fill="var(--well)"><rect x="75" y="5" width="170" height="38" rx="8"/><rect x="75" y="65" width="170" height="40" rx="8"/><rect x="75" y="125" width="170" height="38" rx="8"/></g><text x="132" y="29">Observe</text><text x="130" y="90">Compare</text><text x="136" y="150">Choose</text></svg><figcaption>Observe → Compare → Choose</figcaption></figure></section>
    <section data-scene="relations" class="genui-surface"><h2>Relationship diagram</h2><figure><svg viewBox="0 0 320 170" role="img" aria-label="The project connects research, build and review"><g stroke="var(--axis)" stroke-width="2"><path d="M160 85L55 35M160 85L265 35M160 85L160 145"/></g><g fill="var(--well)"><circle cx="160" cy="85" r="32"/><circle cx="55" cy="35" r="29"/><circle cx="265" cy="35" r="29"/><circle cx="160" cy="145" r="23"/></g><text x="139" y="90">Project</text><text x="32" y="40">Research</text><text x="251" y="40">Build</text><text x="141" y="150">Review</text></svg><figcaption>Project ↔ Research / Build / Review</figcaption></figure></section>
    <section data-scene="timeline" class="genui-surface"><h2>Timeline</h2><ol><li><strong>Nov 8</strong> · Observe evidence</li><li><strong>Nov 9</strong> · Compare the options</li><li><strong>Nov 10</strong> · Human review</li></ol></section>
  </div>
  <script>
  (() => {
    const projects = [{ id:'alpha', name:'Alpha', score:92, cost:40 },{ id:'beta', name:'Beta', score:74, cost:20 },{ id:'gamma', name:'Gamma', score:86, cost:30 }];
    let state = window.genui.getState();
    const render = () => {
      document.querySelector('#filter').value = state.filter;
      document.querySelector('#sort').value = state.sort;
      document.querySelector('#scene').value = state.scene;
      const rows = projects.filter(row => row.name.toLowerCase().includes(state.filter.toLowerCase())).sort((left,right) => state.sort === 'ascending' ? left.score-right.score : right.score-left.score);
      const body = document.querySelector('#rows'); body.replaceChildren();
      for (const row of rows) {
        const tr = document.createElement('tr');
        for (const value of [row.name,row.score,row.cost]) { const td=document.createElement('td');td.textContent=String(value);tr.append(td); }
        const td=document.createElement('td'), input=document.createElement('input');input.type='radio';input.name='project';input.setAttribute('aria-label','Select '+row.name);input.checked=state.selected===row.id;input.addEventListener('change',()=>update({selected:row.id}));td.append(input);tr.append(td);body.append(tr);
      }
      document.querySelector('#empty').hidden = rows.length !== 0;
      document.querySelector('#selected').textContent = 'Selected: '+state.selected;
      document.querySelector('#detail-body').hidden = !state.details;
      document.querySelector('#details').setAttribute('aria-expanded',String(state.details));
      for(const section of document.querySelectorAll('[data-scene]')) section.hidden = state.scene !== 'all' && section.dataset.scene !== state.scene;
    };
    const update = (patch) => { state={...state,...patch};window.genui.setState(state);render(); };
    document.querySelector('#filter').addEventListener('input',event=>update({filter:event.target.value}));
    document.querySelector('#sort').addEventListener('change',event=>update({sort:event.target.value}));
    document.querySelector('#scene').addEventListener('change',event=>update({scene:event.target.value}));
    document.querySelector('#details').addEventListener('click',()=>update({details:!state.details}));
    addEventListener('genui:state',()=>{state=window.genui.getState();render();});
    render();
  })();
  </script>`,
};
