// Left control panel: data ingestion, layout picker, Live Simulation toggle,
// local save/load, share preview, and export.
// All gated operations go through the server; this module only reflects
// the session limits in the UI.

import { setState, getState, subscribe } from '../state.js';
import {
  LAYOUTS,
  layoutAllowed,
  exportAllowed,
  simulationAllowed,
  isPro,
} from '../tier/gates.js';
import { openPaywall } from '../tier/paywall.js';
import {
  exportCleanCode,
  exportSharePreview,
  simulationSupported,
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

function buildDemoCSV(key = 'startup') {
  const set = DEMO_SETS[key] || DEMO_SETS.startup;
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
  buildLayoutPicker();
  wireStory();
  wireSimulation();
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
    if (changed.includes('layout') || changed.includes('simulation')) {
      markActiveLayout(state.layout);
      syncSimToggle();
    }
  });
  syncLocks();
  renderSavedList();
  renderStoryList();
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
    toast('Nothing to ingest — paste some data first.', 'warn');
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
    if (!quiet) {
      toast(
        `${dataset.rows.length}${
          dataset.truncated ? ` of ${dataset.meta.totalRows}` : ''
        } rows ingested · ${dataset.columns.length} columns detected.`
      );
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

export function loadDemo(key = 'startup') {
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
    `<span class="chip chip-count"><strong>${dataset.rows.length}</strong> rows</span>`,
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

/* ---------- Layout picker ---------- */

function buildLayoutPicker() {
  const grid = document.getElementById('layoutGrid');
  grid.innerHTML = Object.entries(LAYOUTS)
    .map(
      ([key, meta]) => `
      <button class="layout-card${meta.pro ? ' locked' : ''}" data-layout="${key}">
        ${meta.pro ? '<span class="lock">PRO</span>' : ''}
        <span class="layout-icon">${meta.icon}</span>
        <span class="layout-name">${meta.name}</span>
        <span class="layout-desc">${meta.desc}</span>
      </button>`
    )
    .join('');

  grid.addEventListener('click', (e) => {
    const card = e.target.closest('[data-layout]');
    if (!card) return;
    const key = card.dataset.layout;
    if (!layoutAllowed(key)) {
      openPaywall('layout-locked');
      return;
    }
    setState({ layout: key });
  });

  markActiveLayout(getState().layout);
}

function markActiveLayout(layout) {
  document.querySelectorAll('.layout-card').forEach((el) => {
    el.classList.toggle('active', el.dataset.layout === layout);
  });
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
    toast('Ingest some data first — there is nothing to brief on yet.', 'warn');
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
  setState({ story: { scenes, type: { label: cls.label, reason: cls.reason } } });
  toast(`${cls.label} detected — ${scenes.length}-scene briefing. Press Play or export an MP4.`);
}

function setStoryPlayingUI(playing) {
  const btn = document.getElementById('storyPlayBtn');
  if (btn) btn.textContent = playing ? '■ Stop' : '▶ Play briefing';
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

/* ---------- Live Simulation Mode (Pro) ---------- */

function wireSimulation() {
  document.getElementById('simToggle').addEventListener('click', () => {
    if (!simulationAllowed()) {
      openPaywall('simulation');
      return;
    }
    const next = !getState().simulation;
    setState({ simulation: next });
    if (next && !simulationSupported(getState().layout)) {
      toast('Pulses flow on the Mindmap and Timeline layouts — switch to one to see them.', 'warn');
    }
  });
  syncSimToggle();
}

function syncSimToggle() {
  const btn = document.getElementById('simToggle');
  const { simulation, layout } = getState();
  btn.classList.toggle('active', simulation);
  btn.querySelector('.sim-label').textContent = simulation
    ? simulationSupported(layout)
      ? 'Pulses live — data is flowing'
      : 'Armed — switch to Mindmap or Timeline'
    : 'Send live pulses through the story';
}

/* ---------- Save locally / share / export ---------- */

function wireSaveShareExport() {
  document.getElementById('saveBtn').addEventListener('click', saveStory);

  document.getElementById('shareBtn').addEventListener('click', async () => {
    if (!getState().dataset) {
      toast('Ingest some data first — there is nothing to share yet.', 'warn');
      return;
    }
    const btn = document.getElementById('shareBtn');
    btn.disabled = true;
    try {
      const result = await exportSharePreview();
      if (result.ok) {
        toast('Share preview downloaded — post it anywhere.');
      } else {
        toast(result.error || 'Share failed.', 'error');
      }
    } finally {
      btn.disabled = false;
    }
  });

  const mp4Btn = document.getElementById('mp4Btn');
  mp4Btn.addEventListener('click', async () => {
    if (!getState().dataset) {
      toast('Ingest some data first — there is nothing to record yet.', 'warn');
      return;
    }
    const story = getState().story?.scenes || null;
    if (story && getState().layout !== 'kinetic') {
      toast('Switch to Kinetic Rank to record your Data Story.', 'warn');
      return;
    }
    mp4Btn.disabled = true;
    const original = mp4Btn.textContent;
    mp4Btn.textContent = story ? 'Recording your briefing…' : 'Recording 3s of physics…';
    try {
      const result = await exportMP4(document.getElementById('canvas'), { story });
      if (result.ok) {
        toast(
          `${result.format.toUpperCase()} ${story ? 'briefing ' : ''}captured${
            result.stamped ? ' — stamped with Ellery attribution.' : ' — clean, deck-ready.'
          }`
        );
        // Safari/Firefox can't record H.264; WebM won't drop into Keynote or
        // PowerPoint directly, so flag it rather than letting the import fail.
        if (result.format === 'webm') {
          toast('Heads up: this browser saved WebM — Google Slides accepts it, but Keynote/PowerPoint need an MP4 (try Chrome or convert it).', 'warn', 6500);
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
      toast('Ingest some data first — there is nothing to export yet.', 'warn');
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
      toast('Interactive briefing exported — host or embed it anywhere.');
    } finally {
      linkBtn.disabled = false;
    }
  });

  const pngBtn = document.getElementById('pngBtn');
  pngBtn.addEventListener('click', async () => {
    if (!getState().dataset) {
      toast('Ingest some data first — there is nothing to export yet.', 'warn');
      return;
    }
    pngBtn.disabled = true;
    try {
      const result = await exportPNG(document.getElementById('canvas'));
      if (result.ok) {
        toast(
          isPro()
            ? 'PNG exported — drop it straight into your deck.'
            : 'PNG exported — stamped with Ellery attribution.'
        );
      } else {
        toast(result.error || 'PNG export failed.', 'error');
      }
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
      toast('Ingest some data first — there is nothing to export yet.', 'warn');
      return;
    }
    exportBtn.disabled = true;
    try {
      const result = await exportCleanCode();
      if (result.ok) {
        toast('Clean code exported — embed it anywhere.');
      } else if (result.status === 403) {
        openPaywall('export');
      } else {
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
    toast('Ingest some data first — there is nothing to save yet.', 'warn');
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
    name: `${LAYOUTS[layout].name} · ${dataset.rows.length} rows${
      story?.scenes?.length ? ` · ${story.scenes.length}-scene story` : ''
    }`,
    savedAt: new Date().toISOString(),
    layout,
    dataset,
    story: story?.scenes?.length ? story : null,
  };
  if (writeSaved([entry, ...list])) {
    renderSavedList();
    toast(story?.scenes?.length ? 'Briefing saved on this device.' : 'Saved on this device.');
  }
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
  toast(`Loaded “${entry.name}”.`);
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
  document.getElementById('upgradeBtn').addEventListener('click', () => {
    if (!isPro()) openPaywall('upgrade');
  });
}

function syncLocks() {
  const pro = isPro();
  // A downgrade must not leave a Pro layout live on the canvas.
  if (!layoutAllowed(getState().layout)) setState({ layout: 'kinetic' });
  if (getState().simulation && !simulationAllowed()) setState({ simulation: false });
  const badge = document.getElementById('tierBadge');
  badge.textContent = pro ? 'PRO' : 'FREE';
  badge.className = `tier-badge ${pro ? 'pro' : 'free'}`;
  document.getElementById('upgradeBtn').style.display = pro ? 'none' : '';
}
