/*
 * Nested Power Flow Card
 * Energiefluss-Karte für Home Assistant mit verschachtelbaren Gruppen
 * (z. B. Haus -> Stall -> Melkmaschine / Lüftung / Licht).
 *
 * Eine Datei, keine Abhängigkeiten, kein Build-Schritt.
 */
(() => {
  'use strict';

  const VERSION = '1.0.0';
  const CARD = 'nested-power-flow-card';
  const EDITOR = `${CARD}-editor`;

  const UNIT = { W: 1, kW: 1e3, MW: 1e6, GW: 1e9, mW: 1e-3 };
  const PALETTE = ['#d0cc5b', '#964cb5', '#5bb8d0', '#e07b53', '#6fbf73', '#d05b8e', '#7986cb', '#c0a16b'];
  const COLOR = {
    grid: 'var(--energy-grid-consumption-color, #488fc2)',
    ret: 'var(--energy-grid-return-color, #8353d1)',
    solar: 'var(--energy-solar-color, #ff9800)',
    battOut: 'var(--energy-battery-out-color, #4db6ac)',
    battIn: 'var(--energy-battery-in-color, #f06292)',
  };
  const DASH = { src: 30, dev: 46 }; // Abstand der Fluss-Punkte in px

  const I18N = {
    de: {
      grid: 'Netz', solar: 'Solar', battery: 'Batterie', home: 'Haus', other: 'Sonstige', device: 'Gerät',
      empty: 'Noch nichts konfiguriert. Öffne den Editor und wähle deine Sensoren aus.',
      general: 'Allgemein', devices: 'Geräte & Gruppen',
      devicesHint: 'Jedes Gerät kann Untergeräte haben und wird damit zur Gruppe. In der Karte klappt ein Klick auf die Gruppe ihre Untergeräte auf.',
      addTop: 'Gerät / Gruppe hinzufügen', addChild: 'Untergerät hinzufügen', remove: 'Entfernen',
      up: 'Nach oben', down: 'Nach unten', color: 'Farbe', children: 'Untergeräte', newDevice: 'Neues Gerät',
      noForm: 'Der visuelle Editor konnte nicht geladen werden. Bitte den YAML-Editor verwenden.',
      f: {
        title: 'Titel', entity: 'Leistungs-Sensor', name: 'Name', icon: 'Symbol', invert: 'Vorzeichen umkehren',
        import_entity: 'Netzbezug (getrennter Sensor)', export_entity: 'Einspeisung (getrennter Sensor)',
        charge_entity: 'Laden (getrennter Sensor)', discharge_entity: 'Entladen (getrennter Sensor)',
        soc_entity: 'Ladezustand (%)', override_state: 'Wert des Sensors statt berechnetem Wert anzeigen',
        secondary_entity: 'Zusatzinfo (zweiter Sensor)', display_zero: 'Auch bei 0 W anzeigen',
        expanded: 'Beim Laden aufgeklappt', kilo_threshold: 'Ab wie viel Watt in kW anzeigen',
        show_other: '„Sonstige“ in Gruppen anzeigen', sort: 'Nach Leistung sortieren',
        max_expected_power: 'Leistung für maximale Punkt-Geschwindigkeit (W)',
      },
      h: {
        grid_entity: 'Positiv = Bezug, negativ = Einspeisung', battery_entity: 'Positiv = Entladen, negativ = Laden',
        device_entity: 'Leer lassen, dann wird die Summe der Untergeräte angezeigt',
      },
    },
    en: {
      grid: 'Grid', solar: 'Solar', battery: 'Battery', home: 'Home', other: 'Other', device: 'Device',
      empty: 'Nothing configured yet. Open the editor and pick your sensors.',
      general: 'General', devices: 'Devices & groups',
      devicesHint: 'Every device can have sub-devices, which turns it into a group. In the card, a click on the group unfolds its sub-devices.',
      addTop: 'Add device / group', addChild: 'Add sub-device', remove: 'Remove',
      up: 'Move up', down: 'Move down', color: 'Color', children: 'sub-devices', newDevice: 'New device',
      noForm: 'The visual editor could not be loaded. Please use the YAML editor.',
      f: {
        title: 'Title', entity: 'Power sensor', name: 'Name', icon: 'Icon', invert: 'Invert sign',
        import_entity: 'Grid import (separate sensor)', export_entity: 'Grid export (separate sensor)',
        charge_entity: 'Charging (separate sensor)', discharge_entity: 'Discharging (separate sensor)',
        soc_entity: 'State of charge (%)', override_state: 'Show sensor value instead of calculated value',
        secondary_entity: 'Secondary info (second sensor)', display_zero: 'Show at 0 W',
        expanded: 'Expanded on load', kilo_threshold: 'Show kW from this many watts',
        show_other: 'Show "Other" inside groups', sort: 'Sort by power',
        max_expected_power: 'Power for maximum dot speed (W)',
      },
      h: {
        grid_entity: 'Positive = import, negative = export', battery_entity: 'Positive = discharging, negative = charging',
        device_entity: 'Leave empty to show the sum of the sub-devices',
      },
    },
  };
  const tr = (hass) => {
    const lang = ((hass && (hass.locale && hass.locale.language || hass.language)) || 'en').toLowerCase();
    return lang.startsWith('de') ? I18N.de : I18N.en;
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const r1 = (n) => Math.round(n * 10) / 10;

  function stateW(hass, id) {
    if (!id || !hass) return null;
    const st = hass.states[id];
    if (!st) return null;
    const v = parseFloat(st.state);
    if (!isFinite(v)) return null;
    const u = st.attributes && st.attributes.unit_of_measurement;
    return v * (UNIT[u] || 1);
  }

  /** Orthogonaler Pfad mit abgerundeten Ecken. */
  function rpath(points, radius) {
    const p = [];
    for (const q of points) {
      const l = p[p.length - 1];
      if (!l || Math.abs(l[0] - q[0]) > 0.5 || Math.abs(l[1] - q[1]) > 0.5) p.push(q);
    }
    if (p.length < 2) return '';
    const s = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      const a = s[s.length - 1], b = p[i], c = p[i + 1];
      const collinear =
        (Math.abs(a[0] - b[0]) < 0.5 && Math.abs(b[0] - c[0]) < 0.5) ||
        (Math.abs(a[1] - b[1]) < 0.5 && Math.abs(b[1] - c[1]) < 0.5);
      if (!collinear) s.push(b);
    }
    s.push(p[p.length - 1]);
    let d = `M${r1(s[0][0])},${r1(s[0][1])}`;
    for (let i = 1; i < s.length - 1; i++) {
      const a = s[i - 1], b = s[i], c = s[i + 1];
      const l1 = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
      const rr = Math.min(radius, l1 / 2, l2 / 2);
      const p1 = [b[0] + ((a[0] - b[0]) * rr) / l1, b[1] + ((a[1] - b[1]) * rr) / l1];
      const p2 = [b[0] + ((c[0] - b[0]) * rr) / l2, b[1] + ((c[1] - b[1]) * rr) / l2];
      d += ` L${r1(p1[0])},${r1(p1[1])} Q${r1(b[0])},${r1(b[1])} ${r1(p2[0])},${r1(p2[1])}`;
    }
    const e = s[s.length - 1];
    return `${d} L${r1(e[0])},${r1(e[1])}`;
  }

  const STYLE = `
    :host { display: block; }
    ha-card { overflow: hidden; }
    .wrap {
      position: relative; margin: 8px 8px 14px; transition: height .25s ease;
      --bg: var(--ha-card-background, var(--card-background-color, #fff));
      --line: color-mix(in srgb, var(--primary-text-color, #888) 24%, transparent);
    }
    .empty { padding: 24px 16px; text-align: center; color: var(--secondary-text-color); }
    svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
    path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .base { stroke: var(--line); stroke-width: 1.5; }
    .base.src { stroke: var(--c); opacity: .5; }
    .dots {
      --dash: ${DASH.src}px;
      stroke: var(--c); stroke-width: 5; stroke-dasharray: 0.01 var(--dash); opacity: 0;
      animation: npf-flow var(--t, 1s) linear infinite; animation-play-state: paused;
      transition: opacity .3s;
    }
    .dots.on { opacity: 1; animation-play-state: running; }
    .dots.dev { --dash: ${DASH.dev}px; stroke-width: 4.5; }
    .dots.rev { animation-direction: reverse; }
    @keyframes npf-flow { from { stroke-dashoffset: calc(var(--dash) + 0.01px); } to { stroke-dashoffset: 0; } }
    @keyframes npf-pop { from { opacity: 0; transform: translateY(-8px) scale(.92); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .dots { animation: none; } .node.new { animation: none; } }

    .node {
      position: absolute; display: flex; flex-direction: column; align-items: center;
      --c: var(--primary-color); pointer-events: none;
    }
    .node.new { animation: npf-pop .28s ease both; }
    .circle {
      position: relative; width: var(--d); height: var(--d); border-radius: 50%; flex: none;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: color-mix(in srgb, var(--c) 9%, var(--bg));
      border: none; padding: 0; margin: 0; font: inherit; color: var(--primary-text-color);
      cursor: pointer; pointer-events: auto; -webkit-tap-highlight-color: transparent;
      transition: transform .15s ease, box-shadow .2s ease; user-select: none; -webkit-user-select: none;
      touch-action: manipulation;
    }
    .circle:hover { transform: scale(1.04); }
    .circle:focus-visible { outline: 2px solid var(--c); outline-offset: 3px; }
    .node.static .circle { cursor: default; }
    .node.static .circle:hover { transform: none; }
    .ring {
      position: absolute; inset: 0; border-radius: 50%; background: var(--ring, var(--c));
      -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px));
      mask: radial-gradient(farthest-side, transparent calc(100% - 3.5px), #000 calc(100% - 3px));
      transition: opacity .3s;
    }
    .node.idle .ring { opacity: .4; }
    .node.idle ha-icon { opacity: .6; }
    .node.open .circle { box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 24%, transparent); }
    ha-icon { --mdc-icon-size: calc(var(--d) * .3); display: flex; }
    .val { font-size: 13px; font-weight: 500; line-height: 1.25; white-space: nowrap; }
    .top, .sec { font-size: 11px; line-height: 1.15; color: var(--secondary-text-color); white-space: nowrap; }
    .top:empty, .sec:empty { display: none; }
    .small .val { font-size: 11px; }
    .small .top, .small .sec { font-size: 10px; }
    .badge[hidden] { display: none; }
    .label {
      margin-top: 4px; height: 18px; line-height: 18px; font-size: 12px; max-width: 100%;
      color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .badge {
      position: absolute; top: -3px; left: calc(50% + var(--d) * .22); min-width: 12px; height: 18px;
      padding: 0 5px; border-radius: 10px; box-sizing: content-box;
      display: flex; align-items: center; justify-content: center; gap: 2px;
      font-size: 10px; font-weight: 600; line-height: 1;
      background: var(--bg); color: var(--primary-text-color); border: 1.5px solid var(--c);
      transition: background .2s, color .2s;
    }
    .badge i { font-style: normal; font-size: 8px; transition: transform .2s; }
    .node.open .badge { background: var(--c); color: var(--bg); }
    .node.open .badge i { transform: rotate(180deg); }
  `;

  class NestedPowerFlowCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._expanded = new Set();
      this._els = new Map();
      this._edges = new Map();
      this._width = 0;
      this._sig = null;
      this._nf = {};
    }

    static getConfigElement() { return document.createElement(EDITOR); }

    static getStubConfig(hass) {
      const power = Object.keys((hass && hass.states) || {}).filter(
        (id) => id.startsWith('sensor.') && hass.states[id].attributes.device_class === 'power');
      const pick = (re) => power.find((id) => re.test(id));
      const cfg = { type: `custom:${CARD}` };
      const grid = pick(/grid|netz|meter/i), solar = pick(/solar|pv|inverter/i), batt = pick(/batt/i);
      if (grid) cfg.grid = { entity: grid };
      if (solar) cfg.solar = { entity: solar };
      if (batt) cfg.battery = { entity: batt };
      const rest = power.filter((id) => ![grid, solar, batt].includes(id)).slice(0, 3);
      if (rest.length) cfg.devices = rest.map((entity) => ({ entity }));
      return cfg;
    }

    setConfig(config) {
      if (!config || typeof config !== 'object') throw new Error('Invalid configuration');
      if (config.devices && !Array.isArray(config.devices)) throw new Error('"devices" must be a list');
      this._config = config;
      this._ids = this._collectIds(config);
      // Start-Zustand: Gruppen mit "expanded: true" (pro Ebene nur die erste)
      this._expanded = new Set();
      const walk = (list, path) => {
        const i = (list || []).findIndex((n) => n && n.expanded && (n.children || []).length);
        if (i >= 0) { this._expanded.add(path + i); walk(list[i].children, `${path}${i}.`); }
      };
      walk(config.devices, '');
      if (!this._root) this._build();
      this._card.header = config.title || undefined;
      this._sig = null;
      this._update();
    }

    set hass(hass) {
      const old = this._hass;
      this._hass = hass;
      if (!this._config) return;
      if (old && old.locale === hass.locale && !this._ids.some((id) => old.states[id] !== hass.states[id])) return;
      this._update();
    }

    getCardSize() { return 5 + ((this._config && this._config.devices) ? 2 : 0); }
    getGridOptions() { return { columns: 12, min_columns: 6, rows: 'auto' }; }

    connectedCallback() {
      if (!this._ro && this._wrap) this._observe();
      this._measure();
    }
    disconnectedCallback() {
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
    }

    _collectIds(c) {
      const ids = new Set();
      const add = (v) => { if (typeof v === 'string' && v) ids.add(v); };
      for (const k of ['grid', 'solar', 'battery', 'home']) {
        const o = c[k] || {};
        ['entity', 'import_entity', 'export_entity', 'charge_entity', 'discharge_entity', 'soc_entity', 'secondary_entity']
          .forEach((f) => add(o[f]));
      }
      const walk = (list) => (list || []).forEach((n) => {
        if (!n) return;
        add(n.entity); add(n.secondary_entity); walk(n.children);
      });
      walk(c.devices);
      return [...ids];
    }

    _build() {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card><div class="wrap"></div></ha-card>`;
      this._root = this.shadowRoot;
      this._card = this._root.querySelector('ha-card');
      this._wrap = this._root.querySelector('.wrap');
      if (this.isConnected) this._observe();
    }

    _observe() {
      if (typeof ResizeObserver === 'undefined') return;
      this._ro = new ResizeObserver(() => this._measure());
      this._ro.observe(this._wrap);
    }

    _measure() {
      if (!this._wrap) return;
      const w = Math.floor(this._wrap.clientWidth);
      if (w && w !== this._width) { this._width = w; this._update(); }
    }

    /* ---------- Daten ---------- */

    _model() {
      const c = this._config, hass = this._hass, t = tr(hass);
      const tol = Number(c.zero_tolerance) || 0;
      const z = (v) => (v == null || Math.abs(v) <= tol ? 0 : v);
      const w = (id) => stateW(hass, id);
      const g = c.grid || {}, s = c.solar || {}, b = c.battery || {}, hm = c.home || {};
      const hasGrid = !!(g.entity || g.import_entity || g.export_entity);
      const hasSolar = !!s.entity;
      const hasBatt = !!(b.entity || b.charge_entity || b.discharge_entity);

      let gi = 0, ge = 0;
      if (g.import_entity || g.export_entity) {
        gi = Math.abs(z(w(g.import_entity))); ge = Math.abs(z(w(g.export_entity)));
        if (g.invert) [gi, ge] = [ge, gi];
      } else if (g.entity) {
        let v = z(w(g.entity)); if (g.invert) v = -v;
        gi = Math.max(v, 0); ge = Math.max(-v, 0);
      }
      let sv = z(w(s.entity)); if (s.invert) sv = -sv; sv = Math.max(sv, 0);
      let bd = 0, bc = 0;
      if (b.charge_entity || b.discharge_entity) {
        bc = Math.abs(z(w(b.charge_entity))); bd = Math.abs(z(w(b.discharge_entity)));
        if (b.invert) [bc, bd] = [bd, bc];
      } else if (b.entity) {
        let v = z(w(b.entity)); if (b.invert) v = -v;
        bd = Math.max(v, 0); bc = Math.max(-v, 0);
      }

      const s2b = Math.min(sv, bc);
      const g2b = Math.min(bc - s2b, gi);
      const s2g = Math.min(sv - s2b, ge);
      const b2g = Math.min(ge - s2g, bd);
      const s2h = Math.max(sv - s2b - s2g, 0);
      const g2h = Math.max(gi - g2b, 0);
      const b2h = Math.max(bd - b2g, 0);
      let home = s2h + g2h + b2h;
      const hv = w(hm.entity);
      const anySource = hasGrid || hasSolar || hasBatt;
      if (hm.entity && hv != null && (hm.override_state || !anySource)) home = hv;

      const sources = [];
      if (hasGrid) sources.push('grid');
      if (hasSolar) sources.push('solar');
      if (hasBatt) sources.push('battery');

      const build = (list, path, inherit, depth) => (list || []).filter(Boolean).map((n, i) => {
        const id = path + i;
        const color = n.color || (depth === 0 ? PALETTE[i % PALETTE.length] : inherit);
        const kids = build(n.children, `${id}.`, color, depth + 1);
        const st = n.entity ? hass.states[n.entity] : null;
        let value = null;
        if (n.entity) {
          value = w(n.entity);
          if (value != null) { if (n.invert) value = -value; value = z(value); }
        } else if (kids.length) {
          value = kids.reduce((a, k) => a + (k.value || 0), 0);
        }
        if (n.entity && kids.length && c.show_other !== false && value != null) {
          const rest = value - kids.reduce((a, k) => a + (k.value || 0), 0);
          kids.push({
            id: `${id}.o`, other: true, cfg: {}, name: t.other, icon: 'mdi:dots-horizontal',
            color, value: Math.max(rest, 0), children: [], hidden: rest < 1,
          });
        }
        const hidden = n.display_zero === false && !(Math.abs(value || 0) > 0);
        return {
          id, cfg: n, color, value, hidden, children: kids,
          name: n.name || (st && st.attributes.friendly_name) || t.device,
          icon: n.icon || (st && st.attributes.icon) || (kids.length ? 'mdi:view-grid-outline' : 'mdi:flash'),
        };
      });
      const vis = (list) => {
        let out = list.filter((n) => !n.hidden);
        if (c.sort) out = out.slice().sort((a, b2) => Math.abs(b2.value || 0) - Math.abs(a.value || 0));
        return out;
      };
      const tree = build(c.devices, '', null, 0);
      const levels = [];
      let cur = vis(tree), parent = { key: 'home', value: home };
      while (cur.length) {
        levels.push({ nodes: cur, parent });
        const ex = cur.find((n) => this._expanded.has(n.id) && vis(n.children).length);
        if (!ex) break;
        parent = { key: ex.id, value: ex.value };
        cur = vis(ex.children);
      }

      return {
        sources, levels, home, gi, ge, sv, bd, bc, hasAnything: anySource || !!hm.entity || tree.length > 0,
        flows: {
          'solar>home': s2h, 'grid>home': g2h, 'battery>home': b2h,
          'solar>grid': s2g, 'solar>battery': s2b, 'grid>battery': g2b, 'battery>grid': b2g,
        },
      };
    }

    /* ---------- Layout ---------- */

    _layout(m, W) {
      const nodes = [], edges = [];
      const PAD = 6, LAB = 22;
      const Ds = clamp(Math.round(W / 4.8), 60, 88);
      const cx = W / 2;
      const src = m.sources;
      const xs = (src.length === 3 ? [0.17, 0.5, 0.83] : src.length === 2 ? [0.26, 0.74] : [0.5]).map((f) => f * W);
      const needArc = src.length === 3;
      let y = PAD + (needArc ? 30 : 0);
      const sy = y;
      const srcLabelW = src.length ? Math.max(Ds, W / src.length - 8) : W;

      src.forEach((k, i) => nodes.push({ key: k, kind: 'src', x: xs[i], y: sy, d: Ds, lw: srcLabelW }));
      if (src.length) y = sy + Ds + LAB + 40;
      const hy = y;
      nodes.push({ key: 'home', kind: 'home', x: cx, y: hy, d: Ds, lw: Math.min(W, 160) });

      src.forEach((k, i) => {
        const x = xs[i], py = sy + Ds + LAB;
        const pts = Math.abs(x - cx) < 1
          ? [[x, py], [x, hy]]
          : [[x, py], [x, hy + Ds / 2], [x < cx ? cx - Ds / 2 : cx + Ds / 2, hy + Ds / 2]];
        edges.push({ key: `${k}>home`, a: k, b: 'home', d: rpath(pts, 26), kind: 'src' });
      });
      for (let i = 0; i < src.length; i++) {
        for (let j = i + 1; j < src.length; j++) {
          const pts = j === i + 1
            ? [[xs[i] + Ds / 2, sy + Ds / 2], [xs[j] - Ds / 2, sy + Ds / 2]]
            : [[xs[i], sy], [xs[i], sy - 22], [xs[j], sy - 22], [xs[j], sy]];
          edges.push({ key: `${src[i]}-${src[j]}`, a: src[i], b: src[j], d: rpath(pts, 18), kind: 'src' });
        }
      }

      // Geräte-Ebenen: pro Ebene ein Raster, Verbindungen über "Busse" und Gassen
      let P = { x: cx, y: hy + Ds + LAB, exit: false };
      let bottom = hy + Ds + LAB;
      const inner = W - 2 * PAD;
      m.levels.forEach((L, li) => {
        const D = Math.max(52, clamp(Ds - 10, 54, 76) - li * 5);
        const n = L.nodes.length;
        const maxCols = Math.max(1, Math.floor(inner / (D + 20)));
        const rows = Math.ceil(n / maxCols);
        const cols = Math.ceil(n / rows);
        const colW = Math.min(inner / cols, 128);
        const gx0 = cx - (cols * colW) / 2;
        const next = m.levels[li + 1];
        const exIndex = next ? L.nodes.findIndex((nd) => nd.id === next.parent.key) : -1;
        const exRow = exIndex >= 0 ? Math.floor(exIndex / cols) : -1;

        const rowY = [], busY = [], laneY = [];
        let yy = bottom + 4;
        for (let r = 0; r < rows; r++) {
          if (r === 0) { busY[r] = yy + 16; rowY[r] = yy + 32; }
          else { laneY[r] = yy + 10; busY[r] = yy + 24; rowY[r] = yy + 40; }
          yy = rowY[r] + D + LAB;
        }
        const lastCount = n - cols * (rows - 1);
        // letzte Zeile zentrieren; im Raster bleiben, falls eine Leitung durch sie nach unten läuft
        const lastOff = exRow >= 0 && exRow < rows - 1 ? Math.floor((cols - lastCount) / 2) : (cols - lastCount) / 2;

        let nextP = null;
        L.nodes.forEach((nd, i) => {
          const r = Math.floor(i / cols), ci = i % cols;
          const off = r === rows - 1 ? lastOff : 0;
          const x = gx0 + (off + ci + 0.5) * colW;
          nodes.push({ key: nd.id, kind: 'dev', node: nd, x, y: rowY[r], d: D, lw: colW - 8, level: li });

          const pts = [[P.x, P.y]];
          let tx = P.x;
          if (P.exit) { pts.push([P.x, P.laneY], [P.gx, P.laneY]); tx = P.gx; }
          pts.push([tx, busY[0]]);
          if (r === 0) {
            pts.push([x, busY[0]], [x, rowY[0]]);
          } else {
            const gxl = gx0 + clamp(Math.round((tx - gx0) / colW), 0, cols) * colW;
            pts.push([gxl, busY[0]], [gxl, busY[r]], [x, busY[r]], [x, rowY[r]]);
          }
          edges.push({ key: `>${nd.id}`, dev: nd.id, d: rpath(pts, 10), kind: 'dev' });

          if (i === exIndex) {
            nextP = { x, y: rowY[r] + D + LAB, exit: r < rows - 1 };
            if (nextP.exit) {
              nextP.laneY = laneY[r + 1];
              nextP.gx = x + (x < cx ? colW / 2 : -colW / 2);
            }
          }
        });
        bottom = yy;
        if (nextP) P = nextP;
      });

      return { nodes, edges, height: bottom + PAD };
    }

    /* ---------- Rendern ---------- */

    _update() {
      if (!this._hass || !this._config || !this._wrap) return;
      const W = this._width || Math.floor(this._wrap.clientWidth);
      if (!W) return;
      const m = this._model();
      this._m = m;
      const t = tr(this._hass);
      if (!m.hasAnything) {
        this._sig = null;
        this._wrap.style.height = '';
        this._wrap.innerHTML = `<div class="empty">${esc(t.empty)}</div>`;
        return;
      }
      const sig = [W, m.sources.join(), m.levels.map((L) => `${L.parent.key}:${L.nodes.map((n) => n.id).join()}`).join('|')].join('#');
      if (sig !== this._sig) { this._sig = sig; this._render(m, W); }
      this._refresh(m);
    }

    _render(m, W) {
      const lay = this._layout(m, W);
      const prev = new Set(this._els.keys());
      const first = prev.size === 0;
      this._els = new Map();
      this._edges = new Map();

      let svg = '';
      for (const e of lay.edges) {
        svg += `<g data-e="${esc(e.key)}"><path class="base ${e.kind}" d="${e.d}"/><path class="dots ${e.kind}" d="${e.d}"/></g>`;
      }
      let html = `<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
      for (const n of lay.nodes) {
        const fresh = !first && !prev.has(n.key) ? ' new' : '';
        const small = n.d < 68 ? ' small' : '';
        html += `<div class="node ${n.kind}${fresh}${small}" data-k="${esc(n.key)}"
            style="left:${r1(n.x - n.lw / 2)}px;top:${r1(n.y)}px;width:${r1(n.lw)}px;--d:${n.d}px">
          <button class="circle" type="button"><span class="ring"></span><span class="top"></span><ha-icon></ha-icon><span class="val"></span><span class="sec"></span></button>
          <span class="badge" hidden></span>
          <span class="label"></span>
        </div>`;
      }
      this._wrap.innerHTML = html;
      this._wrap.style.height = `${Math.ceil(lay.height)}px`;

      this._wrap.querySelectorAll('g[data-e]').forEach((gEl) => {
        this._edges.set(gEl.dataset.e, { g: gEl, dots: gEl.querySelector('.dots'), dash: gEl.querySelector('.dots').classList.contains('dev') ? DASH.dev : DASH.src });
      });
      const meta = new Map(lay.nodes.map((n) => [n.key, n]));
      this._wrap.querySelectorAll('.node').forEach((el) => {
        const key = el.dataset.k;
        const circle = el.querySelector('.circle');
        this._els.set(key, {
          el, circle, meta: meta.get(key),
          ring: el.querySelector('.ring'), top: el.querySelector('.top'), icon: el.querySelector('ha-icon'),
          val: el.querySelector('.val'), sec: el.querySelector('.sec'),
          badge: el.querySelector('.badge'), label: el.querySelector('.label'),
        });
        this._bind(circle, key);
      });
      this._edgeMeta = new Map(lay.edges.map((e) => [e.key, e]));
    }

    _bind(circle, key) {
      let timer = null, held = false;
      const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
      circle.addEventListener('pointerdown', () => {
        held = false; clear();
        timer = setTimeout(() => { held = true; this._moreInfo(key); }, 550);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => circle.addEventListener(ev, clear));
      circle.addEventListener('contextmenu', (e) => { e.preventDefault(); clear(); if (!held) { held = true; this._moreInfo(key); } });
      circle.addEventListener('click', () => {
        if (held) { held = false; return; }
        this._tap(key);
      });
    }

    _findNode(key) {
      for (const L of (this._m ? this._m.levels : [])) {
        const n = L.nodes.find((x) => x.id === key);
        if (n) return n;
      }
      return null;
    }

    _entityFor(key) {
      const c = this._config;
      if (key === 'grid') { const g = c.grid || {}; return g.entity || g.import_entity || g.export_entity; }
      if (key === 'solar') return (c.solar || {}).entity;
      if (key === 'battery') { const b = c.battery || {}; return b.entity || b.discharge_entity || b.charge_entity || b.soc_entity; }
      if (key === 'home') return (c.home || {}).entity;
      const n = this._findNode(key);
      return n && n.cfg.entity;
    }

    _moreInfo(key) {
      const entityId = this._entityFor(key);
      if (!entityId) return;
      this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId }, bubbles: true, composed: true }));
    }

    _tap(key) {
      const n = this._findNode(key);
      if (n && n.children.some((k) => !k.hidden)) {
        if (this._expanded.has(key)) {
          [...this._expanded].forEach((id) => { if (id === key || id.startsWith(`${key}.`)) this._expanded.delete(id); });
        } else {
          // Akkordeon: Geschwister (und deren Unterebenen) schliessen
          const prefix = key.includes('.') ? key.slice(0, key.lastIndexOf('.') + 1) : '';
          const depth = key.split('.').length;
          [...this._expanded].forEach((id) => {
            if (id.startsWith(prefix) && id.split('.').length >= depth) this._expanded.delete(id);
          });
          this._expanded.add(key);
        }
        this._update();
        return;
      }
      this._moreInfo(key);
    }

    _fmt(wv) {
      if (wv == null) return '–';
      const c = this._config;
      const kt = c.kilo_threshold != null ? Number(c.kilo_threshold) : 1000;
      const kilo = Math.abs(wv) >= kt;
      const dec = kilo ? (c.kilo_decimals != null ? Number(c.kilo_decimals) : 1) : (c.base_decimals != null ? Number(c.base_decimals) : 0);
      const lang = (this._hass.locale && this._hass.locale.language) || this._hass.language || 'en';
      const k = `${lang}|${dec}`;
      let nf = this._nf[k];
      if (!nf) {
        try { nf = new Intl.NumberFormat(lang, { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
        catch (e) { nf = new Intl.NumberFormat('en', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }
        this._nf[k] = nf;
      }
      let num = nf.format(kilo ? wv / 1000 : wv);
      if (/^-0([.,]0+)?$/.test(num)) num = num.slice(1);
      return `${num} ${kilo ? 'kW' : 'W'}`;
    }

    _secondary(id) {
      if (!id) return '';
      const st = this._hass.states[id];
      if (!st) return '';
      if (typeof this._hass.formatEntityState === 'function') {
        try { return this._hass.formatEntityState(st); } catch (e) { /* fall through */ }
      }
      const u = st.attributes.unit_of_measurement;
      return u ? `${st.state} ${u}` : st.state;
    }

    _setNode(key, o) {
      const r = this._els.get(key);
      if (!r) return;
      const set = (el, v) => { if (el.textContent !== v) el.textContent = v; };
      r.el.style.setProperty('--c', o.color);
      if (o.ring) r.ring.style.setProperty('--ring', o.ring); else r.ring.style.removeProperty('--ring');
      if (r.icon.getAttribute('icon') !== o.icon) r.icon.setAttribute('icon', o.icon);
      set(r.val, o.value);
      set(r.top, o.top || '');
      set(r.sec, o.sec || '');
      set(r.label, o.name);
      r.label.title = o.name;
      r.circle.setAttribute('aria-label', `${o.name}: ${o.value}`);
      r.el.classList.toggle('idle', !o.active);
      r.el.classList.toggle('open', !!o.open);
      r.el.classList.toggle('static', !!o.static);
      if (o.count) {
        r.badge.hidden = false;
        const b = `${o.count}<i>▼</i>`;
        if (r.badge.innerHTML !== b) r.badge.innerHTML = b;
        r.circle.setAttribute('aria-expanded', o.open ? 'true' : 'false');
      } else {
        r.badge.hidden = true;
      }
    }

    _setEdge(key, power, color, reverse) {
      const r = this._edges.get(key);
      if (!r) return;
      const on = Math.abs(power) > 0;
      r.g.style.setProperty('--c', color);
      r.dots.classList.toggle('on', on);
      r.dots.classList.toggle('rev', !!reverse);
      if (on) {
        const max = Number(this._config.max_expected_power) || 3000;
        const speed = Math.round((14 + 62 * Math.min(1, Math.sqrt(Math.abs(power) / max))) / 4) * 4; // px/s
        const tval = `${(r.dash / speed).toFixed(2)}s`;
        if (r.t !== tval) { r.t = tval; r.dots.style.setProperty('--t', tval); }
      }
    }

    _refresh(m) {
      const c = this._config, t = tr(this._hass), f = m.flows;
      const g = c.grid || {}, s = c.solar || {}, b = c.battery || {}, hm = c.home || {};
      const col = {
        grid: g.color || COLOR.grid, ret: COLOR.ret, solar: s.color || COLOR.solar,
        battOut: b.color || COLOR.battOut, battIn: COLOR.battIn,
      };

      if (m.sources.includes('grid')) {
        const exporting = m.ge > 0 && m.gi === 0;
        const v = exporting ? m.ge : m.gi;
        this._setNode('grid', {
          color: exporting ? col.ret : col.grid, icon: g.icon || 'mdi:transmission-tower',
          value: `${exporting ? '← ' : m.gi > 0 ? '→ ' : ''}${this._fmt(v)}`,
          sec: this._secondary(g.secondary_entity), name: g.name || t.grid, active: v > 0,
        });
      }
      if (m.sources.includes('solar')) {
        this._setNode('solar', {
          color: col.solar, icon: s.icon || 'mdi:solar-power', value: this._fmt(m.sv),
          sec: this._secondary(s.secondary_entity), name: s.name || t.solar, active: m.sv > 0,
        });
      }
      if (m.sources.includes('battery')) {
        const socSt = b.soc_entity ? this._hass.states[b.soc_entity] : null;
        const soc = socSt ? parseFloat(socSt.state) : NaN;
        let icon = b.icon;
        if (!icon) {
          if (!isFinite(soc)) icon = 'mdi:battery';
          else if (soc >= 95) icon = 'mdi:battery';
          else if (soc < 5) icon = 'mdi:battery-outline';
          else icon = `mdi:battery-${Math.max(10, Math.round(soc / 10) * 10)}`;
        }
        const charging = m.bc > 0 && m.bd === 0;
        const v = charging ? m.bc : m.bd;
        this._setNode('battery', {
          color: charging ? col.battIn : col.battOut, icon,
          top: isFinite(soc) ? `${Math.round(soc)} %` : '',
          value: `${charging ? '↓ ' : m.bd > 0 ? '↑ ' : ''}${this._fmt(v)}`,
          sec: this._secondary(b.secondary_entity), name: b.name || t.battery, active: v > 0,
        });
      }

      // Haus: Ring zeigt, woher der Strom gerade kommt
      const parts = [[f['solar>home'], col.solar], [f['battery>home'], col.battOut], [f['grid>home'], col.grid]].filter((p) => p[0] > 0);
      const total = parts.reduce((a, p) => a + p[0], 0);
      let ring = null;
      if (total > 0) {
        let acc = 0;
        const stops = parts.map(([v, cl]) => { const from = acc; acc += (v / total) * 100; return `${cl} ${from.toFixed(1)}% ${acc.toFixed(1)}%`; });
        ring = `conic-gradient(${stops.join(', ')})`;
      }
      const homeColor = parts.length ? parts.slice().sort((x, y2) => y2[0] - x[0])[0][1] : 'var(--primary-color)';
      this._setNode('home', {
        color: hm.color || homeColor, ring, icon: hm.icon || 'mdi:home', value: this._fmt(m.home),
        sec: this._secondary(hm.secondary_entity), name: hm.name || t.home,
        active: Math.abs(m.home) > 0, static: !hm.entity,
      });

      // Quellen-Leitungen
      const srcColor = { solar: col.solar, grid: col.grid, battery: col.battOut };
      for (const [key, e] of this._edgeMeta) {
        if (e.kind !== 'src') continue;
        const fwd = f[`${e.a}>${e.b}`] || 0, back = f[`${e.b}>${e.a}`] || 0;
        if (back > fwd) this._setEdge(key, back, srcColor[e.b], true);
        else this._setEdge(key, fwd, srcColor[fwd > 0 ? e.a : (e.a === 'grid' && e.b === 'solar' ? 'solar' : e.a)], false);
      }

      // Geräte
      m.levels.forEach((L) => {
        const pv = Math.abs(L.parent.value || 0);
        L.nodes.forEach((n) => {
          const v = n.value;
          const share = pv > 0 && v != null ? clamp((Math.abs(v) / pv) * 100, 0, 100) : 0;
          const count = n.children.filter((k) => !k.hidden).length;
          const active = Math.abs(v || 0) > 0;
          this._setNode(n.id, {
            color: n.color,
            ring: active ? `conic-gradient(var(--c) ${share.toFixed(1)}%, color-mix(in srgb, var(--c) 28%, transparent) 0)` : null,
            icon: n.icon, value: this._fmt(v), sec: this._secondary(n.cfg.secondary_entity),
            name: n.name, active, open: this._expanded.has(n.id) && count > 0, count,
            static: !count && !n.cfg.entity,
          });
          this._setEdge(`>${n.id}`, v || 0, n.color, (v || 0) < 0);
        });
      });
    }
  }

  /* ====================================================================
   * Visueller Editor
   * ==================================================================== */

  const EDITOR_STYLE = `
    :host { display: block; }
    details { border: 1px solid var(--divider-color); border-radius: 12px; margin-bottom: 8px; overflow: hidden; }
    summary {
      list-style: none; cursor: pointer; padding: 12px 14px; font-weight: 500;
      display: flex; align-items: center; gap: 10px; user-select: none;
    }
    summary::-webkit-details-marker { display: none; }
    summary::after { content: '▾'; margin-left: auto; color: var(--secondary-text-color); transition: transform .2s; }
    details[open] > summary::after { transform: rotate(180deg); }
    summary ha-icon { color: var(--secondary-text-color); }
    .body { padding: 4px 14px 14px; }
    h3 { margin: 20px 0 4px; font-size: 16px; font-weight: 500; }
    .hint { color: var(--secondary-text-color); font-size: 13px; margin: 0 0 12px; line-height: 1.4; }
    .n { border: 1px solid var(--divider-color); border-radius: 12px; margin-bottom: 8px; background: var(--card-background-color); }
    .n .n { margin: 0 8px 8px 22px; }
    .hd { display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 10px; min-height: 44px; }
    .hd .tog { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; cursor: pointer; background: none; border: none; padding: 6px 0; font: inherit; color: inherit; text-align: left; }
    .nm { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .meta { color: var(--secondary-text-color); font-size: 12px; white-space: nowrap; }
    .sw { width: 22px; height: 22px; padding: 0; border: none; background: none; cursor: pointer; flex: none; border-radius: 50%; overflow: hidden; }
    .sw::-webkit-color-swatch-wrapper { padding: 0; }
    .sw::-webkit-color-swatch { border: none; border-radius: 50%; }
    .sw::-moz-color-swatch { border: none; border-radius: 50%; }
    .ib { width: 36px; height: 36px; border-radius: 50%; border: none; background: none; color: var(--secondary-text-color); cursor: pointer; display: flex; align-items: center; justify-content: center; flex: none; padding: 0; }
    .ib:hover { background: color-mix(in srgb, var(--primary-text-color) 8%, transparent); color: var(--primary-text-color); }
    .ib[disabled] { opacity: .3; pointer-events: none; }
    .ib ha-icon { --mdc-icon-size: 20px; }
    .bd { padding: 0 12px 12px; }
    .add {
      display: inline-flex; align-items: center; gap: 6px; cursor: pointer; font: inherit; font-weight: 500;
      color: var(--primary-color); background: none; border: 1px dashed var(--primary-color);
      border-radius: 10px; padding: 8px 14px; margin: 2px 0 8px;
    }
    .add.sub { margin: 0 8px 10px 22px; padding: 6px 12px; font-size: 13px; }
    .add:hover { background: color-mix(in srgb, var(--primary-color) 10%, transparent); }
    .add ha-icon { --mdc-icon-size: 18px; }
    .warn { padding: 12px; border-radius: 8px; background: color-mix(in srgb, var(--warning-color, #ffa600) 18%, transparent); }
  `;

  const SENSOR = { entity: { domain: 'sensor' } };
  const SCHEMAS = {
    general: [
      { name: 'title', selector: { text: {} } },
      { name: 'kilo_threshold', selector: { number: { min: 0, max: 100000, step: 100, mode: 'box', unit_of_measurement: 'W' } } },
      { name: 'max_expected_power', selector: { number: { min: 100, max: 100000, step: 100, mode: 'box', unit_of_measurement: 'W' } } },
      { name: 'show_other', selector: { boolean: {} } },
      { name: 'sort', selector: { boolean: {} } },
    ],
    grid: [
      { name: 'entity', selector: SENSOR, hint: 'grid_entity' },
      { name: 'import_entity', selector: SENSOR }, { name: 'export_entity', selector: SENSOR },
      { name: 'invert', selector: { boolean: {} } },
      { name: 'name', selector: { text: {} } }, { name: 'icon', selector: { icon: {} } },
    ],
    solar: [
      { name: 'entity', selector: SENSOR }, { name: 'invert', selector: { boolean: {} } },
      { name: 'name', selector: { text: {} } }, { name: 'icon', selector: { icon: {} } },
    ],
    battery: [
      { name: 'entity', selector: SENSOR, hint: 'battery_entity' },
      { name: 'charge_entity', selector: SENSOR }, { name: 'discharge_entity', selector: SENSOR },
      { name: 'soc_entity', selector: SENSOR }, { name: 'invert', selector: { boolean: {} } },
      { name: 'name', selector: { text: {} } }, { name: 'icon', selector: { icon: {} } },
    ],
    home: [
      { name: 'entity', selector: SENSOR }, { name: 'override_state', selector: { boolean: {} } },
      { name: 'name', selector: { text: {} } }, { name: 'icon', selector: { icon: {} } },
    ],
    device: [
      { name: 'name', selector: { text: {} } },
      { name: 'entity', selector: SENSOR, hint: 'device_entity' },
      { name: 'icon', selector: { icon: {} } },
      { name: 'secondary_entity', selector: { entity: {} } },
      { name: 'display_zero', selector: { boolean: {} } },
      { name: 'expanded', selector: { boolean: {} } },
    ],
  };
  const SECTION_ICONS = { general: 'mdi:cog', grid: 'mdi:transmission-tower', solar: 'mdi:solar-power', battery: 'mdi:battery', home: 'mdi:home' };
  const GENERAL_KEYS = SCHEMAS.general.map((s) => s.name);
  const GENERAL_DEFAULTS = { show_other: true };

  function clean(obj) {
    const out = {};
    Object.keys(obj || {}).forEach((k) => {
      const v = obj[k];
      if (v === undefined || v === null || v === '') return;
      out[k] = v;
    });
    return out;
  }

  let formPromise = null;
  function ensureForm() {
    if (customElements.get('ha-form')) return Promise.resolve(true);
    if (!formPromise) {
      formPromise = (async () => {
        try {
          const helpers = window.loadCardHelpers ? await window.loadCardHelpers() : null;
          if (helpers) {
            for (const cfg of [{ type: 'tile', entity: 'sun.sun' }, { type: 'entities', entities: [] }]) {
              try {
                const el = await helpers.createCardElement(cfg);
                if (el && el.constructor && el.constructor.getConfigElement) await el.constructor.getConfigElement();
              } catch (e) { /* ignore */ }
            }
          }
        } catch (e) { /* ignore */ }
        await Promise.race([
          customElements.whenDefined('ha-form'),
          new Promise((res) => setTimeout(res, 4000)),
        ]);
        return !!customElements.get('ha-form');
      })();
    }
    return formPromise;
  }

  class NestedPowerFlowCardEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._open = new Set();
      this._forms = {};
      this._tree = new Map();
      this._ready = false;
      ensureForm().then((ok) => { this._ready = true; this._formOk = ok; this._sync(true); });
    }

    setConfig(config) {
      const same = this._config && JSON.stringify(config) === JSON.stringify(this._config);
      this._config = config;
      if (!same) this._sync(false);
    }

    set hass(hass) {
      const first = !this._hass;
      this._hass = hass;
      if (first) { this._sync(true); return; }
      Object.values(this._forms).forEach((f) => { f.hass = hass; });
      this._tree.forEach((r) => { if (r.form) r.form.hass = hass; });
    }

    _fire() {
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
    }

    _mutate(fn, rebuild) {
      const cfg = JSON.parse(JSON.stringify(this._config));
      if (!Array.isArray(cfg.devices)) cfg.devices = [];
      fn(cfg);
      const prune = (list) => list.forEach((n) => {
        if (Array.isArray(n.children)) { if (n.children.length) prune(n.children); else delete n.children; }
      });
      prune(cfg.devices);
      if (!cfg.devices.length) delete cfg.devices;
      this._config = cfg;
      this._sync(rebuild);
      this._fire();
    }

    _makeForm(schema, kind, onChange) {
      const form = document.createElement('ha-form');
      form.hass = this._hass;
      form.schema = schema;
      form.computeLabel = (s) => tr(this._hass).f[s.name] || s.name;
      form.computeHelper = (s) => (s.hint ? tr(this._hass).h[s.hint] : undefined);
      form.addEventListener('value-changed', (e) => { e.stopPropagation(); onChange(e.detail.value || {}); });
      return form;
    }

    _sync(rebuild) {
      if (!this._hass || !this._config || !this._ready) return;
      const t = tr(this._hass);
      if (!this._formOk) {
        this.shadowRoot.innerHTML = `<style>${EDITOR_STYLE}</style><div class="warn">${esc(t.noForm)}</div>`;
        return;
      }
      if (!this._built) {
        this._built = true;
        const root = this.shadowRoot;
        root.innerHTML = `<style>${EDITOR_STYLE}</style><div id="sections"></div>
          <h3>${esc(t.devices)}</h3><p class="hint">${esc(t.devicesHint)}</p>
          <div id="tree"></div>
          <button class="add" id="addTop" type="button"><ha-icon icon="mdi:plus"></ha-icon>${esc(t.addTop)}</button>`;
        const sections = root.getElementById('sections');
        ['general', 'grid', 'solar', 'battery', 'home'].forEach((key) => {
          const det = document.createElement('details');
          if (key === 'grid' && !this._config.grid && !this._config.solar && !this._config.battery) det.open = true;
          det.innerHTML = `<summary><ha-icon icon="${SECTION_ICONS[key]}"></ha-icon>${esc(t[key])}</summary><div class="body"></div>`;
          const form = this._makeForm(SCHEMAS[key], key, (value) => {
            this._mutate((cfg) => {
              if (key === 'general') {
                GENERAL_KEYS.forEach((k) => delete cfg[k]);
                const v = clean(value);
                Object.keys(GENERAL_DEFAULTS).forEach((k) => { if (v[k] === GENERAL_DEFAULTS[k]) delete v[k]; });
                if (v.sort === false) delete v.sort;
                Object.assign(cfg, v);
              } else {
                const v = clean(value);
                ['invert', 'override_state'].forEach((k) => { if (v[k] === false) delete v[k]; });
                if (Object.keys(v).length) cfg[key] = v; else delete cfg[key];
              }
            }, false);
          });
          det.querySelector('.body').appendChild(form);
          sections.appendChild(det);
          this._forms[key] = form;
        });
        root.getElementById('addTop').addEventListener('click', () => {
          const idx = (this._config.devices || []).length;
          this._open.add(String(idx));
          this._mutate((cfg) => cfg.devices.push({ name: t.newDevice }), true);
        });
        rebuild = true;
      }
      const shape = (list) => (list || []).map((n) => `(${shape(n.children)})`).join('');
      const sig = `${shape(this._config.devices)}|${[...this._open].sort().join()}`;
      if (rebuild || sig !== this._sig) { this._sig = sig; this._buildTree(); }
      this._refresh();
    }

    _list(cfg, parentPath) {
      let list = cfg.devices;
      parentPath.forEach((i) => {
        if (!Array.isArray(list[i].children)) list[i].children = [];
        list = list[i].children;
      });
      return list;
    }

    _buildTree() {
      const t = tr(this._hass);
      const host = this.shadowRoot.getElementById('tree');
      host.innerHTML = '';
      this._tree = new Map();
      const btn = (icon, title, fn, disabled) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ib'; b.title = title; b.setAttribute('aria-label', title);
        b.disabled = !!disabled;
        b.innerHTML = `<ha-icon icon="${icon}"></ha-icon>`;
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        return b;
      };
      const build = (list, parent, container) => {
        (list || []).forEach((node, i) => {
          const pathArr = parent.concat(i), path = pathArr.join('.');
          const wrap = document.createElement('div');
          wrap.className = 'n';
          const hd = document.createElement('div');
          hd.className = 'hd';
          const sw = document.createElement('input');
          sw.type = 'color'; sw.className = 'sw'; sw.title = t.color; sw.setAttribute('aria-label', t.color);
          sw.addEventListener('change', () => {
            this._mutate((cfg) => { this._list(cfg, parent)[i].color = sw.value; }, false);
          });
          const tog = document.createElement('button');
          tog.type = 'button'; tog.className = 'tog';
          tog.innerHTML = '<span class="nm"></span><span class="meta"></span>';
          tog.addEventListener('click', () => {
            if (this._open.has(path)) this._open.delete(path); else this._open.add(path);
            this._sync(true);
          });
          hd.append(sw, tog,
            btn('mdi:arrow-up', t.up, () => this._move(parent, i, -1), i === 0),
            btn('mdi:arrow-down', t.down, () => this._move(parent, i, 1), i === list.length - 1),
            btn('mdi:delete-outline', t.remove, () => {
              this._open.clear();
              this._mutate((cfg) => { this._list(cfg, parent).splice(i, 1); }, true);
            }));
          wrap.appendChild(hd);
          const rec = { name: tog.querySelector('.nm'), meta: tog.querySelector('.meta'), sw, form: null };
          if (this._open.has(path)) {
            const bd = document.createElement('div');
            bd.className = 'bd';
            rec.form = this._makeForm(SCHEMAS.device, 'device', (value) => {
              this._mutate((cfg) => {
                const l = this._list(cfg, parent), old = l[i];
                const v = clean(value);
                if (v.display_zero === true) delete v.display_zero;
                if (v.expanded === false) delete v.expanded;
                if (old.color) v.color = old.color;
                if (old.invert) v.invert = old.invert;
                if (old.children) v.children = old.children;
                l[i] = v;
              }, false);
            });
            bd.appendChild(rec.form);
            wrap.appendChild(bd);
          }
          this._tree.set(path, rec);
          build(node.children, pathArr, wrap);
          const add = document.createElement('button');
          add.type = 'button'; add.className = 'add sub';
          add.innerHTML = `<ha-icon icon="mdi:plus"></ha-icon>${esc(t.addChild)}`;
          add.addEventListener('click', () => {
            const idx = (node.children || []).length;
            this._open.add(`${path}.${idx}`);
            this._mutate((cfg) => { this._list(cfg, pathArr).push({ name: t.newDevice }); }, true);
          });
          if (this._open.has(path) || (node.children || []).length) wrap.appendChild(add);
          container.appendChild(wrap);
        });
      };
      build(this._config.devices, [], host);
    }

    _move(parent, i, dir) {
      const base = parent.length ? `${parent.join('.')}.` : '';
      const a = `${base}${i}`, b = `${base}${i + dir}`;
      const swap = new Set();
      this._open.forEach((p) => {
        if (p === a || p.startsWith(`${a}.`)) swap.add(b + p.slice(a.length));
        else if (p === b || p.startsWith(`${b}.`)) swap.add(a + p.slice(b.length));
        else swap.add(p);
      });
      this._open = swap;
      this._mutate((cfg) => {
        const l = this._list(cfg, parent);
        const [x] = l.splice(i, 1);
        l.splice(i + dir, 0, x);
      }, true);
    }

    _refresh() {
      const c = this._config, t = tr(this._hass);
      Object.keys(this._forms).forEach((key) => {
        const form = this._forms[key];
        form.hass = this._hass;
        if (key === 'general') {
          const d = Object.assign({}, GENERAL_DEFAULTS);
          GENERAL_KEYS.forEach((k) => { if (c[k] !== undefined) d[k] = c[k]; });
          form.data = d;
        } else {
          form.data = Object.assign({}, c[key] || {});
        }
      });
      const walk = (list, parent, inherit, depth) => (list || []).forEach((n, i) => {
        const path = parent.concat(i).join('.');
        const rec = this._tree.get(path);
        const color = n.color || (depth === 0 ? PALETTE[i % PALETTE.length] : inherit);
        if (rec) {
          const st = n.entity ? this._hass.states[n.entity] : null;
          rec.name.textContent = n.name || (st && st.attributes.friendly_name) || n.entity || t.device;
          const count = (n.children || []).length;
          rec.meta.textContent = count ? `${count} ${t.children}` : '';
          if (/^#[0-9a-f]{6}$/i.test(color) && rec.sw.value !== color.toLowerCase()) rec.sw.value = color;
          if (rec.form) {
            const d = Object.assign({ display_zero: true }, n);
            delete d.children; delete d.color; delete d.invert;
            rec.form.hass = this._hass;
            rec.form.data = d;
          }
        }
        walk(n.children, parent.concat(i), color, depth + 1);
      });
      walk(c.devices, [], null, 0);
    }
  }

  if (!customElements.get(CARD)) customElements.define(CARD, NestedPowerFlowCard);
  if (!customElements.get(EDITOR)) customElements.define(EDITOR, NestedPowerFlowCardEditor);

  window.customCards = window.customCards || [];
  if (!window.customCards.some((c) => c.type === CARD)) {
    window.customCards.push({
      type: CARD,
      name: 'Nested Power Flow Card',
      description: 'Energiefluss mit verschachtelbaren Gruppen (z. B. Stall → Geräte im Stall).',
      preview: true,
      documentationURL: 'https://github.com/Flecksel/myhomeassistan',
    });
  }
  // eslint-disable-next-line no-console
  console.info(`%c NESTED-POWER-FLOW-CARD %c v${VERSION} `, 'color:#fff;background:#ff9800;font-weight:700', 'color:#ff9800;background:#222');
})();
