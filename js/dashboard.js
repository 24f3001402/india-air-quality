(() => {
  'use strict';

  const SVG = 'http://www.w3.org/2000/svg';

  // Simplified CPCB breakpoints for PM2.5. Order matters: first match wins.
  const BANDS = [
    { name: 'Good', max: 30, css: '--band-good' },
    { name: 'Moderate', max: 60, css: '--band-moderate' },
    { name: 'Poor', max: 120, css: '--band-poor' },
    { name: 'Severe', max: Infinity, css: '--band-severe' }
  ];

  const WHO_DAILY = 15; // WHO 2021 24-hour guideline, ug/m3

  const bandFor = v => BANDS.find(b => v <= b.max);
  const paint = css => getComputedStyle(document.documentElement).getPropertyValue(css).trim();

  const el = (tag, attrs = {}) => {
    const n = document.createElementNS(SVG, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  };

  const fmtDay = iso => {
    const [y, m, d] = iso.split('-');
    return new Date(Date.UTC(+y, +m - 1, +d))
      .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  };

  let latest = null;
  let history = null;
  let days = 90;

  // ---------------------------------------------------------------- tooltip

  const tip = document.createElement('div');
  tip.id = 'tip';
  document.body.appendChild(tip);

  function showTip(x, y, rows) {
    tip.textContent = '';
    for (const r of rows) {
      const div = document.createElement('div');
      div.className = r.strong ? 't-val' : 't-row';
      if (r.color) {
        const key = document.createElement('span');
        key.className = 'key';
        key.style.background = r.color;
        div.appendChild(key);
      }
      // labels come from the API, so never interpolate them into markup
      div.appendChild(document.createTextNode(r.text));
      tip.appendChild(div);
    }
    tip.classList.add('on');
    const box = tip.getBoundingClientRect();
    const left = Math.min(x + 14, innerWidth - box.width - 10);
    const top = Math.max(8, y - box.height - 12);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  const hideTip = () => tip.classList.remove('on');

  // ---------------------------------------------------------------- headline

  function renderLede() {
    const cities = latest.cities.filter(c => c.pm2_5 != null);
    const sorted = [...cities].sort((a, b) => b.pm2_5 - a.pm2_5);
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];
    const mean = cities.reduce((t, c) => t + c.pm2_5, 0) / cities.length;
    const over = cities.filter(c => c.pm2_5 > WHO_DAILY).length;

    document.getElementById('hero-num').textContent = worst.pm2_5.toFixed(1);
    document.getElementById('hero-city').textContent = worst.city;
    document.getElementById('hero-band').textContent = bandFor(worst.pm2_5).name;

    const tiles = [
      { label: 'City average', value: mean.toFixed(1), unit: ' µg/m³', meta: `across ${cities.length} cities` },
      { label: 'Cleanest air', value: best.pm2_5.toFixed(1), unit: ' µg/m³', meta: best.city },
      { label: 'Above WHO guideline', value: String(over), unit: ` of ${cities.length}`, meta: `daily limit ${WHO_DAILY} µg/m³` }
    ];

    const wrap = document.getElementById('tiles');
    wrap.textContent = '';
    for (const t of tiles) {
      const card = document.createElement('div');
      card.className = 'tile';

      const label = document.createElement('p');
      label.className = 'label';
      label.textContent = t.label;

      const value = document.createElement('p');
      value.className = 'value';
      value.appendChild(document.createTextNode(t.value));
      const unit = document.createElement('span');
      unit.className = 'unit';
      unit.textContent = t.unit;
      value.appendChild(unit);

      const meta = document.createElement('p');
      meta.className = 'meta';
      meta.textContent = t.meta;

      card.append(label, value, meta);
      wrap.appendChild(card);
    }
  }

  // ---------------------------------------------------------------- bar chart

  function renderBars() {
    const host = document.getElementById('bars');
    host.textContent = '';

    const rows = latest.cities
      .filter(c => c.pm2_5 != null)
      .sort((a, b) => b.pm2_5 - a.pm2_5);

    const padL = 96, padR = 128, padT = 8, rowH = 32;
    const width = Math.max(560, host.clientWidth || 560);
    const plotW = width - padL - padR;
    const height = padT + rows.length * rowH + 34;
    const max = Math.max(60, Math.ceil(Math.max(...rows.map(r => r.pm2_5)) / 20) * 20);
    const x = v => (v / max) * plotW;

    const svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' });
    svg.setAttribute('aria-label', 'Current PM2.5 by city');

    // gridlines behind the marks, solid hairlines
    for (let t = 0; t <= max; t += 20) {
      svg.appendChild(el('line', {
        x1: padL + x(t), x2: padL + x(t), y1: padT, y2: padT + rows.length * rowH,
        class: 'gridline'
      }));
      const tick = el('text', {
        x: padL + x(t), y: padT + rows.length * rowH + 17,
        class: 'tick', 'text-anchor': 'middle'
      });
      tick.textContent = t;
      svg.appendChild(tick);
    }

    svg.appendChild(el('line', {
      x1: padL, x2: padL, y1: padT, y2: padT + rows.length * rowH, class: 'axisline'
    }));

    rows.forEach((r, i) => {
      const band = bandFor(r.pm2_5);
      const color = paint(band.css);
      // 2px surface gap between neighbours, cap the bar well under the row
      const barH = 18;
      const y = padT + i * rowH + (rowH - barH) / 2;
      const w = Math.max(2, x(r.pm2_5));

      const name = el('text', { x: padL - 12, y: y + barH / 2 + 4, class: 'cat', 'text-anchor': 'end' });
      name.textContent = r.city;
      svg.appendChild(name);

      const bar = el('rect', {
        x: padL, y, width: w, height: barH, fill: color,
        rx: 4, ry: 4
      });
      svg.appendChild(bar);
      // square off the baseline end so the bar grows from the axis
      svg.appendChild(el('rect', { x: padL, y, width: Math.min(4, w), height: barH, fill: color }));

      const val = el('text', { x: padL + w + 10, y: y + barH / 2 + 4, class: 'val' });
      val.textContent = r.pm2_5.toFixed(1);
      svg.appendChild(val);

      const tag = el('text', { x: padL + w + 10 + 42, y: y + barH / 2 + 4, class: 'band-tag' });
      tag.textContent = band.name;
      svg.appendChild(tag);

      // hit area spans the whole row, comfortably larger than the mark
      const hit = el('rect', {
        x: padL, y: padT + i * rowH, width: plotW, height: rowH,
        fill: 'transparent', tabindex: '0', role: 'button'
      });
      hit.setAttribute('aria-label', `${r.city}: ${r.pm2_5} micrograms per cubic metre, ${band.name}`);

      const show = ev => {
        const box = (ev.currentTarget || hit).getBoundingClientRect();
        const px = ev.clientX != null ? ev.clientX : box.left + 40;
        const py = ev.clientY != null ? ev.clientY : box.top;
        showTip(px, py, [
          { text: `${r.pm2_5.toFixed(1)} µg/m³`, strong: true },
          { text: `${r.city} · ${band.name}`, color }
        ]);
      };
      hit.addEventListener('pointermove', show);
      hit.addEventListener('focus', show);
      hit.addEventListener('pointerleave', hideTip);
      hit.addEventListener('blur', hideTip);
      svg.appendChild(hit);
    });

    host.appendChild(svg);
    renderBandLegend();
  }

  function renderBandLegend() {
    const list = document.getElementById('band-legend');
    list.textContent = '';
    const cuts = ['≤ 30', '30–60', '60–120', '> 120'];
    BANDS.forEach((b, i) => {
      const li = document.createElement('li');
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = paint(b.css);
      li.appendChild(sw);
      li.appendChild(document.createTextNode(`${b.name} (${cuts[i]})`));
      list.appendChild(li);
    });
  }

  // ---------------------------------------------------------------- trends

  function renderTrends() {
    const host = document.getElementById('trends');
    host.textContent = '';

    const names = Object.keys(history.cities).sort();
    const series = names.map(name => {
      const entries = Object.entries(history.cities[name]).sort((a, b) => a[0] < b[0] ? -1 : 1);
      return { name, points: entries.slice(-days) };
    }).filter(s => s.points.length > 1);

    // one shared scale so the panels compare directly
    const max = Math.max(...series.flatMap(s => s.points.map(p => p[1])));
    const top = Math.max(20, Math.ceil(max / 10) * 10);
    const color = paint('--series-1');

    for (const s of series) {
      const w = 236, h = 100, padT = 16, padB = 18, padR = 10, padL = 4;
      const plotH = h - padT - padB;
      const plotW = w - padL - padR;
      const n = s.points.length;
      const x = i => padL + (i / (n - 1)) * plotW;
      const y = v => padT + plotH - (v / top) * plotH;

      const facet = document.createElement('div');
      facet.className = 'facet';

      const title = document.createElement('h3');
      title.textContent = s.name;
      const now = document.createElement('span');
      now.className = 'now';
      const lastVal = s.points[n - 1][1];
      now.textContent = `${lastVal.toFixed(1)} µg/m³ latest`;
      title.appendChild(document.createTextNode(' '));
      facet.append(title, now);

      const svg = el('svg', { width: '100%', height: h, viewBox: `0 0 ${w} ${h}`, role: 'img' });
      svg.setAttribute('aria-label', `${s.name} daily PM2.5 over the last ${n} days`);

      svg.appendChild(el('line', { x1: padL, x2: w - padR, y1: y(0), y2: y(0), class: 'axisline' }));
      svg.appendChild(el('line', { x1: padL, x2: w - padR, y1: y(top), y2: y(top), class: 'gridline' }));

      const tick = el('text', { x: padL + 2, y: y(top) + 12, class: 'tick' });
      tick.textContent = top;
      svg.appendChild(tick);

      const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
      svg.appendChild(el('path', {
        d, fill: 'none', stroke: color, 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));

      // endpoint marker with a surface ring so it stays legible over the line
      svg.appendChild(el('circle', {
        cx: x(n - 1), cy: y(lastVal), r: 4.5,
        fill: color, stroke: 'var(--surface-1)', 'stroke-width': 2
      }));

      const crosshair = el('line', {
        y1: padT, y2: padT + plotH, class: 'gridline', opacity: 0
      });
      svg.appendChild(crosshair);

      const hit = el('rect', {
        x: padL, y: padT, width: plotW, height: plotH,
        fill: 'transparent', tabindex: '0'
      });

      const move = ev => {
        const box = svg.getBoundingClientRect();
        const rel = ((ev.clientX - box.left) / box.width) * w;
        let i = Math.round(((rel - padL) / plotW) * (n - 1));
        i = Math.max(0, Math.min(n - 1, i));
        const [day, value] = s.points[i];
        crosshair.setAttribute('x1', x(i));
        crosshair.setAttribute('x2', x(i));
        crosshair.setAttribute('opacity', 1);
        showTip(ev.clientX, ev.clientY, [
          { text: `${value.toFixed(1)} µg/m³`, strong: true },
          { text: `${s.name} · ${fmtDay(day)}`, color }
        ]);
      };

      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerleave', () => {
        crosshair.setAttribute('opacity', 0);
        hideTip();
      });
      hit.addEventListener('focus', () => {
        const [day, value] = s.points[n - 1];
        const box = svg.getBoundingClientRect();
        showTip(box.left + box.width / 2, box.top + 20, [
          { text: `${value.toFixed(1)} µg/m³`, strong: true },
          { text: `${s.name} · ${fmtDay(day)}`, color }
        ]);
      });
      hit.addEventListener('blur', hideTip);

      svg.appendChild(hit);
      facet.appendChild(svg);
      host.appendChild(facet);
    }
  }

  // ---------------------------------------------------------------- table

  function renderTable() {
    const table = document.getElementById('table');
    table.textContent = '';

    const names = Object.keys(history.cities).sort();
    const allDays = [...new Set(names.flatMap(n => Object.keys(history.cities[n])))]
      .sort().slice(-days).reverse();

    const head = document.createElement('tr');
    for (const label of ['Date', ...names]) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      head.appendChild(th);
    }
    const thead = document.createElement('thead');
    thead.appendChild(head);
    table.appendChild(thead);

    const body = document.createElement('tbody');
    for (const day of allDays) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = fmtDay(day);
      tr.appendChild(th);
      for (const name of names) {
        const td = document.createElement('td');
        const v = history.cities[name][day];
        td.textContent = v == null ? '—' : v.toFixed(1);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    table.appendChild(body);
  }

  // ---------------------------------------------------------------- wiring

  function renderAll() {
    renderLede();
    renderBars();
    renderTrends();
    renderTable();
  }

  document.getElementById('range').addEventListener('click', ev => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    days = Number(btn.dataset.days);
    for (const b of ev.currentTarget.querySelectorAll('button')) {
      const on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
    renderTrends();
    renderTable();
  });

  const tableToggle = document.getElementById('table-toggle');
  tableToggle.addEventListener('click', () => {
    const card = document.getElementById('table-card');
    const open = card.hasAttribute('hidden');
    card.toggleAttribute('hidden', !open);
    tableToggle.setAttribute('aria-expanded', String(open));
  });

  document.getElementById('theme').addEventListener('click', () => {
    const root = document.documentElement;
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const current = root.dataset.theme || (dark ? 'dark' : 'light');
    root.dataset.theme = current === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('aq.theme', root.dataset.theme); } catch (e) { /* private mode */ }
    renderAll();
  });

  try {
    const saved = localStorage.getItem('aq.theme');
    if (saved) document.documentElement.dataset.theme = saved;
  } catch (e) { /* private mode */ }

  let resizeTimer = null;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderBars, 150);
  });

  Promise.all([
    fetch('data/latest.json').then(r => r.json()),
    fetch('data/history.json').then(r => r.json())
  ]).then(([l, h]) => {
    latest = l;
    history = h;
    const stamp = new Date(l.updated);
    document.getElementById('updated').textContent =
      stamp.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    document.getElementById('updated').setAttribute('datetime', l.updated);
    renderAll();
  }).catch(err => {
    document.getElementById('app').textContent = 'Could not load the readings: ' + err.message;
  });
})();
