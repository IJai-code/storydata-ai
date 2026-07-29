// Left control panel: data ingestion, briefing, local save/load, share
// preview, and export. All gated operations go through the server; this
// module only reflects the session limits in the UI.

import { setState, getState, subscribe } from '../state.js';
import {
  LAYOUTS,
  layoutAllowed,
  exportAllowed,
  isPro,
} from '../tier/gates.js';
import { openPaywall, openPreviewInfo } from '../tier/paywall.js';
import {
  exportCleanCode,
  exportSharePreview,
  getKineticSystem,
} from '../render/canvas.js';
import { exportPNG } from '../render/png.js';
import { exportMP4 } from '../render/video.js';
import { escapeHTML } from '../render/util.js';
import { api } from '../api.js';
import { toast } from './toast.js';

const SAVED_KEY = 'ellery_saved_stories';
const MAX_SAVED = 12;

// Built-in example datasets spanning three domains, so a first-time visitor
// can see that Ellery briefs business, engineering, and scientific data — not
// just one. Each row's date is generated relative to the user's real clock so
// the examples always feel current. Definitions are [label, category, value].
const DEMO_SETS = {
  // Flagship demo: a realistic product catalog with enough breadth to show
  // grouping (category), sizing (revenue), status colour, and auto insights.
  // Provided as full CSV — no per-row date synthesis needed.
  catalog: {
    csv: `SKU,Product,Brand,Category,Price,Cost,Margin,Inventory,Units Sold,Revenue,Supplier,Warehouse,Rating,Reviews,Status
AUD-101,Aura Wireless Earbuds,Sonance,Audio,129,58,71,340,1820,234780,Northwind,WH-East,4.6,1240,In Stock
AUD-102,Pulse Over-Ear Headphones,Sonance,Audio,249,121,128,52,640,159360,Northwind,WH-East,4.4,860,Low Stock
AUD-103,Echo Mini Speaker,Boomly,Audio,79,33,46,0,2100,165900,Castellan,WH-West,4.2,1530,Out of Stock
AUD-104,Bass Mini Soundbar,Boomly,Audio,189,92,97,120,700,132300,Castellan,WH-East,4.3,560,In Stock
WEA-201,Stride Fitness Watch,Vitalo,Wearables,199,90,109,210,1450,288550,Helios,WH-East,4.5,2010,In Stock
WEA-202,Lumen Smart Ring,Vitalo,Wearables,299,140,159,18,320,95680,Helios,WH-Central,4.1,410,Low Stock
WEA-203,Trek GPS Band,Northpeak,Wearables,89,40,49,430,1980,176220,Castellan,WH-West,4.0,990,In Stock
WEA-204,Pace Heart Monitor,Vitalo,Wearables,69,30,39,0,840,57960,Helios,WH-West,4.0,430,Out of Stock
CAM-301,Vista 4K Action Cam,Lenscape,Cameras,349,178,171,76,540,188460,Aperture,WH-Central,4.7,720,In Stock
CAM-302,Pocket Gimbal Pro,Lenscape,Cameras,159,77,82,0,610,96990,Aperture,WH-West,4.3,540,Out of Stock
CAM-303,NightOwl Security Cam,Sentry,Cameras,119,52,67,260,1340,159460,Sentinel,WH-East,4.2,1120,In Stock
CAM-304,Studio Ring Light,Lenscape,Cameras,59,25,34,420,1120,66080,Aperture,WH-Central,4.2,690,In Stock
CMP-401,Glide Wireless Mouse,Kinetix,Computers,49,18,31,620,3100,151900,Orbital,WH-West,4.5,2600,In Stock
CMP-402,Mech Compact Keyboard,Kinetix,Computers,109,49,60,140,880,95920,Orbital,WH-Central,4.6,1340,In Stock
CMP-403,Hyperdock USB-C Hub,Portus,Computers,69,29,40,9,1220,84180,Orbital,WH-East,4.1,760,Low Stock
CMP-404,Nimbus Laptop Stand,Portus,Computers,59,24,35,310,940,55460,Castellan,WH-West,4.4,680,In Stock
SMH-501,Halo Smart Bulb,Lumio,Smart Home,29,11,18,880,4200,121800,Helios,WH-Central,4.3,3100,In Stock
SMH-502,Nest Thermostat Mini,Lumio,Smart Home,149,71,78,64,720,107280,Helios,WH-East,4.5,910,In Stock
SMH-503,Guard Door Sensor,Sentry,Smart Home,39,16,23,0,1500,58500,Sentinel,WH-West,3.9,640,Out of Stock
SMH-504,Breeze Smart Plug,Lumio,Smart Home,19,7,12,1200,3800,72200,Helios,WH-Central,4.2,2400,In Stock
SMH-505,Aura Smart Lock,Sentry,Smart Home,179,86,93,47,520,93080,Sentinel,WH-East,4.6,780,In Stock
ACC-601,Voyage Laptop Sleeve,Carryon,Accessories,45,19,26,540,1600,72000,Orbital,WH-West,4.4,820,In Stock
ACC-602,Summit Travel Backpack,Carryon,Accessories,119,54,65,33,610,72590,Orbital,WH-East,4.7,1450,Low Stock
ACC-603,Anchor Cable Kit,Portus,Accessories,25,9,16,760,2900,72500,Castellan,WH-Central,4.1,1980,In Stock`,
  },
  startup: {
    header: 'milestone,category,date,revenue',
    rows: [
      ['Founding', 'Product', 0],
      ['First paying customer', 'Growth', 290],
      ['Public beta launch', 'Product', 2900],
      ['Press front page', 'Growth', 8700],
      ['Insight Map ships', 'Product', 14500],
      ['First enterprise pilot', 'Sales', 26100],
      ['Viral template run', 'Growth', 40600],
      ['Custom branding', 'Product', 52200],
      ['1,000th subscriber', 'Growth', 71300],
      ['Annual plans launch', 'Sales', 89000],
      ['Year-one retrospective', 'Product', 104400],
      ['Mobile beta', 'Product', 121800],
    ],
  },
  mission: {
    header: 'component,subsystem,review_date,readiness',
    rows: [
      ['Power distribution bus', 'Power', 96],
      ['Battery management', 'Power', 88],
      ['Thermal control loop', 'Thermal', 74],
      ['Cooling pump array', 'Thermal', 61],
      ['Primary control firmware', 'Avionics', 92],
      ['Sensor fusion module', 'Avionics', 70],
      ['Comms link', 'Comms', 83],
      ['Telemetry encoder', 'Comms', 79],
      ['Structural frame', 'Structures', 99],
      ['Actuator bank', 'Mechanical', 54],
      ['Safety interlocks', 'Safety', 90],
      ['Diagnostics suite', 'Avionics', 47],
    ],
  },
  research: {
    header: 'sample,condition,date,measurement',
    rows: [
      ['Catalyst A-1', 'Treatment', 82.4],
      ['Catalyst A-2', 'Treatment', 79.1],
      ['Catalyst B-1', 'Treatment', 91.7],
      ['Catalyst B-2', 'Treatment', 88.3],
      ['Baseline 01', 'Control', 50.2],
      ['Baseline 02', 'Control', 48.9],
      ['Baseline 03', 'Control', 51.6],
      ['Catalyst C-1', 'Treatment', 64.0],
      ['Catalyst C-2', 'Treatment', 66.8],
      ['Elevated temp run', 'Stress', 73.5],
      ['Extended exposure', 'Stress', 69.2],
      ['Repeat verification', 'Control', 49.7],
    ],
  },
};

function buildDemoCSV(key = 'catalog') {
  const set = DEMO_SETS[key] || DEMO_SETS.catalog;
  // Full-CSV demos (e.g. the product catalog) ship verbatim.
  if (set.csv) return set.csv;
  const now = new Date();
  const last = set.rows.length - 1;
  const lines = set.rows.map(([label, category, value], i) => {
    // One row per month across the trailing year; the last lands on today.
    const day = i === last ? now.getDate() : Math.min(((i * 7) % 27) + 1, 28);
    const d = new Date(now.getFullYear(), now.getMonth() - (last - i), i === last ? now.getDate() : day);
    const iso = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    ].join('-');
    const name = label.includes(',') ? `"${label}"` : label;
    return `${name},${category},${iso},${value}`;
  });
  return `${set.header}\n${lines.join('\n')}`;
}

let ingesting = false;

export function initPanel() {
  wireIngestion();
  wireStory();
  wireSaveShareExport();
  wireTierControls();

  subscribe((state, changed) => {
    if (changed.includes('tier') || changed.includes('limits')) {
      syncLocks();
      reingestAfterUpgrade(state);
    }
    if (changed.includes('dataset')) {
      renderSchemaChips(state.dataset);
      // A fresh dataset invalidates the old story's scene choices.
      if (state.story) setState({ story: null });
    }
    if (changed.includes('story')) renderStoryList();
  });
  syncLocks();
  renderSavedList();
  renderStoryList();
}

// Restore a saved case by id (used by the Cases dashboard via ?case=). Called
// from app boot AFTER the session resolves, so a Pro-only saved lens (e.g. the
// Insight Map) is allowed when we set it rather than downgraded to the default.
export function openSavedCase(id) {
  loadStory(Number(id));
}

/* ---------- Ingestion ---------- */

function wireIngestion() {
  const rawInput = document.getElementById('rawInput');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  document.getElementById('visualizeBtn').addEventListener('click', () => {
    runIngest(rawInput.value);
  });
  document.querySelectorAll('[data-demo]').forEach((btn) =>
    btn.addEventListener('click', () => loadDemo(btn.dataset.demo))
  );
  document.getElementById('fileBtn').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) readFile(file, rawInput);
    fileInput.value = '';
  });

  ['dragover', 'dragenter'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    })
  );
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files?.[0];
    if (file) {
      readFile(file, rawInput);
    } else {
      const text = e.dataTransfer.getData('text/plain');
      if (text) {
        rawInput.value = text;
        runIngest(text);
      }
    }
  });
}

function readFile(file, rawInput) {
  const reader = new FileReader();
  reader.onload = () => {
    rawInput.value = String(reader.result);
    runIngest(rawInput.value);
  };
  reader.onerror = () => toast('Could not read that file.', 'error');
  reader.readAsText(file);
}

async function runIngest(raw, { quiet = false } = {}) {
  if (ingesting) return;
  if (!raw || !raw.trim()) {
    toast('Load data first.', 'warn');
    return;
  }

  ingesting = true;
  const btn = document.getElementById('visualizeBtn');
  btn.disabled = true;
  try {
    const result = await api.ingest(raw);
    if (!result.ok) {
      toast(result.error || 'Could not ingest that input.', 'error');
      return;
    }

    setState({ dataset: result.dataset });

    const { dataset } = result;
    // Success is visible — the findings render. Only ingest warnings (things
    // the screen can't otherwise show) get announced.
    if (!quiet) {
      for (const w of (result.warnings || []).slice(0, 2)) toast(w, 'warn');
    }

    if (dataset.truncated) {
      openPaywall('row-cap', { totalRows: dataset.meta.totalRows });
    }
  } finally {
    ingesting = false;
    btn.disabled = false;
  }
}

// After an upgrade, silently re-ingest so the previously capped dataset
// comes back from the server in full.
function reingestAfterUpgrade(state) {
  const raw = document.getElementById('rawInput').value;
  if (isPro() && state.dataset?.truncated && raw.trim()) {
    runIngest(raw, { quiet: true });
    toast('Re-processing your full dataset — no more row cap.');
  }
}

export function loadDemo(key = 'catalog') {
  const csv = buildDemoCSV(key);
  document.getElementById('rawInput').value = csv;
  runIngest(csv);
}

function renderSchemaChips(dataset) {
  const el = document.getElementById('schemaChips');
  if (!dataset) {
    el.innerHTML = '';
    return;
  }
  const chips = [
    `<span class="chip chip-count"><strong>${dataset.rows.length}</strong> records</span>`,
    ...(dataset.truncated
      ? [`<span class="chip chip-warn">capped from ${dataset.meta.totalRows}</span>`]
      : []),
    ...dataset.columns
      .slice(0, 6)
      .map((c) => `<span class="chip"><strong>${c.label}</strong> · ${c.type}</span>`),
  ];
  if (dataset.columns.length > 6) {
    chips.push(`<span class="chip">+${dataset.columns.length - 6} more</span>`);
  }
  el.innerHTML = chips.join('');
}

/* ---------- Data Story Mode ----------
 * Story Mode is a Kinetic Rank capability (per CLAUDE.md, the rank board owns
 * "sorting stories"). Generating a story routes the canvas to Kinetic Rank,
 * auto-builds a scene sequence from the live engine, and lets the user
 * reorder / add / delete scenes before playing or exporting them.
 */

const SCENE_LABEL = {
  'overview|all': 'Overview',
  'spotlight|max-value': 'Spotlight · highest',
  'spotlight|min-value': 'Spotlight · lowest',
  'spotlight|newest': 'Spotlight · most recent',
  'spotlight|oldest': 'Spotlight · earliest',
  'comparison|extremes': 'Compare · top vs bottom',
  'comparison|top-two': 'Compare · top two',
  'group|largest-category': 'Group · largest category',
  'summary|all': 'Summary',
};

function sceneLabel(scene) {
  // Strategy builders attach an explicit title; fall back to the ranked-mode
  // map, then to a humanised type.
  return (
    scene.title ||
    SCENE_LABEL[`${scene.type}|${scene.sel}`] ||
    (scene.type ? scene.type.charAt(0).toUpperCase() + scene.type.slice(1) : 'Scene')
  );
}

function wireStory() {
  document.getElementById('storyGenBtn').addEventListener('click', generateStory);

  document.getElementById('storyPlayBtn').addEventListener('click', () => {
    const sys = getKineticSystem();
    if (!sys) {
      toast('Switch to Kinetic Rank to play your story.', 'warn');
      return;
    }
    if (sys.storyPlaying()) {
      sys.stopStory();
      setStoryPlayingUI(false);
      return;
    }
    const scenes = getState().story?.scenes || [];
    if (!scenes.length) return;
    sys.onstoryinterrupt = () => setStoryPlayingUI(false);
    sys.playStory(scenes, {
      onScene: (i, scene, total) => {
        if (i >= total - 1) {
          // Last scene: flip the button back once it finishes holding.
          setTimeout(() => { if (!sys.storyPlaying()) setStoryPlayingUI(false); }, 2600);
        }
      },
    });
    setStoryPlayingUI(true);
  });

  // Manual "Add Scene" was removed (Phase 5.5, Option B): auto-generation
  // already produces strong, type-aware stories, so the simplest authoring
  // surface is Generate + reorder + remove. No internal scene jargon exposed.

  document.getElementById('storyList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-story-action]');
    if (!btn) return;
    const i = Number(btn.closest('[data-scene]').dataset.scene);
    const scenes = [...(getState().story?.scenes || [])];
    const action = btn.dataset.storyAction;
    if (action === 'up' && i > 0) [scenes[i - 1], scenes[i]] = [scenes[i], scenes[i - 1]];
    else if (action === 'down' && i < scenes.length - 1) [scenes[i + 1], scenes[i]] = [scenes[i], scenes[i + 1]];
    else if (action === 'del') scenes.splice(i, 1);
    const cur = getState().story;
    setState({ story: scenes.length ? { ...cur, scenes } : null });
  });
}

async function generateStory() {
  if (!getState().dataset) {
    toast('Load data first.', 'warn');
    return;
  }
  // Story Mode lives on Kinetic Rank — route there if needed, then build.
  if (getState().layout !== 'kinetic') {
    setState({ layout: 'kinetic' });
    await new Promise((r) => setTimeout(r, 420));
  }
  const sys = getKineticSystem();
  if (!sys) {
    toast('Could not start the briefing engine — try again.', 'error');
    return;
  }
  const scenes = sys.autoStory();
  const cls = sys.classify();
  // The scene list appearing in the panel is the confirmation.
  setState({ story: { scenes, type: { label: cls.label, reason: cls.reason } } });
}

function setStoryPlayingUI(playing) {
  const btn = document.getElementById('storyPlayBtn');
  if (btn) btn.textContent = playing ? 'Stop' : 'Play briefing';
}

function renderStoryList() {
  const list = document.getElementById('storyList');
  const actions = document.getElementById('storyActions');
  const typeEl = document.getElementById('storyType');
  if (!list) return;
  const story = getState().story;
  const scenes = story?.scenes || [];
  actions.hidden = scenes.length === 0;
  if (typeEl) {
    if (scenes.length && story.type) {
      typeEl.hidden = false;
      typeEl.innerHTML = `<span class="story-type-label">${escapeHTML(story.type.label)}</span>${escapeHTML(story.type.reason)}`;
    } else {
      typeEl.hidden = true;
      typeEl.innerHTML = '';
    }
  }
  if (!scenes.length) {
    list.innerHTML = '';
    setStoryPlayingUI(false);
    return;
  }
  list.innerHTML = scenes
    .map(
      (s, i) => `
      <div class="story-scene" data-scene="${i}">
        <span class="story-idx">${i + 1}</span>
        <span class="story-name">${sceneLabel(s)}</span>
        <span class="story-ctrls">
          <button data-story-action="up" aria-label="Move up" title="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button data-story-action="down" aria-label="Move down" title="Move down" ${i === scenes.length - 1 ? 'disabled' : ''}>↓</button>
          <button data-story-action="del" aria-label="Delete scene" title="Delete">✕</button>
        </span>
      </div>`
    )
    .join('');
}

/* ---------- Save locally / share / export ---------- */

function wireSaveShareExport() {
  document.getElementById('saveBtn').addEventListener('click', saveStory);

  document.getElementById('shareBtn').addEventListener('click', async () => {
    if (!getState().dataset) {
      toast('Load data first.', 'warn');
      return;
    }
    const btn = document.getElementById('shareBtn');
    btn.disabled = true;
    try {
      // The browser's own download surface confirms success.
      const result = await exportSharePreview();
      if (!result.ok) toast(result.error || 'Share failed.', 'error');
    } finally {
      btn.disabled = false;
    }
  });

  const mp4Btn = document.getElementById('mp4Btn');
  mp4Btn.addEventListener('click', async () => {
    if (!getState().dataset) {
      toast('Load data first.', 'warn');
      return;
    }
    const story = getState().story?.scenes || null;
    if (story && getState().layout !== 'kinetic') {
      toast('Switch to Kinetic Rank to record your Data Story.', 'warn');
      return;
    }
    mp4Btn.disabled = true;
    const original = mp4Btn.textContent;
    mp4Btn.textContent = story ? 'Recording briefing…' : 'Recording…';
    try {
      const result = await exportMP4(document.getElementById('canvas'), { story });
      if (result.ok) {
        // Safari/Firefox can't record H.264; WebM won't drop into Keynote or
        // PowerPoint directly, so flag it rather than letting the import fail.
        if (result.format === 'webm') {
          toast('Saved as WebM. Google Slides accepts it; PowerPoint and Keynote need MP4 (use Chrome).', 'warn', 6500);
        }
      } else {
        toast(result.error || 'Recording failed.', 'error');
      }
    } finally {
      mp4Btn.disabled = false;
      mp4Btn.textContent = original;
    }
  });

  const linkBtn = document.getElementById('linkBtn');
  linkBtn.addEventListener('click', async () => {
    if (!exportAllowed()) {
      openPaywall('interactive');
      return;
    }
    const { dataset, layout } = getState();
    if (!dataset) {
      toast('Load data first.', 'warn');
      return;
    }
    linkBtn.disabled = true;
    try {
      const result = await api.exportInteractive({ dataset });
      if (!result.ok) {
        if (result.status === 403) openPaywall('interactive');
        else toast(result.error || 'Interactive export failed.', 'error');
        return;
      }
      const blob = new Blob([result.text], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ellery-${layout}-briefing.html`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } finally {
      linkBtn.disabled = false;
    }
  });

  const pngBtn = document.getElementById('pngBtn');
  pngBtn.addEventListener('click', async () => {
    if (!getState().dataset) {
      toast('Load data first.', 'warn');
      return;
    }
    pngBtn.disabled = true;
    try {
      const result = await exportPNG(document.getElementById('canvas'));
      if (!result.ok) toast(result.error || 'Image export failed.', 'error');
    } finally {
      pngBtn.disabled = false;
    }
  });

  const exportBtn = document.getElementById('exportBtn');
  exportBtn.addEventListener('click', async () => {
    if (!exportAllowed()) {
      openPaywall('export');
      return;
    }
    if (!getState().dataset) {
      toast('Load data first.', 'warn');
      return;
    }
    exportBtn.disabled = true;
    try {
      const result = await exportCleanCode();
      if (result.status === 403) {
        openPaywall('export');
      } else if (!result.ok) {
        toast(result.error || 'Export failed.', 'error');
      }
    } finally {
      exportBtn.disabled = false;
    }
  });

  document.getElementById('savedList').addEventListener('click', (e) => {
    const item = e.target.closest('[data-saved-id]');
    if (!item) return;
    const id = Number(item.dataset.savedId);
    if (e.target.closest('[data-action="delete-saved"]')) {
      deleteStory(id);
    } else {
      loadStory(id);
    }
  });
}

function readSaved() {
  try {
    const list = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeSaved(list) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
    return true;
  } catch {
    toast('Could not save — local storage is full.', 'error');
    return false;
  }
}

function saveStory() {
  const { dataset, layout } = getState();
  if (!dataset) {
    toast('Load data first.', 'warn');
    return;
  }
  const list = readSaved();
  if (list.length >= MAX_SAVED) {
    toast(`Saved stories are capped at ${MAX_SAVED} — delete one to make room.`, 'warn');
    return;
  }
  const story = getState().story;
  const entry = {
    id: Date.now(),
    name: `${LAYOUTS[layout].name} · ${dataset.rows.length} records${
      story?.scenes?.length ? ` · ${story.scenes.length}-scene story` : ''
    }`,
    savedAt: new Date().toISOString(),
    layout,
    dataset,
    story: story?.scenes?.length ? story : null,
  };
  // The entry appearing in the saved list below the button is the confirmation.
  if (writeSaved([entry, ...list])) renderSavedList();
}

function loadStory(id) {
  const entry = readSaved().find((s) => s.id === id);
  if (!entry) return;
  const layout = layoutAllowed(entry.layout) ? entry.layout : 'kinetic';
  // Setting the dataset clears any in-flight story (see the subscribe handler),
  // so restore the saved scenes on the next tick — after that clear and after
  // the kinetic engine has remounted.
  setState({ dataset: entry.dataset, layout });
  if (entry.story?.scenes?.length) {
    setTimeout(() => setState({ story: entry.story }), 0);
  }
}

function deleteStory(id) {
  const list = readSaved().filter((s) => s.id !== id);
  writeSaved(list);
  renderSavedList();
}

function renderSavedList() {
  const el = document.getElementById('savedList');
  const list = readSaved();
  if (!list.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = list
    .map(
      (s) => `
      <div class="saved-item" data-saved-id="${s.id}" role="button" tabindex="0"
           title="Load this saved story">
        <span class="saved-name">${escapeHTML(s.name)}</span>
        <span class="saved-date">${new Date(s.savedAt).toLocaleDateString()}</span>
        <button class="saved-delete" data-action="delete-saved" aria-label="Delete saved story">✕</button>
      </div>`
    )
    .join('');
}

/* ---------- Tier UI sync ---------- */

function wireTierControls() {
  // The topbar pill now surfaces the Early Access info for every tier.
  document.getElementById('upgradeBtn').addEventListener('click', () => {
    openPreviewInfo();
  });
}

function syncLocks() {
  const pro = isPro();
  // A downgrade must not leave a Pro lens live on the canvas — fall back to
  // the Case File, which is never gated.
  if (!layoutAllowed(getState().layout)) setState({ layout: 'findings' });
  // The topbar tier badge was removed during the preview (everyone is Pro);
  // guard so this keeps working if it ever returns.
  const badge = document.getElementById('tierBadge');
  if (badge) {
    badge.textContent = pro ? 'PRO' : 'FREE';
    badge.className = `tier-badge ${pro ? 'pro' : 'free'}`;
  }
  // The upgrade CTA is now a static "Included in Preview" status pill, so it
  // stays visible in every tier during the Early Access period.
  document.getElementById('upgradeBtn').style.display = '';
}
