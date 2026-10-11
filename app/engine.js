// The read-only app. It draws app/data.js (written by `npm run app`) using the pages in app/config.js.
// Nothing on these screens changes a record: every change is something you ask Claude Code for.
(function () {
  const D = window.DATA;
  const C = window.APP;
  const $ = (sel, el = document) => el.querySelector(sel);

  if (!D) {
    document.body.innerHTML = '<p style="padding:40px;font-family:system-ui">No data yet. Run <code>npm run app</code> in the repo folder.</p>';
    return;
  }

  // ---------- formatting ----------
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const num = (v) => (v == null || v === '' ? null : Number(v));
  const money = (cents, opts = {}) => {
    const n = num(cents);
    if (n == null) return '';
    const d = n / 100;
    const a = Math.abs(d);
    if (opts.short && a >= 1e6) return (d < 0 ? '-' : '') + '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'm';
    if (opts.short && a >= 1e4) return (d < 0 ? '-' : '') + '$' + Math.round(a / 1e3) + 'k';
    return (d < 0 ? '-' : '') + '$' + Math.round(a).toLocaleString('en-NZ');
  };
  const TODAY = new Date(D.today + 'T00:00:00');
  const toDate = (v) => (v instanceof Date ? v : v ? new Date(String(v).slice(0, 10) + 'T00:00:00') : null);
  const date = (v, withYear) => {
    const d = toDate(v);
    if (!d) return '';
    return d.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  };
  const daysFrom = (v) => {
    const d = toDate(v);
    return d ? Math.round((d - TODAY) / 864e5) : null;
  };
  const rel = (n) => {
    if (n == null) return '';
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    return n > 0 ? `in ${n} days` : `${-n} days ago`;
  };
  const pct = (bps) => (num(bps) == null ? '' : (num(bps) / 100).toFixed(2) + '%');
  const initials = (name) => String(name || '').split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const F = { esc, money, date, daysFrom, rel, pct, initials, num, today: TODAY };
  window.F = F;

  const get = (src) => (typeof src === 'function' ? src(D, F) : D[src]) || [];
  const tag = (text, tone) => (text ? `<span class="tag ${tone || ''}">${esc(text)}</span>` : '');
  const clientAttr = (name) => (name && C.clientDetail ? ` data-client="${esc(name)}"` : '');

  // ---------- icons ----------
  const I = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    money: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/>',
    shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.6c2.6.2 4.6 2 5 4.9"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    scale: '<path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0zM8 21h8"/>',
    spark: '<path d="M12 2.5 13.8 9 20 11l-6.2 2L12 19.5 10.2 13 4 11l6.2-2z"/>',
  };
  const icon = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${I[n] || I.file}</svg>`;

  // ---------- widgets ----------
  const W = {};

  W.kpis = (w) => `<div class="kpis">${w.items.map((k) => {
    const tone = typeof k.tone === 'function' ? k.tone(D, F) : k.tone || '';
    return `<div class="kpi ${tone}"><div class="l">${esc(k.label)}</div><div class="v num">${k.value(D, F)}</div><div class="s">${k.sub ? k.sub(D, F) : ''}</div></div>`;
  }).join('')}</div>`;

  function sev(w, r) {
    if ((w.red || []).includes(r.reason)) return 'red';
    if ((w.amber || []).includes(r.reason)) return 'amber';
    return '';
  }
  W.attention = (w) => {
    const rows = get(w.source);
    const groups = [
      ['red', 'Act now', rows.filter((r) => sev(w, r) === 'red')],
      ['amber', 'This week', rows.filter((r) => sev(w, r) === 'amber')],
      ['', 'Keep an eye on', rows.filter((r) => sev(w, r) === '')],
    ];
    let left = w.limit || 999;
    let out = '';
    for (const [tone, title, list] of groups) {
      if (!list.length || left <= 0) continue;
      const shown = list.slice(0, left);
      left -= shown.length;
      out += `<div class="group-h"><span class="dot ${tone}"></span>${title} <span style="font-weight:600">${list.length}</span></div>`;
      out += shown.map((r) => {
        const value = num(r.amount_cents) ? money(r.amount_cents) : '';
        const d = r.days != null && r.days !== '' ? `${r.days}d` : '';
        return `<div class="row"${clientAttr(r.client)}>${tag((w.labels || {})[r.reason] || r.reason, tone)}
          <div style="min-width:0"><div class="who">${esc(r.client)}</div><div class="what">${esc(r.detail)}</div></div>
          <div class="rt">${value ? `<b class="num">${value}</b>` : ''}<span>${esc(r.label)}${d ? ' · ' + d : ''}</span></div></div>`;
      }).join('');
    }
    return `<div class="rows">${out || '<div class="empty" style="padding:14px 18px">Nothing needs a decision. A rare week.</div>'}</div>`;
  };

  W.kanban = (w) => {
    const rows = get(w.source);
    return `<div class="board">${(typeof w.columns === 'function' ? w.columns(D, F) : w.columns).map((c) => {
      const keys = [].concat(c.key);
      const list = rows.filter((r) => keys.includes(r[w.groupBy]));
      const sum = w.sum ? list.reduce((a, r) => a + (num(w.sum(r)) || 0), 0) : 0;
      return `<div class="col"><h3>${esc(c.label)} <span class="n">${list.length}</span>${w.sum && sum ? `<span class="sum num">${money(sum, { short: true })}</span>` : ''}</h3>
        ${list.map((r) => {
          const k = w.card(r, F);
          return `<div class="deal"${clientAttr(k.client)}><div class="t"><span>${esc(k.title)}</span>${k.amount ? `<span class="amt num">${k.amount}</span>` : ''}</div>
            <div class="s">${esc(k.sub)}</div>
            ${k.chips && k.chips.filter(Boolean).length ? `<div class="chips">${k.chips.filter(Boolean).map((x) => tag(x[0], x[1])).join('')}</div>` : ''}
            <div class="meta"><span>${esc(k.left || '')}</span><span>${esc(k.right || '')}</span></div></div>`;
        }).join('') || '<div class="empty" style="padding:4px 4px 8px">None</div>'}</div>`;
    }).join('')}</div>`;
  };

  W.timeline = (w) => {
    const rows = get(w.source).map((row) => ({ row, d: daysFrom(w.date(row)), v: num(w.value(row)) || 0, tone: w.tone ? w.tone(row, F) : '' }));
    const from = w.from ?? -14, to = w.to ?? 120;
    const W_ = 1000, H = w.height || 230, padL = 34, padR = 44, axisY = H - 34;
    const x = (d) => padL + ((Math.max(from, Math.min(to, d)) - from) / (to - from)) * (W_ - padL - padR);
    const maxV = Math.max(1, ...rows.map((p) => p.v));
    const rad = (v) => 7 + Math.sqrt(v / maxV) * 22;
    const fill = { red: '#e5484d', amber: '#f5a524', green: '#30a46c', '': '#6654f5' };
    // stack bubbles upward until neither the bubble nor its label overlaps one already placed
    const placed = [];
    const box = (cx, cy, rr, label) => { const half = Math.max(rr, label.length * 3.6 + 4); return { x1: cx - half, x2: cx + half, y1: cy - rr - 22, y2: cy + rr }; };
    const hits = (p, q) => p.x1 < q.x2 && q.x1 < p.x2 && p.y1 < q.y2 && q.y1 < p.y2;
    const pts = rows.filter((p) => p.d != null).sort((a, b) => b.v - a.v).map((p) => {
      const cx = x(p.d), rr = rad(p.v), label = String(w.label(p.row));
      let cy = axisY - rr - 12;
      for (let tries = 0; tries < 12; tries++) {
        const bx = box(cx, cy, rr, label);
        const hit = placed.find((q) => hits(bx, q.bx));
        if (!hit) break;
        cy = hit.bx.y1 - rr - 6;
      }
      const o = { ...p, cx, cy, rr, bx: box(cx, cy, rr, label) };
      placed.push(o);
      return o;
    });
    const minY = Math.min(0, ...pts.map((p) => p.cy - p.rr - 24));
    const ticks = [];
    for (let d = Math.ceil(from / 30) * 30; d <= to; d += 30) ticks.push(d);
    const svg = `<svg viewBox="0 ${minY} ${W_} ${H - minY}" role="img" aria-label="${esc(w.title || 'timeline')}">
      <rect x="${x(from)}" y="${minY}" width="${x(0) - x(from)}" height="${axisY - minY}" fill="#fdecec" opacity=".55" rx="6"/>
      <line x1="${padL}" x2="${W_ - padR}" y1="${axisY}" y2="${axisY}" stroke="#d9d9e6"/>
      ${ticks.map((d) => `<line x1="${x(d)}" x2="${x(d)}" y1="${axisY}" y2="${axisY + 5}" stroke="#c5c7da"/><text x="${x(d)}" y="${axisY + 20}" text-anchor="middle" font-size="12" fill="#9a9db8">${d === 0 ? '' : date(new Date(TODAY.getTime() + d * 864e5))}</text>`).join('')}
      <line x1="${x(0)}" x2="${x(0)}" y1="${minY + 4}" y2="${axisY + 6}" stroke="#0b0c18" stroke-dasharray="3 4"/>
      <text x="${x(0)}" y="${axisY + 20}" text-anchor="middle" font-size="12" font-weight="700" fill="#0b0c18">Today</text>
      <text x="${x(from) + 8}" y="${minY + 18}" font-size="11.5" font-weight="700" fill="#e5484d" letter-spacing=".06em">${esc(w.pastLabel || 'OVERDUE')}</text>
      ${pts.map((p) => `<g${clientAttr(w.client ? w.client(p.row) : '')}><circle cx="${p.cx}" cy="${p.cy}" r="${p.rr}" fill="${fill[p.tone] || fill['']}" fill-opacity=".16" stroke="${fill[p.tone] || fill['']}" stroke-width="2"/>
        <text x="${p.cx}" y="${p.cy - p.rr - 7}" text-anchor="middle" font-size="12.5" font-weight="650" fill="#1a1b2e">${esc(w.label(p.row))}</text>
        ${w.inner && p.rr * 2 >= String(w.inner(p.row)).length * 6.8 + 6 ? `<text x="${p.cx}" y="${p.cy + 4}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${fill[p.tone] || fill['']}">${esc(w.inner(p.row))}</text>` : ''}</g>`).join('')}
    </svg>`;
    const legend = w.legend ? `<div class="legend">${w.legend.map(([t, l]) => `<span><i class="dot ${t}"></i>${esc(l)}</span>`).join('')}</div>` : '';
    return `<div class="timeline">${legend}${svg}</div>`;
  };

  W.bars = (w) => {
    const rows = get(w.source);
    const max = Math.max(1, ...rows.map((r) => Math.abs(num(w.value(r)) || 0)));
    return `<div class="bars">${rows.map((r) => {
      const v = num(w.value(r)) || 0;
      return `<div class="bar-row"><div class="lbl" title="${esc(w.label(r))}"${clientAttr(w.client ? w.client(r) : '')}>${esc(w.label(r))}</div>
        <div class="track"><div class="fill ${w.tone ? w.tone(r) : ''}" style="width:${Math.max(2, (Math.abs(v) / max) * 100)}%"></div></div>
        <div class="val num">${(w.format || money)(v)}${w.sub ? `<small>${esc(w.sub(r, F))}</small>` : ''}</div></div>`;
    }).join('') || '<div class="empty">Nothing here.</div>'}</div>`;
  };

  W.table = (w, id) => {
    let rows = get(w.source);
    if (w.filter) rows = rows.filter(w.filter);
    if (w.sort) rows = [...rows].sort(w.sort);
    const head = w.columns.map((c) => `<th class="${c.align === 'r' ? 'r' : ''}">${esc(c.label)}</th>`).join('');
    const body = rows.map((r) => `<tr${clientAttr(w.client ? w.client(r) : '')} data-search="${esc(Object.values(r).join(' ').toLowerCase())}">${w.columns.map((c) => {
      const v = c.value(r, F);
      return `<td class="${c.align === 'r' ? 'r num' : ''} ${c.cls || ''}">${c.html ? v : esc(v)}</td>`;
    }).join('')}</tr>`).join('');
    return `${w.search ? `<input class="search" placeholder="${esc(w.search)}" data-filter="${id}">` : ''}
      <div style="overflow-x:auto"><table class="t" id="${id}"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${w.columns.length}" class="dim">Nothing here.</td></tr>`}</tbody></table></div>`;
  };

  W.rules = (w) => {
    const rules = get(w.source);
    const pass = rules.filter((r) => !r.breaches.length).length;
    const circ = 2 * Math.PI * 30;
    const ring = `<svg class="ring" viewBox="0 0 74 74"><circle cx="37" cy="37" r="30" fill="none" stroke="#f0f0f6" stroke-width="8"/>
      <circle cx="37" cy="37" r="30" fill="none" stroke="${pass === rules.length ? '#30a46c' : '#6654f5'}" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${(pass / Math.max(1, rules.length)) * circ} ${circ}" transform="rotate(-90 37 37)"/></svg>`;
    return `<div class="score">${ring}<div><b>${pass} of ${rules.length} rules pass</b><p>${esc(w.intro || '')}</p></div></div>
      <div class="rules" style="margin-top:14px">${rules.map((r) => `<div class="rule ${r.breaches.length ? '' : 'pass'}">
        <div class="h"><b>${esc(r.name)}</b>${r.breaches.length ? tag(r.breaches.length + (r.breaches.length === 1 ? ' breach' : ' breaches'), 'red') : tag('Pass', 'green')}</div>
        <div class="src">${esc(r.source)}</div>
        ${r.breaches.length ? `<ul>${r.breaches.slice(0, 4).map((b) => `<li${clientAttr(b.client)}><span class="ref">${esc(w.breachRef ? w.breachRef(b) : (b.ref || b.label || (b.due ? date(b.due) : '')))}</span><span>${esc(w.breachText ? w.breachText(b) : (b.client || b.given_to || b.lawyer || b.name || ''))}</span></li>`).join('')}${r.breaches.length > 4 ? `<li style="color:var(--faint)">and ${r.breaches.length - 4} more</li>` : ''}</ul>` : ''}
      </div>`).join('')}</div>`;
  };

  W.people = (w) => `<div class="people">${get(w.source).map((r) => {
    const p = w.card(r, F);
    return `<div class="person"><div class="h"><div class="avatar" style="background:hsl(${hue(p.name)} 55% 52%)">${esc(initials(p.name))}</div><div><b>${esc(p.name)}</b><span>${esc(p.role)}</span></div></div>
      <dl>${p.stats.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd class="num">${esc(v)}</dd></div>`).join('')}</dl></div>`;
  }).join('')}</div>`;

  W.list = (w) => {
    const rows = get(w.source).map((r) => w.row(r, F)).filter(Boolean);
    return `<div class="rows">${rows.map((x) => `<div class="row compact"${clientAttr(x.client)}>${x.tone != null ? `<span class="dot ${x.tone}"></span>` : '<span></span>'}
      <div style="min-width:0"><div class="who">${esc(x.title)}</div><div class="what">${esc(x.sub || '')}</div></div>
      <div class="rt"><b class="num">${esc(x.right || '')}</b><span>${esc(x.rightSub || '')}</span></div></div>`).join('') || '<div class="empty" style="padding:12px 18px">Nothing here.</div>'}</div>`;
  };

  // ---------- page ----------
  const pageId = () => (location.hash.slice(1) || C.pages[0].id);
  function render() {
    const page = C.pages.find((p) => p.id === pageId()) || C.pages[0];
    const brand = D.brand || {};
    const firm = brand.business_name && brand.business_name !== 'Your Business' ? brand.business_name : C.demoFirm;
    document.title = `${page.title} · ${firm}`;
    document.documentElement.style.setProperty('--primary', brand.primary || '#6654f5');
    document.documentElement.style.setProperty('--accent', brand.accent || '#ca5a8b');

    const nav = C.pages.map((p) => {
      const c = p.count ? p.count(D, F) : null;
      return `<a href="#${p.id}" class="${p.id === page.id ? 'on' : ''}">${icon(p.icon)}<span>${esc(p.nav || p.title)}</span>${c ? `<span class="count ${c.tone || ''}">${esc(c.n)}</span>` : ''}</a>`;
    }).join('');

    const card = (w, id) => {
      const inner = W[w.type](w, id);
      if (w.bare) return `<section class="span-${w.span || 12}">${inner}</section>`;
      const more = w.more ? w.more(D, F) : '';
      return `<section class="card span-${w.span || 12} ${['attention', 'table', 'list'].includes(w.type) ? 'flush' : ''}">
        ${w.title ? `<header><h2>${esc(w.title)}</h2>${w.note ? `<span class="note">${esc(w.note)}</span>` : ''}${more ? `<span class="more">${esc(more)}</span>` : ''}</header>` : ''}
        <div class="body">${inner}</div></section>`;
    };
    const widgets = page.widgets.map((w, i) => (w.type === 'stack'
      ? `<div class="stack span-${w.span || 12}">${w.widgets.map((x, j) => card({ ...x, span: 12 }, `w-${page.id}-${i}-${j}`)).join('')}</div>`
      : card(w, `w-${page.id}-${i}`))).join('');

    $('#app').innerHTML = `<div class="shell">
      <aside class="side"><div class="stripe"></div>
        <div class="firm"><div class="logo">${brand.logo_path ? `<img src="../${esc(brand.logo_path)}" alt="">` : esc(initials(firm))}</div><div><b>${esc(firm)}</b><span>${esc(C.product)}</span></div></div>
        <nav class="nav">${nav}</nav>
        <div class="foot"><b>Read-only.</b> These screens show your records. To change anything, ask Claude Code in this folder.<br><br>Data as at ${esc(date(D.generated_at, true))}, ${esc(new Date(D.generated_at).toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }))}.</div>
      </aside>
      <main class="main">
        <div class="top"><div><h1>${esc(typeof page.heading === 'function' ? page.heading(D, F, firm) : page.heading || page.title)}</h1><div class="sub">${esc(typeof page.sub === 'function' ? page.sub(D, F) : page.sub || '')}</div></div>
          <div class="right"><div class="when">${esc(TODAY.toLocaleDateString('en-NZ', { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
          <button class="askbtn" data-ask>${icon('spark', 'spark')} Ask Claude</button></div></div>
        <div class="page">${widgets}</div>
      </main></div>
      <div class="scrim"></div><aside class="panel" aria-hidden="true"></aside><div class="toast"></div>`;
    window.scrollTo(0, 0);
  }

  // ---------- panels ----------
  const panel = () => $('.panel');
  function open(html) {
    panel().innerHTML = html;
    panel().classList.add('on');
    $('.scrim').classList.add('on');
  }
  function close() {
    panel().classList.remove('on');
    $('.scrim').classList.remove('on');
  }
  function promptsHtml(list) {
    return list.map((q) => `<button class="prompt" data-copy="${esc(q)}"><span class="q">${esc(q)}</span><span class="copy">Copy</span></button>`).join('');
  }
  function openAsk() {
    const page = C.pages.find((p) => p.id === pageId()) || C.pages[0];
    open(`<div class="ph"><div><h3>Ask Claude about ${esc(page.nav || page.title)}</h3><p>These screens only show. Claude does the work.</p></div><button class="x" data-close>&times;</button></div>
      <div class="pb"><div class="hint">Open this folder in Claude Code and ask in plain English. It reads the same database these screens draw from, runs the right command, and drafts anything that goes to a person.<br><br><code>claude</code> &nbsp;then type, or paste one of these.</div>
      <h4>Try asking</h4>${promptsHtml(page.ask || [])}
      <h4>Change the system itself</h4>${promptsHtml(C.customise || [])}</div>`);
  }
  function openClient(name) {
    const x = C.clientDetail(name, D, F);
    if (!x) return;
    open(`<div class="ph"><div class="avatar" style="width:42px;height:42px;background:hsl(${hue(name)} 55% 52%)">${esc(initials(name))}</div>
      <div><h3>${esc(name)}</h3><p>${esc(x.sub || '')}</p></div><button class="x" data-close>&times;</button></div>
      <div class="pb"><div class="facts">${(x.facts || []).map(([k, v]) => `<div class="fact"><span>${esc(k)}</span><b class="num">${esc(v || '-')}</b></div>`).join('')}</div>
      ${(x.sections || []).map((s) => `<h4>${esc(s.title)}</h4><div class="rows">${s.rows.length ? s.rows.map((r) => `<div class="row"><div style="min-width:0"><div class="who">${r.tone ? `<span class="dot ${r.tone}" style="margin-right:7px"></span>` : ''}${esc(r.title)}</div><div class="what">${esc(r.sub || '')}</div></div><div class="rt"><b class="num">${esc(r.right || '')}</b><span>${esc(r.rightSub || '')}</span></div></div>`).join('') : '<div class="empty">None.</div>'}</div>`).join('')}
      <h4>Ask Claude</h4>${promptsHtml((x.ask || []))}</div>`);
  }
  function toast(t) {
    const el = $('.toast');
    el.textContent = t;
    el.classList.add('on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('on'), 1600);
  }

  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t.closest('[data-ask]')) return openAsk();
    if (t.closest('[data-close]') || t.classList.contains('scrim')) return close();
    const cp = t.closest('[data-copy]');
    if (cp) {
      const text = cp.getAttribute('data-copy');
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).catch(() => {});
      cp.classList.add('done');
      cp.querySelector('.copy').textContent = 'Copied';
      return toast('Copied. Paste it into Claude Code.');
    }
    const cl = t.closest('[data-client]');
    if (cl && !t.closest('.panel')) return openClient(cl.getAttribute('data-client'));
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('input', (e) => {
    const id = e.target.getAttribute('data-filter');
    if (!id) return;
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll(`#${id} tbody tr`).forEach((tr) => { tr.style.display = !q || (tr.dataset.search || '').includes(q) ? '' : 'none'; });
  });
  window.addEventListener('hashchange', render);
  render();
  const q = new URLSearchParams(location.search);
  if (q.get('client')) openClient(q.get('client'));
  if (q.get('ask')) openAsk();
})();
