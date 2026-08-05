// Supply risk. Prefers a status column; falls back to a quantity column if
// there's no status. The status wording isn't ours — it comes from the domain
// via profile.classifyStatus, so on a plain dataset this just stays quiet.
import { registerDetector } from '../registry.js';
import { createDiscovery, IMPORTANCE, TONE } from '../discovery.js';
import { justify, records, wholeColumn } from '../../derive/build.js';

const SRC = 'discovery/detectors/availability.js';
const CERTAIN = { value: 1, note: 'a direct count or ordering over the snapshot — nothing estimated' };

// grammar helpers so the summaries read right at 1 vs many
const recordsAre = (k) => (k === 1 ? 'record is' : 'records are');
const recordsHave = (k) => (k === 1 ? 'record has' : 'records have');

registerDetector({
  name: 'availability',
  detect({ dataset, profile }) {
    const n = profile.rowCount;
    if (!n) return [];
    const out = [];
    const status = profile.roles.status;
    const qty = profile.roles.quantity;

    if (status) {
      // Record which rows land in each band as we classify. The Pull projects
      // these; nothing downstream re-runs the predicate.
      const criticalIdx = [];
      const warnIdx = [];
      let ok = 0;
      dataset.rows.forEach((row, i) => {
        const t = profile.classifyStatus(row[status.key]);
        if (t === 'critical') criticalIdx.push(i);
        else if (t === 'warn') warnIdx.push(i);
        else if (t === 'ok') ok += 1;
      });
      const critical = criticalIdx.length;
      const warn = warnIdx.length;
      const classified = (g) => g.reduce('classify', [g.column(status.key)]);
      const statusPolicy = {
        rule: 'Classify each record’s status through the domain vocabulary, then count.',
        params: `vocabulary: ${profile.domain.label}`,
        source: 'discovery/profile.js · domains.js',
      };
      if (critical) {
        out.push(
          createDiscovery({
            type: 'availability',
            title: 'Out of stock',
            summary: `${critical} of ${n} ${recordsAre(critical)} unavailable.`,
            importance: IMPORTANCE.CRITICAL * (0.6 + 0.4 * (critical / n)),
            confidence: 1,
            evidence: { column: status.key, count: critical, total: n },
            metadata: { detector: 'availability', key: 'status:critical', columns: [status.key], tone: TONE.CRITICAL },
            justification: justify({
              build: (g) => g.reduce('countEqual', [classified(g), g.param('tone', 'critical')]),
              witness: records(dataset, criticalIdx, [status.key]),
              asserts: critical,
              policy: statusPolicy,
              confidence: CERTAIN,
            }),
          })
        );
      }
      if (warn) {
        out.push(
          createDiscovery({
            type: 'availability',
            title: 'Low / limited',
            summary: `${warn} ${recordsAre(warn)} running low or limited.`,
            importance: IMPORTANCE.HIGH * (0.6 + 0.4 * (warn / n)),
            confidence: 1,
            evidence: { column: status.key, count: warn, total: n },
            metadata: { detector: 'availability', key: 'status:warn', columns: [status.key], tone: TONE.WARN },
            justification: justify({
              build: (g) => g.reduce('countEqual', [classified(g), g.param('tone', 'warn')]),
              witness: records(dataset, warnIdx, [status.key]),
              asserts: warn,
              policy: statusPolicy,
              confidence: CERTAIN,
            }),
          })
        );
      }
      const healthy = ok || n - critical - warn;
      const pct = Math.round((healthy / n) * 100);
      out.push(
        createDiscovery({
          type: 'availability',
          title: 'Availability health',
          summary: `${pct}% of records are in good standing.`,
          importance: IMPORTANCE.MEDIUM,
          confidence: 1,
          evidence: { healthy, total: n, pct },
          metadata: {
            detector: 'availability',
            key: 'health',
            columns: [status.key],
            tone: pct >= 80 ? TONE.OK : pct >= 50 ? TONE.WARN : TONE.CRITICAL,
          },
          justification: justify({
            build: (g) => g.reduce('healthShare', [classified(g)]),
            witness: wholeColumn(status.key, []),
            asserts: { healthy, total: n, pct },
            policy: {
              rule: 'Share of records that are neither critical nor low.',
              params: 'derived from status classification',
              source: SRC,
            },
            confidence: CERTAIN,
          }),
        })
      );
      return out;
    }

    if (qty) {
      const vals = dataset.rows.map((r) => r[qty.key]).filter((v) => typeof v === 'number');
      if (!vals.length) return out;
      const threshold = Math.max(5, Math.round(Math.max(...vals) * 0.1));
      // Collect the rows themselves, not just counts — the Pull used to re-run
      // these predicates from the evidence blob, which was a second copy able to
      // drift from the count the finding asserts.
      const zeroIdx = [];
      const lowIdx = [];
      dataset.rows.forEach((r, i) => {
        const v = r[qty.key];
        if (typeof v !== 'number') return;
        if (v === 0) zeroIdx.push(i);
        else if (v > 0 && v <= threshold) lowIdx.push(i);
      });
      const zeros = zeroIdx.length;
      const low = lowIdx.length;
      const ql = qty.label.toLowerCase();
      if (zeros) {
        out.push(
          createDiscovery({
            type: 'availability',
            title: `${qty.label} depleted`,
            summary: `${zeros} ${recordsHave(zeros)} zero ${ql}.`,
            importance: IMPORTANCE.CRITICAL * (0.6 + 0.4 * (zeros / n)),
            confidence: 1,
            evidence: { column: qty.key, count: zeros, total: n },
            metadata: { detector: 'availability', key: 'qty:zero', columns: [qty.key], tone: TONE.CRITICAL },
            justification: justify({
              build: (g) => g.reduce('countEqual', [g.column(qty.key), g.param('value', 0)]),
              witness: records(dataset, zeroIdx, [qty.key]),
              asserts: zeros,
              policy: { rule: 'Count records at zero on the quantity column.', params: 'threshold = 0', source: SRC },
              confidence: CERTAIN,
            }),
          })
        );
      }
      if (low) {
        out.push(
          createDiscovery({
            type: 'availability',
            title: 'Low-stock warning',
            summary: `${low} ${recordsAre(low)} below ${threshold} ${ql}.`,
            importance: IMPORTANCE.HIGH,
            confidence: 1,
            evidence: { column: qty.key, count: low, threshold },
            metadata: { detector: 'availability', key: 'qty:low', columns: [qty.key], tone: TONE.WARN },
            justification: justify({
              build: (g) => g.reduce('countBetween', [g.column(qty.key), g.param('low', 0), g.param('high', threshold)]),
              witness: records(dataset, lowIdx, [qty.key]),
              asserts: low,
              policy: {
                rule: 'Count records at or below the low-stock line.',
                params: `line = max(5, 10% of peak) = ${threshold}`,
                source: SRC,
              },
              confidence: CERTAIN,
            }),
          })
        );
      }
    }
    return out;
  },
});
