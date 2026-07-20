// The Findings view — Ellery's home surface and the point of the product.
//
// This is NOT a visualization. It is the Case File: the Discovery Engine's
// ranked conclusions about the dataset, in plain language. Every finding is an
// object you can PULL — click it and the Case File descends into the finding,
// peeling from claim → evidence → the exact rows and cells behind it, then out
// into any lens with those rows spotlighted. The engine runs client-side
// (deterministic, free); the Pull only traverses what it already produced.

import { getState } from '../../state.js';
import {
  buildReport,
  resolveFocus,
  explain,
  provenanceOf,
  snapshotOf,
  rowFingerprint,
} from '../pull.js';
import { formatValue, escapeHTML } from '../util.js';

const TONE_CLASS = { ok: 'good', warn: 'warn', critical: 'bad', neutral: 'neutral' };

// Lenses offered from a trace, ordered by how well each inspects the evidence.
const LENSES = [
  ['map', 'Insight Map'],
  ['cards', 'Cards'],
  ['timeline', 'Timeline'],
  ['nodes', 'Mindmap'],
  ['kinetic', 'Kinetic Rank'],
];

export function render(container, dataset) {
  const report = buildReport(dataset);
  const focus = getState().focus;

  // A finding is being pulled — descend into it instead of listing all.
  if (focus && report.discoveries.some((d) => d.id === focus.id)) {
    container.appendChild(renderTrace(focus, dataset, report));
    return () => {};
  }

  container.appendChild(renderList(report));
  return () => {};
}

/* ---------- The Case File: the ranked findings ---------- */

function renderList(report) {
  const { discoveries, domain, meta } = report;
  const root = document.createElement('div');
  root.className = 'casefile';

  const lead = discoveries[0];
  const checks = meta.detectors.length;
  const rest = discoveries.slice(1);

  root.innerHTML = `
    <header class="case-header">
      <div class="case-kicker">Case file · ${escapeHTML(domain.label)}</div>
      ${lead
        ? `<button class="case-headline case-pull" data-pull="${escapeAttr(lead.id)}">
             ${escapeHTML(lead.summary || lead.title)}
             <span class="pull-cue" aria-hidden="true">Trace ↓</span>
           </button>`
        : `<h1 class="case-headline">Nothing urgent stands out — the data reads as steady.</h1>`}
      <p class="case-meta">${meta.rowCount} records · ${meta.columnCount} fields ·
        ${checks} ${checks === 1 ? 'check' : 'checks'} run · deterministic</p>
    </header>
    ${rest.length
      ? `<ol class="case-findings">${rest.map(findingRow).join('')}</ol>`
      : (lead ? '' : `<p class="case-empty">Add a numeric, date, or status column and Ellery
          will have something to reason about.</p>`)}`;
  return root;
}

function findingRow(d) {
  const cls = TONE_CLASS[d.metadata.tone] || 'neutral';
  return `
    <li class="finding finding-${cls} case-pull" data-pull="${escapeAttr(d.id)}">
      <span class="finding-dot"></span>
      <span class="finding-body">
        <span class="finding-title">${escapeHTML(d.title)}</span>
        <span class="finding-text">${escapeHTML(d.summary)}</span>
      </span>
      <span class="pull-cue" aria-hidden="true">Trace ↓</span>
    </li>`;
}

/* ---------- The Trace: one finding, followed all the way down ---------- */

function renderTrace(focus, dataset, report) {
  const d = report.discoveries.find((x) => x.id === focus.id);
  const roles = report.profile.roles;
  const labelCol = roles.label;
  const colByKey = Object.fromEntries(dataset.columns.map((c) => [c.key, c]));
  const cls = TONE_CLASS[focus.tone] || 'neutral';
  const snapshot = snapshotOf(dataset);
  const prov = provenanceOf(d, report);

  const root = document.createElement('div');
  root.className = 'casefile trace';

  const because = explain(focus);
  const evidenceFields = Object.entries(focus.evidence)
    .filter(([, v]) => v != null && typeof v !== 'object')
    .map(([k, v]) => `<div class="ev-field"><span class="ev-k">${escapeHTML(k)}</span>
      <span class="ev-v">${escapeHTML(typeof v === 'number' ? formatValue(v, 'number') : String(v))}</span></div>`)
    .join('');

  // The rows layer descends one step further: each record opens to its full raw
  // cells and its own fingerprint — the addressable ground of the finding.
  const cap = 40;
  const decisive = new Set(focus.columns);
  const rowsHTML = focus.rowIndices
    .slice(0, cap)
    .map((i) => {
      const row = dataset.rows[i];
      if (!row) return '';
      const name = labelCol ? escapeHTML(formatValue(row[labelCol.key], labelCol.type)) : `Row ${i + 1}`;
      const decisiveCells = [...decisive]
        .map((key) => {
          const c = colByKey[key];
          if (!c) return '';
          return `<span class="trace-cell"><span class="tc-k">${escapeHTML(c.label)}</span>
            <span class="tc-v">${escapeHTML(formatValue(row[key], c.type))}</span></span>`;
        })
        .join('');
      const fp = rowFingerprint(dataset, i);
      const rawCells = dataset.columns
        .map(
          (c) => `<div class="raw-cell${decisive.has(c.key) ? ' is-decisive' : ''}">
            <dt>${escapeHTML(c.label)}</dt><dd>${escapeHTML(formatValue(row[c.key], c.type))}</dd></div>`
        )
        .join('');
      return `
        <li class="trace-row" data-idx="${i}">
          <button class="trace-row-head" type="button" aria-expanded="false">
            <span class="trace-name">${name}</span>
            ${decisiveCells}
            <span class="trace-fp" title="row fingerprint">${fp}</span>
          </button>
          <dl class="trace-raw" hidden>
            ${rawCells}
            <div class="raw-origin">cell address · snapshot ${snapshot.fingerprint} · row ${fp}</div>
          </dl>
        </li>`;
    })
    .join('');
  const more = focus.rowIndices.length > cap
    ? `<li class="trace-more">+${focus.rowIndices.length - cap} more records</li>`
    : '';

  const rowsLabel = focus.scope === 'row'
    ? 'The record'
    : focus.scope === 'dataset'
      ? `All ${focus.rowIndices.length} records`
      : `${focus.rowIndices.length} records`;

  root.innerHTML = `
    <button class="trace-back" data-pull-clear>‹ All findings</button>

    <div class="trace-rail">
      <div class="trace-layer trace-claim">
        <span class="trace-step">Finding</span>
        <span class="trace-title">${escapeHTML(focus.title)}</span>
        <p class="trace-summary">${escapeHTML(focus.summary)}</p>
      </div>

      <div class="trace-layer">
        <span class="trace-step">Evidence</span>
        ${because ? `<p class="trace-because">${escapeHTML(because)}</p>` : ''}
        <div class="ev-fields">${evidenceFields}</div>
      </div>

      <div class="trace-layer">
        <span class="trace-step">Derivation</span>
        <p class="trace-formula">${escapeHTML(prov.derivation)}</p>
      </div>

      <div class="trace-layer">
        <span class="trace-step">Policy</span>
        <p class="trace-rule">${escapeHTML(prov.policy.rule)}</p>
        <div class="policy-meta">
          ${prov.policy.params ? `<span class="policy-param">${escapeHTML(prov.policy.params)}</span>` : ''}
          <span class="policy-source">${escapeHTML(prov.policy.source)}</span>
        </div>
      </div>

      <div class="trace-layer">
        <span class="trace-step">Confidence</span>
        <p class="trace-conf"><span class="conf-value">${prov.confidence.value.toFixed(2)}</span>
          <span class="conf-note">${escapeHTML(prov.confidence.note)}</span></p>
      </div>

      <div class="trace-layer">
        <span class="trace-step">${escapeHTML(rowsLabel)} <span class="trace-hint">— open a record for its raw cells</span></span>
        <ol class="trace-rows">${rowsHTML}${more}</ol>
      </div>

      <div class="trace-layer trace-ground">
        <span class="trace-step">Ground</span>
        <p class="ground-line">Fingerprinted snapshot — the reproducible floor of this finding.</p>
        <dl class="ground-fields">
          <div><dt>snapshot</dt><dd>${snapshot.fingerprint}</dd></div>
          <div><dt>schema</dt><dd>${snapshot.schemaHash}</dd></div>
          <div><dt>shape</dt><dd>${snapshot.rowCount} × ${snapshot.columnCount} · ${escapeHTML(snapshot.format)}${snapshot.truncated ? ` · capped from ${snapshot.totalRows}` : ''}</dd></div>
          <div><dt>engine</dt><dd>v${escapeHTML(snapshot.engineVersion)}</dd></div>
          <div><dt>policy</dt><dd>v${escapeHTML(snapshot.policyVersion)}</dd></div>
        </dl>
        <p class="ground-law">Conclusion = f( evidence, policy ). Re-run this snapshot under the
          same policy and the finding reproduces exactly.</p>
      </div>
    </div>

    <div class="trace-lenses">
      <span class="trace-lenses-label">See it plotted</span>
      <div class="case-lens-row">
        ${LENSES.map(([key, name]) => `<button class="case-lens" data-goto-layout="${key}">${name}</button>`).join('')}
      </div>
    </div>`;

  // Records open in place to reveal their raw cells — the last step of the Pull.
  root.querySelector('.trace-rows')?.addEventListener('click', (e) => {
    const head = e.target.closest('.trace-row-head');
    if (!head) return;
    const raw = head.nextElementSibling;
    const open = raw.hidden;
    raw.hidden = !open;
    head.setAttribute('aria-expanded', String(open));
    head.closest('.trace-row').classList.toggle('open', open);
  });

  return root;
}

// Attribute-safe escape (util.escapeHTML doesn't cover quotes).
function escapeAttr(s) {
  return escapeHTML(String(s)).replace(/"/g, '&quot;');
}
