// Detector: availability — supply risk read from a status column (preferred) or
// a quantity column. Domain-agnostic: the status vocabulary comes from the
// resolved domain via profile.classifyStatus; on a generic domain this detector
// quietly falls back to quantity, or emits nothing.
import { registerDetector } from '../registry.js';
import { createDiscovery, IMPORTANCE, TONE, formatNumber } from '../discovery.js';

registerDetector({
  name: 'availability',
  detect({ dataset, profile }) {
    const n = profile.rowCount;
    if (!n) return [];
    const out = [];
    const status = profile.roles.status;
    const qty = profile.roles.quantity;

    if (status) {
      let critical = 0;
      let warn = 0;
      let ok = 0;
      for (const row of dataset.rows) {
        const t = profile.classifyStatus(row[status.key]);
        if (t === 'critical') critical += 1;
        else if (t === 'warn') warn += 1;
        else if (t === 'ok') ok += 1;
      }
      if (critical) {
        out.push(
          createDiscovery({
            type: 'availability',
            title: 'Out of stock',
            summary: `${critical} of ${n} ${critical === 1 ? 'record is' : 'records are'} unavailable.`,
            importance: IMPORTANCE.CRITICAL * (0.6 + 0.4 * (critical / n)),
            confidence: 1,
            evidence: { column: status.key, count: critical, total: n },
            metadata: { detector: 'availability', key: 'status:critical', columns: [status.key], tone: TONE.CRITICAL },
          })
        );
      }
      if (warn) {
        out.push(
          createDiscovery({
            type: 'availability',
            title: 'Low / limited',
            summary: `${warn} ${warn === 1 ? 'record is' : 'records are'} running low or limited.`,
            importance: IMPORTANCE.HIGH * (0.6 + 0.4 * (warn / n)),
            confidence: 1,
            evidence: { column: status.key, count: warn, total: n },
            metadata: { detector: 'availability', key: 'status:warn', columns: [status.key], tone: TONE.WARN },
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
        })
      );
      return out;
    }

    if (qty) {
      const vals = dataset.rows.map((r) => r[qty.key]).filter((v) => typeof v === 'number');
      if (!vals.length) return out;
      const zeros = vals.filter((v) => v === 0).length;
      const threshold = Math.max(5, Math.round(Math.max(...vals) * 0.1));
      const low = vals.filter((v) => v > 0 && v <= threshold).length;
      const ql = qty.label.toLowerCase();
      if (zeros) {
        out.push(
          createDiscovery({
            type: 'availability',
            title: `${qty.label} depleted`,
            summary: `${zeros} ${zeros === 1 ? 'record has' : 'records have'} zero ${ql}.`,
            importance: IMPORTANCE.CRITICAL * (0.6 + 0.4 * (zeros / n)),
            confidence: 1,
            evidence: { column: qty.key, count: zeros, total: n },
            metadata: { detector: 'availability', key: 'qty:zero', columns: [qty.key], tone: TONE.CRITICAL },
          })
        );
      }
      if (low) {
        out.push(
          createDiscovery({
            type: 'availability',
            title: 'Low-stock warning',
            summary: `${low} ${low === 1 ? 'record is' : 'records are'} below ${threshold} ${ql}.`,
            importance: IMPORTANCE.HIGH,
            confidence: 1,
            evidence: { column: qty.key, count: low, threshold },
            metadata: { detector: 'availability', key: 'qty:low', columns: [qty.key], tone: TONE.WARN },
          })
        );
      }
    }
    return out;
  },
});
