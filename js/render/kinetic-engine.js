// Ellery Kinetic Engine — the Kinetic Rank board.
//
// Classic script on purpose (no imports/exports): the exact same file runs
// the live workspace canvas AND is embedded verbatim by the server into the
// Pro "Interactive Presentation Link" standalone export. It exposes one
// global: ElleryKinetic.
//
// Purpose-driven physics. This is NOT the mindmap: there is no tree. Every
// row is a ranked card in a grid, and the Verlet springs exist to carry
// information:
//   • Sort pulses — setMode('value-desc' | 'value-asc' | 'date' | 'label' |
//     'category' | 'shuffle') re-targets every card's home; the field
//     physically migrates so you can WATCH rows re-rank.
//   • Drag-to-compare — hold a card over another and a live difference/ratio readout
//     appears between them; release and the spring snap-back enforces the
//     card's true rank (the field self-corrects, always).
//   • Click-to-pin — click a card to make it the reference; every other
//     card's metric re-renders as a delta against it.
//   • playShowcase(ms) — choreographs shuffle → re-sort for MP4 recording,
//     so exported loops capture data organising itself.
//
// Cards follow the locked design system: matte #0B0B0C blocks, 1px
// rgba(255,255,255,0.12) borders, centred microscopic type. Ambient dust
// keeps the field atmospheric.

(() => {
  'use strict';

  const DAMPING = 0.94;
  const ANCHOR = 0.085;
  const MAX_CARDS = 120;
  const DUST_COUNT = 15;
  const BLOOM = 'rgba(255, 255, 255, 0.4)';
  const GAP_X = 18;
  const GAP_Y = 10;
  const TOP_PAD = 56;

  const C = {
    cardBG: '#0b0b0c',
    cardBorder: 'rgba(255,255,255,0.12)',
    cardBorderHot: 'rgba(255,255,255,0.5)',
    cardBorderRef: 'rgba(255,255,255,0.85)',
    title: 'rgba(245,245,247,0.92)',
    metric: 'rgba(160,160,166,0.8)',
    delta: 'rgba(245,245,247,0.75)',
    rank: 'rgba(110,110,115,0.85)',
    bar: 'rgba(255,255,255,0.16)',
    dust: 'rgba(255,255,255,0.22)',
    overlayBG: 'rgba(11,11,12,0.96)',
  };

  const FONT_TITLE = '500 10px "SF Mono", ui-monospace, Menlo, monospace';
  const FONT_METRIC = '400 9px "SF Mono", ui-monospace, Menlo, monospace';
  const FONT_RANK = '500 8px "SF Mono", ui-monospace, Menlo, monospace';

  class ElleryKinetic {
    constructor(canvas, dataset, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = Math.min((typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1, 2);
      this.reduced = !!opts.reducedMotion;
      this.t = 0;
      this.running = false;
      this.drag = null;
      this.hover = null;
      this.compare = null;     // card currently hovered by a dragged card
      this.reference = null;   // pinned card: all metrics become deltas vs it
      this.w = 0;
      this.h = 0;
      this._showTimers = [];

      // Data Story Mode camera. Identity (active:false) leaves the board
      // exactly as the interactive view — so picking/dragging are untouched.
      // During a story the camera pans/zooms to each scene's focus with
      // smooth exponential easing; when the story ends it eases back home.
      this.cam = { x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tzoom: 1, active: false };
      this._story = null;      // { specs, i, scene, sceneStart, targetSet }

      this._frame = this._frame.bind(this);
      this._down = this._down.bind(this);
      this._move = this._move.bind(this);
      this._up = this._up.bind(this);
      this._resize = this._resize.bind(this);

      this._build(dataset);
      this.mode = this.valueKey ? 'value-desc' : 'label';
      this._seedDust();
      // Debug/testing handle (also used by tooling to pump frames manually).
      canvas.__kinetic = this;
    }

    /* ---------- cards from a dataset (flat rank list — no tree) ---------- */

    _build(dataset) {
      const cols = dataset.columns || [];
      const rows = (dataset.rows || []).slice(0, MAX_CARDS);
      const strings = cols.filter((c) => c.type === 'string');
      const numbers = cols.filter((c) => c.type === 'number');
      const dates = cols.filter((c) => c.type === 'date');

      let labelCol = strings[0] || cols[0] || null;
      let best = -1;
      for (const c of strings) {
        const d = new Set(rows.map((r) => r[c.key])).size;
        if (d > best) { best = d; labelCol = c; }
      }
      let catCol = null;
      for (const c of strings) {
        if (c === labelCol && strings.length > 1) continue;
        const d = new Set(rows.map((r) => r[c.key])).size;
        if (d >= 2 && d <= Math.max(3, rows.length / 3)) { catCol = c; break; }
      }
      this.valueKey = numbers[0] || null;
      this.dateKey = dates[0] || null;
      this.catKey = catCol;
      this.valueLabel = this.valueKey ? this.valueKey.label : null;
      // Kept for dataset classification (Story Mode intelligence).
      this.columns = cols;
      this._rows = rows;
      this.format = (dataset.meta && dataset.meta.format) || 'csv';

      this.cards = rows.map((row) => {
        const full = labelCol ? String(row[labelCol.key] ?? '') : '—';
        return {
          x: 0, y: 0, px: 0, py: 0, hx: 0, hy: 0,
          w: 170, h: 34,
          title: this._trim(full, 26),
          fullTitle: full,
          value: this.valueKey && typeof row[this.valueKey.key] === 'number' ? row[this.valueKey.key] : null,
          date: this.dateKey ? String(row[this.dateKey.key] ?? '') : '',
          category: catCol ? String(row[catCol.key] ?? '—') : '',
          rank: 0,
        };
      });
      this.maxValue = Math.max(...this.cards.map((c) => Math.abs(c.value ?? 0)), 1);
    }

    _trim(s, n) {
      return s.length > n ? `${s.slice(0, n - 1)}…` : s;
    }

    /* ---------- sort pulses: re-target every card's home ---------- */

    availableModes() {
      const m = [];
      if (this.valueKey) m.push('value-desc', 'value-asc');
      if (this.dateKey) m.push('date');
      m.push('label');
      if (this.catKey) m.push('category');
      m.push('shuffle');
      return m;
    }

    setMode(mode) {
      if (!this.availableModes().includes(mode)) mode = 'label';
      this.mode = mode;
      this._layout();
      if (this.onmode) this.onmode(mode);
    }

    _orderedCards() {
      const arr = [...this.cards];
      const byValue = (a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity);
      switch (this.mode) {
        case 'value-desc': arr.sort(byValue); break;
        case 'value-asc': arr.sort((a, b) => byValue(b, a)); break;
        case 'date': arr.sort((a, b) => a.date.localeCompare(b.date)); break;
        case 'category':
          arr.sort((a, b) => a.category.localeCompare(b.category) || byValue(a, b));
          break;
        case 'shuffle':
          for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
          }
          break;
        default: arr.sort((a, b) => a.title.localeCompare(b.title));
      }
      return arr;
    }

    /* ---------- ranked grid layout (top-down, column-flow) ---------- */

    _layout() {
      const ctx = this.ctx;
      // Uniform card width keeps the rank grid architectural.
      let cardW = 150;
      ctx.font = FONT_TITLE;
      for (const c of this.cards) {
        cardW = Math.max(cardW, Math.min(ctx.measureText(c.title).width + 56, 250));
      }

      const n = this.cards.length;
      const colsFit = Math.max(1, Math.floor((this.w - 60) / (cardW + GAP_X)));
      const colCount = Math.min(colsFit, Math.max(1, Math.ceil(n / 10)));
      const perCol = Math.ceil(n / colCount);

      this.h = Math.max(this.hBase, TOP_PAD + perCol * (34 + GAP_Y) + 40);
      this.canvas.height = Math.round(this.h * this.dpr);
      this.canvas.style.height = `${this.h}px`;

      const gridW = colCount * cardW + (colCount - 1) * GAP_X;
      const startX = Math.max(30, (this.w - gridW) / 2) + cardW / 2;

      const ordered = this._orderedCards();
      ordered.forEach((card, i) => {
        card.rank = i + 1;
        const col = Math.floor(i / perCol);
        const row = i % perCol;
        card.w = cardW;
        card.hx = startX + col * (cardW + GAP_X);
        card.hy = TOP_PAD + row * (34 + GAP_Y) + 17;
      });

      // First layout: spawn at home so the board reads instantly.
      if (!this._spawned) {
        for (const c of this.cards) {
          c.x = c.px = c.hx;
          c.y = c.py = c.hy;
        }
        this._spawned = true;
      }
    }

    _seedDust() {
      this.dust = Array.from({ length: DUST_COUNT }, () => ({
        u: Math.random(),
        v: Math.random(),
        r: 0.6 + Math.random() * 0.9,
        a: 0.1 + Math.random() * 0.2,
        s1: 0.05 + Math.random() * 0.09,
        s2: 0.03 + Math.random() * 0.07,
        p1: Math.random() * Math.PI * 2,
        p2: Math.random() * Math.PI * 2,
      }));
    }

    /* ---------- showcase choreography (used by the MP4 recorder) ---------- */

    playShowcase(ms = 3000) {
      this.stopShowcase();
      const home = this.valueKey ? 'value-desc' : 'label';
      this.setMode('shuffle');
      this._showTimers.push(setTimeout(() => this.setMode(home), Math.round(ms * 0.42)));
      return () => this.stopShowcase();
    }

    stopShowcase() {
      this._showTimers.forEach(clearTimeout);
      this._showTimers = [];
    }

    /* ---------- Data Story Mode: auto scenes + cinematic camera ---------- */

    // Analyse the data and suggest a sensible scene sequence. Each scene is a
    // tiny declarative spec resolved against live data at play time, so it
    // stays accurate even after the user reorders or the board re-sorts.
    // Lightweight dataset classification so Story Mode matches the strategy
    // to the data shape instead of forcing a ranking onto everything.
    classify() {
      const n = this.cards.length;
      const vals = this.cards.map((c) => c.value).filter((v) => v != null);
      const distinctVals = new Set(vals).size;
      const hasValue = !!this.valueKey && vals.length > 0;
      const hasDate = !!this.dateKey && this.cards.some((c) => c.date);
      const hasCat = !!this.catKey;
      const keys = (this.columns || []).map((c) => c.key.toLowerCase());
      const isHierJSON = keys.includes('branch') && keys.includes('path');
      const isNotes = this.format === 'text';
      const statusCol = this._statusColumn();
      const catLabel = hasCat ? this.catKey.label.toLowerCase() : '';

      // Honest degenerate qualifiers first.
      if (n < 2) {
        return { type: 'mixed', label: 'Single record',
          reason: 'Only one record — nothing to rank or compare yet.', degenerate: 'too-few' };
      }
      if (hasValue && distinctVals === 1) {
        return { type: 'flat', label: 'Uniform dataset',
          reason: `Values are equal — relationships matter more than rank.`, degenerate: 'equal' };
      }

      if (isHierJSON) {
        return { type: 'hierarchical', label: 'Structured system map',
          reason: 'Exploring relationships and how the parts are organised.', degenerate: null };
      }
      if (isNotes) {
        return { type: 'notes', label: 'Knowledge dataset',
          reason: 'Extracting themes, dates, and action items from your notes.', degenerate: null };
      }
      if (statusCol) {
        return { type: 'task', label: 'Operations dataset',
          reason: `Tracking “${statusCol.label}” across workstreams and readiness.`, degenerate: null };
      }
      if (hasDate && !hasValue) {
        return { type: 'timeline', label: 'Timeline dataset',
          reason: 'Following events from earliest to latest activity.', degenerate: null };
      }
      if (hasValue && distinctVals > 1) {
        return { type: 'ranked', label: 'Performance dataset',
          reason: `Identifying leaders, laggards, and major gaps in ${(this.valueLabel ?? 'value').toLowerCase()}${hasCat ? `, grouped by ${catLabel}` : ''}.`,
          degenerate: null };
      }
      if (hasCat) {
        return { type: 'hierarchical', label: 'Structured system map',
          reason: 'Mapping how records group together across categories.', degenerate: null };
      }
      return { type: 'mixed', label: 'General dataset',
        reason: 'No dominant structure — showing a clean overview.', degenerate: 'flat' };
    }

    // Pick a scene strategy from the classification. Every scene a builder
    // emits has informational value for that data shape (Phase 6); builders
    // only push scenes whose content actually exists.
    autoStory() {
      const cls = this.classify();
      this._lastClass = cls;
      let scenes;
      switch (cls.type) {
        case 'ranked': scenes = this._rankedStory(); break;
        case 'timeline': scenes = this._timelineStory(); break;
        case 'task': scenes = this._taskStory(); break;
        case 'hierarchical': scenes = this._hierStory(); break;
        case 'notes': scenes = this._notesStory(); break;
        case 'flat': scenes = this._flatStory(); break;
        default: scenes = this._overviewStory();
      }
      return scenes.slice(0, 6);
    }

    _rankedStory() {
      const s = [{ type: 'overview', sel: 'all', mode: 'value-desc' }];
      s.push({ type: 'spotlight', sel: 'max-value', mode: 'value-desc' });
      if (this.cards.length > 3) s.push({ type: 'spotlight', sel: 'min-value', mode: 'value-desc' });
      s.push({ type: 'comparison', sel: 'extremes', mode: 'value-desc' });
      if (this._groupsAreMeaningful()) s.push({ type: 'group', sel: 'largest-category', mode: 'category' });
      s.push({ type: 'summary', sel: 'all', mode: 'value-desc' });
      return s;
    }

    _timelineStory() {
      const s = [{ type: 'overview', sel: 'all', mode: 'date',
        title: 'Timeline', caption: `${this.cards.length} events, in time order.` }];
      s.push({ type: 'spotlight', sel: 'oldest', mode: 'date' });
      s.push({ type: 'spotlight', sel: 'newest', mode: 'date' });
      if (this._groupsAreMeaningful()) s.push({ type: 'group', sel: 'largest-category', mode: 'category' });
      s.push({ type: 'summary', sel: 'all', mode: 'date',
        title: 'Summary', caption: `${this.cards.length} events from ${this._dateRange()}.` });
      return s;
    }

    _taskStory() {
      const baseMode = this.catKey ? 'category' : this.dateKey ? 'date' : 'label';
      const s = [{ type: 'overview', sel: 'all', mode: baseMode,
        title: 'Project overview', caption: `${this.cards.length} items across the plan.` }];
      // Each category is a workstream — focus the largest one or two that
      // actually group more than a single item.
      const groups = this._categoriesBySize().filter((g) => g.n >= 2).slice(0, 2);
      for (const g of groups) {
        s.push({ type: 'group', sel: `cat:${g.name}`, mode: 'category',
          title: g.name, caption: `“${g.name}” workstream — ${g.n} items.` });
      }
      if (this.dateKey) {
        s.push({ type: 'spotlight', sel: 'newest', mode: 'date',
          title: 'Latest milestone', caption: `Most recent: ${this._argExtreme('date', 1)?.fullTitle ?? ''}.` });
      }
      s.push({ type: 'summary', sel: 'all', mode: baseMode,
        title: 'Summary', caption: `${this.cards.length} items, ${groups.length ? `${this._categoriesBySize().length} workstreams` : 'one workstream'}.` });
      return s;
    }

    _hierStory() {
      const baseMode = this.catKey ? 'category' : 'label';
      const branches = this._categoriesBySize();
      const s = [{ type: 'overview', sel: 'all', mode: baseMode,
        title: 'Structure', caption: branches.length
          ? `${this.cards.length} items across ${branches.length} branch${branches.length === 1 ? '' : 'es'}.`
          : `${this.cards.length} items.` }];
      for (const g of branches.slice(0, 3)) {
        s.push({ type: 'group', sel: `cat:${g.name}`, mode: 'category',
          title: g.name, caption: `${g.name} — ${g.n} item${g.n === 1 ? '' : 's'} in this branch.` });
      }
      s.push({ type: 'summary', sel: 'all', mode: baseMode,
        title: 'The full map', caption: branches.length
          ? `${branches[0].name} is the largest branch (${branches[0].n} items).`
          : `${this.cards.length} items.` });
      return s;
    }

    _notesStory() {
      const n = this.cards.length;
      const s = [{ type: 'overview', sel: 'all', mode: 'label',
        title: 'Overview', caption: `${n} note${n === 1 ? '' : 's'} captured.` }];

      const themes = this._topKeywords(3);
      if (themes.length) {
        s.push({ type: 'group', sel: `contains:${themes[0].word}`, mode: 'label',
          title: 'Key themes', caption: `Recurring themes: ${themes.map((t) => t.word).join(', ')}.` });
      }
      const dated = this.cards.filter((c) => c.date);
      if (dated.length) {
        s.push({ type: 'spotlight', sel: 'dated', mode: this.dateKey ? 'date' : 'label',
          title: 'Important dates',
          caption: `${dated.length} dated item${dated.length === 1 ? '' : 's'}${this.dateKey ? ` — ${this._dateRange()}` : ''}.` });
      }
      const tasks = this.cards.filter((c) => this._looksTask(c.fullTitle));
      if (tasks.length) {
        s.push({ type: 'group', sel: 'tasks', mode: 'label',
          title: 'Action items', caption: `${tasks.length} task${tasks.length === 1 ? '' : 's'} to act on.` });
      }
      s.push({ type: 'summary', sel: 'all', mode: 'label',
        title: 'Summary',
        caption: themes.length ? `${n} notes, ${themes.length} key theme${themes.length === 1 ? '' : 's'}.` : `${n} notes.` });
      return s;
    }

    // Equal values / no ranking — be honest, pivot to relationships.
    _flatStory() {
      const v = this.cards.find((c) => c.value != null);
      const s = [{ type: 'overview', sel: 'all', mode: this.catKey ? 'category' : 'label',
        title: 'Overview',
        caption: `All ${this.cards.length} items share the same ${this.valueLabel ?? 'value'}${v ? ` (${this._fmt(v.value)})` : ''}.` }];
      if (this._groupsAreMeaningful()) {
        s.push({ type: 'group', sel: 'largest-category', mode: 'category',
          title: 'Categories', caption: 'No meaningful ranking — showing category relationships instead.' });
      }
      s.push({ type: 'summary', sel: 'all', mode: 'label',
        title: 'Summary', caption: `Equal values across ${this.cards.length} items.` });
      return s;
    }

    _overviewStory() {
      const s = [{ type: 'overview', sel: 'all', mode: this.catKey ? 'category' : 'label',
        title: 'Overview', caption: (this._lastClass && this._lastClass.reason) || `${this.cards.length} items.` }];
      if (this.catKey) {
        s.push({ type: 'group', sel: 'largest-category', mode: 'category',
          title: 'Categories', caption: 'Showing how the items group together.' });
      }
      s.push({ type: 'summary', sel: 'all', mode: 'label',
        title: 'Summary', caption: `${this.cards.length} item${this.cards.length === 1 ? '' : 's'} shown.` });
      return s;
    }

    /* ---------- classification helpers ---------- */

    _statusColumn() {
      const VOCAB = /^(done|to ?do|in[- ]?progress|completed?|pending|blocked|not[- ]?started|backlog|active|open|closed|in review|review|shipped|planned|cancell?ed|won't fix|wip)$/i;
      for (const col of this.columns || []) {
        if (col.type !== 'string') continue;
        const vals = (this._rows || []).map((r) => String(r[col.key] ?? '').trim()).filter(Boolean);
        if (vals.length < 2) continue;
        const hits = vals.filter((v) => VOCAB.test(v)).length;
        if (hits >= vals.length * 0.6) return col;
      }
      return null;
    }

    _categoriesBySize() {
      if (!this.catKey) return [];
      const counts = new Map();
      for (const c of this.cards) counts.set(c.category, (counts.get(c.category) || 0) + 1);
      return [...counts.entries()]
        .map(([name, nn]) => ({ name, n: nn }))
        .sort((a, b) => b.n - a.n);
    }

    // True only when a category actually groups rows together. Guards against
    // columns where every value is unique (one item per "category"), which
    // would otherwise produce hollow "largest group — 1 of N items" scenes.
    _groupsAreMeaningful() {
      const g = this._categoriesBySize();
      return g.length >= 2 && g.length < this.cards.length && g[0].n >= 2;
    }

    _dateRange() {
      const dates = this.cards.map((c) => c.date).filter(Boolean).sort();
      if (!dates.length) return '';
      return dates[0] === dates[dates.length - 1] ? dates[0] : `${dates[0]} → ${dates[dates.length - 1]}`;
    }

    _looksTask(text) {
      const t = String(text);
      if (/^\s*(?:[-*•]\s|\[\s?[x ]?\]|\d+[.)]\s)/.test(t)) return true;
      return /\b(to-?do|action item|due|deadline|must|need to|assign(?:ed)?|follow[- ]?up|finish|submit|prepare|schedule|send|ship|fix|review by|complete[d]? by)\b/i.test(t);
    }

    _topKeywords(k) {
      const STOP = new Set(('the a an and or of to in on for with at by from is are was were be been being this that these those it its as into our your their we you they i he she them his her our out up down over under not no yes will shall can could would should may might must do does did has have had get got make made about than then so but if while when where which who whom whose what why how all any each more most other some such only own same too very just also after before during between through above below new use used using one two three day days week weeks month months year years'.split(/\s+/)));
      const freq = new Map();
      for (const c of this.cards) {
        const seen = new Set();
        for (const w of String(c.fullTitle).toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []) {
          if (STOP.has(w) || seen.has(w)) continue;
          seen.add(w); // count each note once per word
          freq.set(w, (freq.get(w) || 0) + 1);
        }
      }
      return [...freq.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, k)
        .map(([word, n]) => ({ word, n }));
    }

    sceneTitle(type) {
      return {
        overview: 'Overview',
        spotlight: 'Spotlight',
        comparison: 'Comparison',
        group: 'Group focus',
        summary: 'Summary',
      }[type] || 'Scene';
    }

    _argExtreme(key, dir) {
      let best = null;
      for (const c of this.cards) {
        const v = c[key];
        if (v == null || v === '') continue;
        if (!best) { best = c; continue; }
        const cmp = key === 'value' ? v - best[key] : String(v).localeCompare(String(best[key]));
        if (dir > 0 ? cmp > 0 : cmp < 0) best = c;
      }
      return best;
    }

    _largestCategory() {
      const counts = new Map();
      for (const c of this.cards) counts.set(c.category, (counts.get(c.category) || 0) + 1);
      let name = null, n = -1;
      for (const [k, v] of counts) if (v > n) { n = v; name = k; }
      return { name, cards: this.cards.filter((c) => c.category === name), n };
    }

    // spec → { type, title, caption, targets:[cards], mode }
    resolveScene(spec) {
      const f = (n) => this._fmt(n);
      const vl = this.valueLabel ? this.valueLabel.toLowerCase() : 'value';
      let targets = [];
      let title = this.sceneTitle(spec.type);
      let caption = '';

      switch (spec.sel) {
        case 'max-value': {
          const c = this._argExtreme('value', 1);
          if (c) {
            targets = [c]; title = 'Top performer';
            const share = this._valueShare(c);
            caption = `${c.fullTitle} leads at ${f(c.value)} ${vl} — the strongest contributor${
              share ? `, ${share}% of the total` : ''}.`;
          }
          break;
        }
        case 'min-value': {
          const c = this._argExtreme('value', -1);
          if (c) { targets = [c]; title = 'Lowest';
            caption = `${c.fullTitle} trails at ${f(c.value)} ${vl} — the biggest opportunity to improve.`; }
          break;
        }
        case 'newest': {
          const c = this._argExtreme('date', 1);
          if (c) { targets = [c]; title = 'Most recent';
            caption = `${c.fullTitle} (${c.date}) — the latest recorded activity.`; }
          break;
        }
        case 'oldest': {
          const c = this._argExtreme('date', -1);
          if (c) { targets = [c]; title = 'Where it started';
            caption = `${c.fullTitle} (${c.date}) — the earliest entry on record.`; }
          break;
        }
        case 'extremes': {
          const hi = this._argExtreme('value', 1);
          const lo = this._argExtreme('value', -1);
          if (hi && lo && hi !== lo) {
            targets = [hi, lo]; title = 'Top vs bottom';
            const ratio = lo.value ? (hi.value / lo.value) : null;
            caption = ratio && isFinite(ratio) && ratio >= 1.1
              ? `${hi.fullTitle} is ${ratio.toFixed(1)}× ${lo.fullTitle} — the spread to watch.`
              : `${hi.fullTitle} leads ${lo.fullTitle} — a gap worth closing.`;
          }
          break;
        }
        case 'largest-category': {
          const g = this._largestCategory();
          if (g.name) {
            targets = g.cards; title = g.name;
            const pct = Math.round((g.n / this.cards.length) * 100);
            caption = `${g.name} is the largest category — ${g.n} of ${this.cards.length} records (${pct}%).`;
          }
          break;
        }
        case 'dated': {
          targets = this.cards.filter((c) => c.date);
          title = 'Important dates';
          caption = `${targets.length} dated item${targets.length === 1 ? '' : 's'}.`;
          break;
        }
        case 'tasks': {
          targets = this.cards.filter((c) => this._looksTask(c.fullTitle));
          title = 'Action items';
          caption = `${targets.length} task${targets.length === 1 ? '' : 's'}.`;
          break;
        }
        default: {
          if (typeof spec.sel === 'string' && spec.sel.startsWith('cat:')) {
            const name = spec.sel.slice(4);
            targets = this.cards.filter((c) => c.category === name);
            title = name;
            const pct = Math.round((targets.length / this.cards.length) * 100);
            caption = `${name} — ${targets.length} record${targets.length === 1 ? '' : 's'} (${pct}% of the set).`;
          } else if (typeof spec.sel === 'string' && spec.sel.startsWith('contains:')) {
            const kw = spec.sel.slice(9).toLowerCase();
            targets = this.cards.filter((c) => String(c.fullTitle).toLowerCase().includes(kw));
            title = 'Key themes';
            caption = `“${kw}” recurs across ${targets.length} note${targets.length === 1 ? '' : 's'} — a dominant theme.`;
          } else { // 'all'
            targets = [];
            title = spec.type === 'summary' ? 'The full picture' : 'Overview';
            const by = this.valueKey ? `ranked by ${vl}` : this.dateKey ? 'in time order' : 'A → Z';
            caption = `${this.cards.length} records, ${by} — the full picture before we zoom in.`;
          }
        }
      }
      if (!caption) caption = `${this.cards.length} items.`;
      // Strategy builders may supply exact wording; honour it over defaults.
      return {
        type: spec.type,
        title: spec.title || title,
        caption: spec.caption || caption,
        targets,
        mode: spec.mode,
      };
    }

    // Camera state that frames a set of cards (empty = the whole board).
    _frameTargets(targets) {
      const set = targets && targets.length ? targets : this.cards;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const c of set) {
        minX = Math.min(minX, c.hx - c.w / 2);
        maxX = Math.max(maxX, c.hx + c.w / 2);
        minY = Math.min(minY, c.hy - c.h / 2);
        maxY = Math.max(maxY, c.hy + c.h / 2);
      }
      const pad = 70;
      const bw = maxX - minX + pad * 2;
      const bh = maxY - minY + pad * 2;
      const zoom = Math.max(0.85, Math.min((this.w * 0.92) / bw, (this.h * 0.92) / bh, 2.6));
      return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, zoom };
    }

    // +1 for the cinematic title card injected ahead of the content scenes.
    storyDurationMs(specs, holdMs = 2400) {
      return ((specs?.length || 0) + 1) * holdMs + 600;
    }

    // Wrap the content scenes in presentation framing: a title card opens the
    // story; the trailing 'summary' content scene renders as a Key Findings
    // card. So an exported story feels authored, not just navigated.
    playStory(specs, { onScene, holdMs = 2400 } = {}) {
      this.stopStory();
      this.stopShowcase();
      if (!specs || !specs.length) return () => {};
      this.cam.active = true;
      const sort = this.valueKey ? 'value-desc' : this.dateKey ? 'date' : 'label';
      const full = [{ type: 'title', sel: 'all', mode: sort }, ...specs];
      // Scene advancement is driven by accumulated frame time (this.t) inside
      // _step — NOT setTimeout — so it stays frame-accurate and immune to the
      // ~1/sec timer throttling browsers impose on background tabs (which
      // would otherwise stall a recording mid-story).
      this._story = {
        specs: full, content: specs.length, i: -1, scene: null,
        sceneStart: this.t, targetSet: null,
        hold: holdMs / 1000, nextAt: 0, onScene: onScene || null,
      };
      this._advanceScene();
      return () => this.stopStory();
    }

    _advanceScene() {
      const st = this._story;
      if (!st) return;
      st.i += 1;
      if (st.i >= st.specs.length) { this.stopStory(); return; }
      const spec = st.specs[st.i];
      if (spec.mode) this.setMode(spec.mode); // re-sort → homes migrate
      st.sceneStart = this.t;
      st.nextAt = this.t + st.hold;

      if (spec.type === 'title' || spec.type === 'summary') {
        // Cinematic full-frame card; the board sits ghosted behind a wash.
        st.scene = { card: spec.type === 'title' ? 'title' : 'summary' };
        st.targetSet = new Set();
        const frame = this._frameTargets([]);
        this.cam.tx = frame.cx; this.cam.ty = frame.cy; this.cam.tzoom = frame.zoom;
      } else {
        const scene = this.resolveScene(spec);
        scene.why = this._sceneWhy(spec.sel);
        st.scene = scene;
        st.targetSet = new Set(scene.targets);
        const frame = this._frameTargets(scene.targets);
        this.cam.tx = frame.cx; this.cam.ty = frame.cy; this.cam.tzoom = frame.zoom;
      }
      if (st.onScene) st.onScene(st.i, st.scene, st.specs.length);
    }

    // Plain-English "why this scene exists" (insight confidence + transition).
    _sceneWhy(sel) {
      if (typeof sel === 'string' && sel.startsWith('cat:')) return 'Category focus';
      if (typeof sel === 'string' && sel.startsWith('contains:')) return 'Recurring theme';
      return {
        'max-value': 'Highest value in the dataset',
        'min-value': 'Lowest value in the dataset',
        newest: 'Most recent event',
        oldest: 'Earliest event',
        extremes: 'Biggest gap — top vs bottom',
        'largest-category': 'Largest group',
        dated: 'Items with dates',
        tasks: 'Action items found',
      }[sel] || 'The whole dataset at a glance';
    }

    // A target's share of the total absolute value, as a whole percent, or
    // null when the spread is too even for a share to be meaningful.
    _valueShare(card) {
      if (card.value == null) return null;
      const total = this.cards.reduce((s, c) => s + Math.abs(c.value ?? 0), 0);
      if (!total) return null;
      const pct = Math.round((Math.abs(card.value) / total) * 100);
      return pct >= 8 ? pct : null;
    }

    /* ---------- presentation framing: title + findings ---------- */

    storyTitle() {
      const t = (this._lastClass || this.classify()).type;
      const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
      const vl = this.valueLabel ? cap(this.valueLabel) : 'Data';
      switch (t) {
        case 'ranked': return `${vl} Analysis`;
        case 'timeline': return `${this.dateKey ? cap(this.dateKey.label) : 'Event'} Timeline`;
        case 'task': return 'Status Review';
        case 'hierarchical': return 'System Structure';
        case 'notes': return 'Briefing Notes';
        case 'flat': return `${vl} Overview`;
        default: return 'Data Briefing';
      }
    }

    // "MISSION BRIEFING" for operational datasets (status/readiness/risk-style
    // columns or a status classification); "DATA BRIEFING" otherwise. This is
    // the only place the briefing tone shifts — no theming, no graphics.
    briefingKicker() {
      const cls = this._lastClass || this.classify();
      const opsCol = /(status|readiness|risk|severity|priority|component|subsystem|deadline|milestone)/i;
      const operational = cls.type === 'task' ||
        (this.columns || []).some((c) => opsCol.test(c.key) && !/^milestone$/i.test(c.key));
      return operational ? 'MISSION BRIEFING' : 'DATA BRIEFING';
    }

    recordNoun() {
      const t = (this._lastClass || this.classify()).type;
      return { notes: 'notes', task: 'tasks', timeline: 'events' }[t] || 'records';
    }

    summaryFindings() {
      const cls = this._lastClass || this.classify();
      const out = [];
      const vl = this.valueLabel ? this.valueLabel.toLowerCase() : 'value';
      if (cls.type === 'ranked') {
        const hi = this._argExtreme('value', 1);
        const lo = this._argExtreme('value', -1);
        if (hi) out.push(`Highest ${vl}: ${hi.fullTitle}`);
        if (this._groupsAreMeaningful()) out.push(`Largest group: ${this._categoriesBySize()[0].name}`);
        if (lo && lo !== hi) out.push(`Lowest: ${lo.fullTitle}`);
      } else if (cls.type === 'timeline') {
        const o = this._argExtreme('date', -1);
        const n = this._argExtreme('date', 1);
        if (o) out.push(`Earliest: ${o.fullTitle}`);
        if (n && n !== o) out.push(`Most recent: ${n.fullTitle}`);
      } else if (cls.type === 'task') {
        const g = this._categoriesBySize();
        if (g[0]) out.push(`Biggest workstream: ${g[0].name} (${g[0].n})`);
        const n = this.dateKey && this._argExtreme('date', 1);
        if (n) out.push(`Latest milestone: ${n.fullTitle}`);
      } else if (cls.type === 'hierarchical') {
        const b = this._categoriesBySize();
        if (b[0]) out.push(`Largest branch: ${b[0].name} (${b[0].n})`);
        if (b.length) out.push(`${b.length} branches mapped`);
      } else if (cls.type === 'notes') {
        const themes = this._topKeywords(3);
        if (themes.length) out.push(`Top themes: ${themes.map((t) => t.word).join(', ')}`);
        const dated = this.cards.filter((c) => c.date).length;
        if (dated) out.push(`${dated} dated item${dated === 1 ? '' : 's'}`);
        const tasks = this.cards.filter((c) => this._looksTask(c.fullTitle)).length;
        if (tasks) out.push(`${tasks} action item${tasks === 1 ? '' : 's'}`);
      } else if (cls.type === 'flat') {
        const v = this.cards.find((c) => c.value != null);
        out.push(`All ${this.cards.length} items equal${v ? ` (${this._fmt(v.value)})` : ''}`);
      }
      if (!out.length) out.push(`${this.cards.length} items reviewed`);
      return out.slice(0, 4).map((s) => this._trim(s, 48));
    }

    storyPlaying() {
      return !!this._story;
    }

    stopStory() {
      this._showTimers.forEach(clearTimeout);
      this._showTimers = [];
      this._story = null;
      // Ease the camera back to the interactive overview.
      this.cam.tx = this.w / 2;
      this.cam.ty = this.h / 2;
      this.cam.tzoom = 1;
    }

    /* ---------- lifecycle ---------- */

    start() {
      this._sizeCanvas();
      this._lastFrame = 0;
      // Browsers throttle requestAnimationFrame to zero in hidden tabs; a
      // low-rate watchdog keeps the physics settling so the canvas is never
      // frozen when the tab returns (and recordings never stall).
      this._watchdog = setInterval(() => {
        if (!this.running) return;
        if (Date.now() - this._lastFrame > 150) {
          this.t += 1 / 60;
          this._step();
          this._draw();
        }
      }, 100);
      this.canvas.addEventListener('pointerdown', this._down);
      this.canvas.addEventListener('pointermove', this._move);
      this.canvas.addEventListener('pointerup', this._up);
      this.canvas.addEventListener('pointercancel', this._up);
      if (typeof ResizeObserver === 'function') {
        this._ro = new ResizeObserver(this._resize);
        this._ro.observe(this.canvas.parentElement || this.canvas);
      }
      this.running = true;
      this._frame();
    }

    stop() {
      this.running = false;
      clearInterval(this._watchdog);
      this.stopShowcase();
      this.canvas.removeEventListener('pointerdown', this._down);
      this.canvas.removeEventListener('pointermove', this._move);
      this.canvas.removeEventListener('pointerup', this._up);
      this.canvas.removeEventListener('pointercancel', this._up);
      if (this._ro) this._ro.disconnect();
    }

    _resize() {
      this._sizeCanvas();
    }

    _sizeCanvas() {
      const host = this.canvas.parentElement || this.canvas;
      const w = Math.max(host.clientWidth || 800, 320);
      this.w = w;
      this.hBase = 420;
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.style.width = `${w}px`;
      this._layout();
      // Keep the resting camera centred on the (possibly resized) board.
      if (!this.cam.active) {
        this.cam.x = this.cam.tx = this.w / 2;
        this.cam.y = this.cam.ty = this.h / 2;
        this.cam.zoom = this.cam.tzoom = 1;
      }
    }

    /* ---------- physics ---------- */

    _frame() {
      if (!this.running) return;
      this._lastFrame = Date.now();
      this.t += 1 / 60;
      this._step();
      this._draw();
      requestAnimationFrame(this._frame);
    }

    _step() {
      for (const c of this.cards) {
        if (c === this.drag) continue;
        const vx = (c.x - c.px) * DAMPING;
        const vy = (c.y - c.py) * DAMPING;
        c.px = c.x;
        c.py = c.y;
        c.x += vx;
        c.y += vy;

        // Anchor spring: the rank slot always wins.
        c.x += (c.hx - c.x) * ANCHOR;
        c.y += (c.hy - c.y) * ANCHOR;

        if (!this.reduced) {
          c.y += Math.sin(this.t * 0.6 + c.hy * 0.02) * 0.025;
        }
      }

      // Bounds.
      for (const c of this.cards) {
        if (c === this.drag) continue;
        const mx = c.w / 2 + 4;
        const my = c.h / 2 + 4;
        if (c.x < mx) c.x = mx;
        if (c.x > this.w - mx) c.x = this.w - mx;
        if (c.y < my) c.y = my;
        if (c.y > this.h - my) c.y = this.h - my;
      }

      // Story scene advancement, driven by frame time (throttle-proof).
      if (this._story && this.t >= this._story.nextAt) this._advanceScene();

      // Story camera: premium exponential easing toward the scene target.
      const cam = this.cam;
      if (cam.active) {
        const k = this.reduced ? 1 : 0.072;
        cam.x += (cam.tx - cam.x) * k;
        cam.y += (cam.ty - cam.y) * k;
        cam.zoom += (cam.tzoom - cam.zoom) * k;
        // Once a finished story has eased home, release the camera so normal
        // interaction (which assumes identity) resumes cleanly.
        if (!this._story &&
            Math.abs(cam.zoom - 1) < 0.004 &&
            Math.abs(cam.x - this.w / 2) < 0.6 &&
            Math.abs(cam.y - this.h / 2) < 0.6) {
          cam.active = false;
          cam.x = cam.tx = this.w / 2;
          cam.y = cam.ty = this.h / 2;
          cam.zoom = cam.tzoom = 1;
        }
      }
    }

    /* ---------- interaction: compare-drag + pin-click ---------- */

    _pos(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    _pick(pos, except = null) {
      for (let i = this.cards.length - 1; i >= 0; i--) {
        const c = this.cards[i];
        if (c === except) continue;
        if (Math.abs(pos.x - c.x) <= c.w / 2 + 4 && Math.abs(pos.y - c.y) <= c.h / 2 + 4) {
          return c;
        }
      }
      return null;
    }

    _down(e) {
      // Touching the board during a story hands control back to the viewer.
      if (this._story || this.cam.active) {
        this.stopStory();
        if (this.onstoryinterrupt) this.onstoryinterrupt();
        return;
      }
      const pos = this._pos(e);
      const c = this._pick(pos);
      if (!c) return;
      this.drag = c;
      this.compare = null;
      this._dragDist = 0;
      this._lastDrag = pos;
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.style.cursor = 'grabbing';
    }

    _move(e) {
      const pos = this._pos(e);
      if (this.drag) {
        this._dragDist += Math.hypot(pos.x - this._lastDrag.x, pos.y - this._lastDrag.y);
        // Carry a hint of the cursor's velocity so release feels organic.
        this.drag.px = this.drag.x - (pos.x - this._lastDrag.x) * 0.55;
        this.drag.py = this.drag.y - (pos.y - this._lastDrag.y) * 0.55;
        this.drag.x = pos.x;
        this.drag.y = pos.y;
        this._lastDrag = pos;
        // Live comparison target: the card under the dragged card.
        this.compare = this._pick(pos, this.drag);
        return;
      }
      this.hover = this._pick(pos);
      this.canvas.style.cursor = this.hover ? 'grab' : 'default';
    }

    _up() {
      if (this.drag && this._dragDist < 5) {
        // A click, not a drag: pin (or unpin) this card as the reference.
        this.reference = this.reference === this.drag ? null : this.drag;
      }
      this.drag = null;
      this.compare = null;
      this.canvas.style.cursor = this.hover ? 'grab' : 'default';
    }

    /* ---------- rendering ---------- */

    _fmt(n) {
      return Number(n).toLocaleString('en-US');
    }

    _draw() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);

      // Ambient dust beneath everything.
      ctx.shadowBlur = 6;
      ctx.shadowColor = C.dust;
      for (const d of this.dust) {
        const x = ((d.u + Math.sin(this.t * d.s1 + d.p1) * 0.06 + 1) % 1) * this.w;
        const y = ((d.v + Math.cos(this.t * d.s2 + d.p2) * 0.06 + 1) % 1) * this.h;
        ctx.globalAlpha = d.a * (0.7 + 0.3 * Math.sin(this.t * 0.4 + d.p1));
        ctx.fillStyle = C.dust;
        ctx.beginPath();
        ctx.arc(x, y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;

      // Header: current order, so the board always announces its meaning.
      // Hidden during a story — the scene caption narrates instead.
      if (!this._story) {
        ctx.font = FONT_METRIC;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.rank;
        const modeLabel = {
          'value-desc': `ranked by ${this.valueLabel ?? 'value'} · high → low`,
          'value-asc': `ranked by ${this.valueLabel ?? 'value'} · low → high`,
          date: 'ordered by date',
          label: 'ordered A → Z',
          category: 'grouped by category',
          shuffle: 'shuffled — fire a sort pulse to restore order',
        }[this.mode];
        ctx.fillText(modeLabel.toUpperCase(), 30, 26);
        if (this.reference) {
          ctx.fillText(
            `BASELINE “${this.reference.title.toUpperCase()}” — EACH CARD SHOWS HOW FAR ABOVE (+) OR BELOW (−) IT SITS · CLICK IT AGAIN TO CLEAR`,
            30, 40
          );
        }
      }

      // Camera transform: identity when no story is playing (so the
      // interactive board and pointer-picking are completely unchanged).
      const cam = this.cam;
      ctx.save();
      ctx.translate(this.w / 2, this.h / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);

      // Card blocks, sorted so the dragged card paints last (on top).
      const paintOrder = [...this.cards].sort((a, b) => (a === this.drag) - (b === this.drag));
      const dimSet = this._story && this._story.targetSet && this._story.targetSet.size
        ? this._story.targetSet : null;
      ctx.textAlign = 'center';
      for (const c of paintOrder) {
        const focused = !dimSet || dimSet.has(c);
        ctx.globalAlpha = focused ? 1 : 0.18;
        const hot = c === this.drag || c === this.hover || c === this.compare;
        const isRef = c === this.reference;
        const x = c.x - c.w / 2;
        const y = c.y - c.h / 2;

        ctx.shadowBlur = (hot || isRef || (dimSet && focused)) ? 14 : 0;
        ctx.shadowColor = BLOOM;
        ctx.beginPath();
        this._roundRect(ctx, x, y, c.w, c.h, 7);
        ctx.fillStyle = C.cardBG;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = isRef ? C.cardBorderRef : hot ? C.cardBorderHot : C.cardBorder;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Value bar along the card's base — rank context at a glance.
        if (c.value != null) {
          const bw = (Math.abs(c.value) / this.maxValue) * (c.w - 16);
          ctx.fillStyle = C.bar;
          ctx.fillRect(x + 8, y + c.h - 4, Math.max(bw, 1.5), 1.5);
        }

        // Rank index, microscopic, top-left.
        ctx.font = FONT_RANK;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.rank;
        ctx.fillText(String(c.rank).padStart(2, '0'), x + 7, y + 11);

        // Centred title + metric (delta mode when a reference is pinned).
        ctx.textAlign = 'center';
        ctx.font = FONT_TITLE;
        ctx.fillStyle = C.title;
        ctx.fillText(c.title, c.x, c.y - 2.5);
        let metric = c.value != null ? this._fmt(c.value) : c.date || c.category || '';
        if (this.reference && this.reference !== c && c.value != null && this.reference.value != null) {
          const d = c.value - this.reference.value;
          metric = `${d >= 0 ? '+' : '−'}${this._fmt(Math.abs(d))} vs baseline`;
        } else if (isRef) {
          metric = `${this._fmt(c.value ?? 0)} · BASELINE`;
        }
        if (metric) {
          ctx.font = FONT_METRIC;
          ctx.fillStyle = this.reference && !isRef ? C.delta : C.metric;
          ctx.fillText(metric, c.x, c.y + 9.5);
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore(); // end camera transform

      if (this._story && this._story.scene) {
        // Story is presenting — narrate the scene, no interactive overlays.
        const sc = this._story.scene;
        if (sc.card === 'title') this._drawTitleCard(ctx);
        else if (sc.card === 'summary') this._drawSummaryCard(ctx);
        else this._drawCaption(ctx);
      } else if (!this._story) {
        // Drag-to-compare overlay between held and hovered card.
        if (this.drag && this.compare) this._drawCompare(ctx, this.drag, this.compare);
        // Hover tooltip: the full, untruncated card content plus its meaning.
        if (!this.drag && this.hover) this._drawTooltip(ctx, this.hover);
      }
    }

    // Symmetric fade envelope (in → hold → out) across a scene's hold time.
    _sceneAlpha() {
      const st = this._story;
      if (!st) return 1;
      const e = this.t - st.sceneStart;
      const hold = st.hold;
      const edge = Math.min(0.5, hold * 0.32);
      return Math.max(0, Math.min(1, Math.min(e / edge, (hold - e) / edge)));
    }

    // Cinematic lower-third caption: a "why" kicker (insight confidence) plus
    // the insight headline, with a brief centred transition cue as the camera
    // settles. Drawn in screen space so it stays crisp under any zoom.
    _drawCaption(ctx) {
      const st = this._story;
      if (!st || !st.scene) return;
      const W = this.w;
      const H = this.h;
      const elapsed = this.t - st.sceneStart;

      // Brief centred transition cue — the "why we moved here" beat. Fades in,
      // then recedes as the lower-third settles. Minimal, never a giant overlay.
      const tIn = Math.min(elapsed / 0.22, 1);
      const tOut = 1 - Math.min(Math.max((elapsed - 0.85) / 0.4, 0), 1);
      const transA = tIn * tOut;
      if (transA > 0.01 && st.scene.why) {
        ctx.globalAlpha = transA;
        ctx.textAlign = 'center';
        ctx.font = '600 12px "SF Mono", ui-monospace, Menlo, monospace';
        ctx.fillStyle = C.title;
        ctx.fillText(st.scene.why.toUpperCase(), W / 2, H * 0.3 - (1 - tIn) * 8);
        ctx.globalAlpha = 1;
      }

      // Lower-third, fades in slightly after the transition cue.
      const fade = Math.min(Math.max((elapsed - 0.35) / 0.45, 0), 1);
      const grad = ctx.createLinearGradient(0, H - 92, 0, H);
      grad.addColorStop(0, 'rgba(11,11,12,0)');
      grad.addColorStop(1, 'rgba(11,11,12,0.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, H - 92, W, 92);

      ctx.globalAlpha = fade;
      ctx.textAlign = 'left';
      ctx.font = FONT_RANK;
      ctx.fillStyle = C.rank;
      ctx.fillText(
        `SCENE ${st.i} / ${st.content}  ·  ${(st.scene.why || this.sceneTitle(st.scene.type)).toUpperCase()}`,
        30, H - 52
      );
      ctx.font = '600 15px "Inter", -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = C.title;
      const lines = this._wrap(ctx, st.scene.caption, W - 60).slice(0, 2);
      lines.forEach((l, i) => ctx.fillText(l, 30, H - 30 + i * 19 - (lines.length - 1) * 9));

      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
    }

    // Cinematic opening title card: dataset title, type, counts, date —
    // animated in over a ghosted board, faded out elegantly.
    _drawTitleCard(ctx) {
      const a = this._sceneAlpha();
      const W = this.w, H = this.h, cx = W / 2, cy = H / 2;
      ctx.fillStyle = `rgba(11,11,12,${0.86 * a})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      const rise = (1 - Math.min((this.t - this._story.sceneStart) / 0.45, 1)) * 12;

      // Briefing kicker (telemetry-style, letter-spaced mono).
      ctx.font = '600 11px "SF Mono", ui-monospace, Menlo, monospace';
      ctx.fillStyle = C.rank;
      ctx.fillText(this._spaced(this.briefingKicker()), cx, cy - 60 + rise);

      // Hairline section divider beneath the kicker — operations-center polish.
      ctx.globalAlpha = a * 0.5;
      ctx.strokeStyle = C.rank;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 70, cy - 48 + rise);
      ctx.lineTo(cx + 70, cy - 48 + rise);
      ctx.stroke();
      ctx.globalAlpha = a;

      ctx.font = '600 30px "Inter", -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = C.title;
      ctx.fillText(this.storyTitle(), cx, cy - 14 + rise);

      ctx.font = '500 12px "SF Mono", ui-monospace, Menlo, monospace';
      ctx.fillStyle = C.metric;
      ctx.fillText((this._lastClass || this.classify()).label.toUpperCase(), cx, cy + 14 + rise);

      ctx.fillStyle = C.rank;
      const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      const findings = this._story.content;
      ctx.fillText(
        `${this.cards.length} ${this.recordNoun()}  ·  ${findings} finding${findings === 1 ? '' : 's'}  ·  ${date}`,
        cx, cy + 40 + rise
      );
      ctx.globalAlpha = 1;
    }

    // Letter-space a short label for the telemetry/briefing kicker look.
    _spaced(s) {
      return String(s).split('').join(' ');
    }

    // Cinematic closing card: Key Findings, so the story ends on a takeaway.
    _drawSummaryCard(ctx) {
      const a = this._sceneAlpha();
      const W = this.w, H = this.h, cx = W / 2;
      ctx.fillStyle = `rgba(11,11,12,${0.88 * a})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = a;

      const findings = this.summaryFindings();
      const blockH = 40 + findings.length * 26 + 28;
      let y = (H - blockH) / 2 + 20;

      ctx.textAlign = 'center';
      ctx.font = '600 11px "SF Mono", ui-monospace, Menlo, monospace';
      ctx.fillStyle = C.rank;
      ctx.fillText('KEY FINDINGS', cx, y);
      y += 34;

      ctx.textAlign = 'left';
      const lx = Math.max(40, cx - 180);
      ctx.font = '500 14px "Inter", -apple-system, "Segoe UI", sans-serif';
      for (const fnd of findings) {
        ctx.fillStyle = C.metric;
        ctx.fillText('•', lx, y);
        ctx.fillStyle = C.title;
        ctx.fillText(fnd, lx + 18, y);
        y += 26;
      }

      ctx.textAlign = 'center';
      ctx.font = '500 11px "SF Mono", ui-monospace, Menlo, monospace';
      ctx.fillStyle = C.rank;
      ctx.fillText(
        `${(this._lastClass || this.classify()).label.toUpperCase()}  ·  ${this.cards.length} ${this.recordNoun()} analysed`,
        cx, y + 8
      );
      ctx.globalAlpha = 1;
    }

    _wrap(ctx, text, maxW) {
      const words = String(text).split(/\s+/);
      const lines = [];
      let line = '';
      for (const w of words) {
        const probe = line ? `${line} ${w}` : w;
        if (ctx.measureText(probe).width > maxW && line) {
          lines.push(line);
          line = w;
        } else {
          line = probe;
        }
      }
      if (line) lines.push(line);
      return lines.slice(0, 4);
    }

    _drawTooltip(ctx, c) {
      ctx.font = FONT_METRIC;
      const maxW = 250;
      const titleLines = this._wrap(ctx, c.fullTitle, maxW);
      const detail = [];
      if (c.value != null) detail.push(`${this.valueLabel ?? 'Value'}: ${this._fmt(c.value)}`);
      if (c.date) detail.push(`${this.dateKey ? this.dateKey.label : 'Date'}: ${c.date}`);
      if (c.category) detail.push(`${this.catKey ? this.catKey.label : 'Category'}: ${c.category}`);
      detail.push(`Rank ${c.rank} of ${this.cards.length} (${this.modeNoun()})`);
      if (this.reference && this.reference !== c && c.value != null && this.reference.value != null) {
        const d = c.value - this.reference.value;
        detail.push(`${this._fmt(Math.abs(d))} ${d >= 0 ? 'above' : 'below'} “${this.reference.title}”`);
      }

      const lines = [...titleLines, ...detail];
      const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const bw = Math.min(tw, maxW) + 24;
      const bh = lines.length * 14 + 14;
      let bx = c.x - bw / 2;
      let by = c.y + c.h / 2 + 10;
      bx = Math.min(Math.max(bx, 8), this.w - bw - 8);
      if (by + bh > this.h - 8) by = c.y - c.h / 2 - bh - 10;

      ctx.shadowBlur = 18;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.beginPath();
      this._roundRect(ctx, bx, by, bw, bh, 6);
      ctx.fillStyle = C.overlayBG;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = C.cardBorderHot;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.textAlign = 'left';
      lines.forEach((l, i) => {
        ctx.fillStyle = i < titleLines.length ? C.title : C.metric;
        ctx.fillText(l, bx + 12, by + 19 + i * 14);
      });
      ctx.textAlign = 'center';
    }

    modeNoun() {
      return {
        'value-desc': `highest ${this.valueLabel ?? 'value'} first`,
        'value-asc': `lowest ${this.valueLabel ?? 'value'} first`,
        date: 'oldest first',
        label: 'alphabetical',
        category: 'grouped by category',
        shuffle: 'random order',
      }[this.mode];
    }

    _drawCompare(ctx, a, b) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 0.75;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);

      let lines;
      if (a.value != null && b.value != null) {
        const d = a.value - b.value;
        lines = [
          `${a.title}  vs  ${b.title}`,
          `difference: ${d >= 0 ? '+' : '−'}${this._fmt(Math.abs(d))} ${this.valueLabel ? this.valueLabel.toLowerCase() : ''}`.trim(),
        ];
        if (b.value !== 0) {
          lines.push(`${(a.value / b.value).toFixed(2)}× the size of “${b.title}”`);
        }
      } else {
        lines = [`${a.title}  vs  ${b.title}`];
      }

      ctx.font = FONT_METRIC;
      const tw = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const bw = tw + 24;
      const bh = lines.length * 14 + 12;
      let bx = (a.x + b.x) / 2 - bw / 2;
      let by = Math.min(a.y, b.y) - bh - 12;
      bx = Math.min(Math.max(bx, 8), this.w - bw - 8);
      if (by < 8) by = Math.max(a.y, b.y) + 26;

      ctx.shadowBlur = 18;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.beginPath();
      this._roundRect(ctx, bx, by, bw, bh, 6);
      ctx.fillStyle = C.overlayBG;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = C.cardBorderHot;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.textAlign = 'center';
      lines.forEach((l, i) => {
        ctx.fillStyle = i === 0 ? C.metric : C.title;
        ctx.fillText(l, bx + bw / 2, by + 18 + i * 14);
      });
    }

    _roundRect(ctx, x, y, w, h, r) {
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  globalThis.ElleryKinetic = ElleryKinetic;
})();
