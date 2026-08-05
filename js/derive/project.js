// Projection: turning a justification into what a renderer needs.
//
// Two jobs, both generic. (1) Project a semantic witness onto the current
// snapshot — records are addressed by fingerprint, so the row *indices* a lens
// highlights are computed here and never stored in the graph. (2) Render the
// derivation and the plain-English "because" line from op-keyed templates.
//
// The templates dispatch on the operation (a closed algebra) rather than on the
// detector (an open vocabulary). Ten new detectors that rank, count or compare
// add zero entries here; only a genuinely new kind of math does.

import { formatNumber } from '../discovery/index.js';
import { rowFingerprint } from './fingerprint.js';

const num = (v) => (typeof v === 'number' ? formatNumber(v) : String(v ?? '—'));

/* ---------- Witness → rows ---------- */

// Scope is a property of the support kind, not of how many rows came back:
// `record` is one named record, `records` a filtered set, `group` a category
// group, `column`/`dataset` the whole snapshot.
export function scopeOf(witness) {
  switch (witness.support.of) {
    case 'record':
      return 'row';
    case 'records':
      return 'subset';
    case 'group':
      return 'group';
    default:
      return 'dataset';
  }
}

// Resolve fingerprinted support onto this snapshot. Ascending row order, which
// is the order the old row re-scans produced.
export function projectWitness(witness, dataset) {
  const s = witness.support;
  if (s.of === 'record' || s.of === 'records') {
    const want = new Set(s.of === 'record' ? [s.id] : s.ids);
    const idx = [];
    dataset.rows.forEach((_, i) => {
      if (want.has(rowFingerprint(dataset, i))) idx.push(i);
    });
    return idx;
  }
  if (s.of === 'group') {
    const idx = [];
    dataset.rows.forEach((r, i) => {
      if (String(r[s.column] ?? '—') === String(s.value)) idx.push(i);
    });
    return idx;
  }
  return dataset.rows.map((_, i) => i);
}

/* ---------- Op-keyed presentation ---------- */

// Context handed to every template: the root node, evaluated values, the
// snapshot, the report, and the projected rows.
// The column a node reads: a leaf names it directly, an operation inherits it
// from its first operand.
const columnOf = (ctx, node) => node.column ?? ctx.nodes[node.inputs?.[0]]?.column;

const extreme = {
  formula: (ctx, n) => `${n.stat}(${columnOf(ctx, n)}) over ${ctx.report.meta.rowCount} values = ${num(ctx.value)}`,
  because: (ctx, n) => {
    const labelCol = ctx.report.profile.roles.label;
    const i = ctx.rowIndices[0];
    const label = labelCol && i != null ? String(ctx.dataset.rows[i]?.[labelCol.key] ?? '—') : '';
    return `${label} holds ${num(ctx.value)} — the ${n.stat === 'min' ? 'lowest' : 'highest'} value in this column.`;
  },
};

const describe = {
  formula: (ctx) => `mean = ${num(ctx.value.mean)}, median = ${num(ctx.value.median)}, σ = ${num(ctx.value.stddev)}`,
  because: (ctx) =>
    `Mean ${num(ctx.value.mean)}, median ${num(ctx.value.median)}, spread ±${num(ctx.value.stddev)}.`,
};

const groupLargest = {
  formula: (ctx) => `count(${ctx.value.value}) = ${ctx.value.count}, largest of ${ctx.value.groups} groups`,
  because: (ctx) => `${ctx.value.value} contains ${ctx.value.count} of the records.`,
};

const distinct = {
  formula: (ctx, n) => `distinct(${columnOf(ctx, n)}) = ${ctx.value} groups`,
  because: (ctx) => `The records fall into ${ctx.value} groups.`,
};

const groupShare = {
  formula: (ctx) => `${ctx.value.value} = ${num(ctx.value.total)}, ${ctx.value.share}% of the total`,
  because: (ctx) => `${ctx.value.value} totals ${num(ctx.value.total)} — ${ctx.value.share}% of the column.`,
};

// Counting a classified status reads differently from counting a raw value, and
// the graph says which is which — the *input node's* kind, not the detector.
const CLASSIFIED = { critical: 'unavailable', warn: 'low' };
const countEqual = {
  formula: (ctx, n) => {
    const src = ctx.nodes[n.inputs[0]];
    const total = ctx.report.meta.rowCount;
    if (src.op === 'classify') {
      return `count(status classified “${CLASSIFIED[ctx.values[n.inputs[1]]]}”) = ${ctx.value} of ${total}`;
    }
    return `count(${columnOf(ctx, src)} = ${ctx.values[n.inputs[1]]}) = ${ctx.value} of ${total}`;
  },
  because: (ctx) => `${ctx.value} of ${ctx.report.meta.rowCount} records match this condition.`,
};

const countBetween = {
  formula: (ctx, n) => {
    const col = columnOf(ctx, ctx.nodes[n.inputs[0]]);
    return `count(${ctx.values[n.inputs[1]]} < ${col} ≤ ${ctx.values[n.inputs[2]]}) = ${ctx.value}`;
  },
  because: (ctx, n) => `${ctx.value} records fall at or below ${ctx.values[n.inputs[2]]}.`,
};

const healthShare = {
  formula: (ctx) => `${ctx.value.healthy} not flagged / ${ctx.value.total} = ${ctx.value.pct}%`,
  because: (ctx) =>
    `${ctx.value.healthy} of ${ctx.value.total} records are in good standing (${ctx.value.pct}%).`,
};

// The outlier: an exceeds() over a z-score. Both lines read the z-score's own
// operands, so nothing is re-derived or rounded twice.
const exceeds = {
  formula: (ctx, n) => {
    const z = ctx.nodes[n.inputs[0]];
    const [v, m, s] = z.inputs.map((i) => ctx.values[i]);
    const t = ctx.values[n.inputs[1]];
    return `z = |${num(v)} − ${num(m)}| / ${num(s)} = ${ctx.values[z.id].toFixed(1)}σ  (> ${t.toFixed(1)}σ)`;
  },
  because: (ctx, n) => {
    const z = ctx.nodes[n.inputs[0]];
    const [v, m] = z.inputs.map((i) => ctx.values[i]);
    return `${num(v)} sits ${ctx.values[z.id].toFixed(1)} standard deviations from the mean of ${num(m)}.`;
  },
};

const TEMPLATES = Object.freeze({
  max: extreme,
  min: extreme,
  describe,
  groupLargest,
  distinct,
  groupShare,
  countEqual,
  countBetween,
  healthShare,
  exceeds,
});

function context(justification, dataset, report, values) {
  const { nodes, root } = justification.opGraph;
  return {
    nodes,
    dataset,
    report,
    value: values[root],
    values,
    rowIndices: projectWitness(groundOf(justification), dataset),
  };
}

export const groundOf = (justification) => justification.supports.find((s) => s.of === 'ground')?.witness;

const templateFor = (nodes, root) => {
  const n = nodes[root];
  return TEMPLATES[n.op ?? n.stat];
};

// The derivation line — "max(Revenue) over 8 values = 900".
export function derivationString(justification, dataset, report, values) {
  const { nodes, root } = justification.opGraph;
  const t = templateFor(nodes, root);
  return t ? t.formula(context(justification, dataset, report, values), nodes[root]) : '';
}

// The plain-English sentence naming what Ellery actually looked at.
export function becauseString(justification, dataset, report, values) {
  const { nodes, root } = justification.opGraph;
  const t = templateFor(nodes, root);
  return t ? t.because(context(justification, dataset, report, values), nodes[root]) : '';
}
