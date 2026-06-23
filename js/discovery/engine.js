// Discovery Engine orchestrator.
//
// runDiscovery(dataset) profiles the data, runs every registered detector, and
// returns a deterministic, ranked DiscoveryReport. It knows nothing about how
// the report is displayed. Future Narrative / Recommendation engines consume the
// returned discoveries + profile without importing or modifying this module.

import { profileDataset } from './profile.js';
import { getDetectors } from './registry.js';

export const DISCOVERY_ENGINE_VERSION = '1.0.0';

/**
 * @typedef {Object} DiscoveryReport
 * @property {import('./discovery.js').Discovery[]} discoveries  ranked desc by importance
 * @property {?Object} profile
 * @property {{id:string,label:string}} domain
 * @property {{rowCount:number,columnCount:number,detectors:string[],version:string}} meta
 */

const emptyReport = () => ({
  discoveries: [],
  profile: null,
  domain: { id: 'generic', label: 'General' },
  meta: { rowCount: 0, columnCount: 0, detectors: [], version: DISCOVERY_ENGINE_VERSION },
});

/** @returns {DiscoveryReport} */
export function runDiscovery(dataset) {
  if (!dataset || !Array.isArray(dataset.columns) || !Array.isArray(dataset.rows) || !dataset.rows.length) {
    return emptyReport();
  }

  const profile = profileDataset(dataset);
  const ctx = { dataset, profile };
  const detectors = getDetectors();

  const discoveries = [];
  for (const detector of detectors) {
    try {
      const found = detector.detect(ctx) || [];
      for (const d of found) if (d) discoveries.push(d);
    } catch (err) {
      // One faulty detector must never break the whole report.
      // eslint-disable-next-line no-console
      console.warn(`[discovery] detector "${detector.name}" failed:`, err);
    }
  }

  // Deterministic ranking: importance, then confidence, then stable id.
  discoveries.sort(
    (a, b) =>
      b.importance - a.importance ||
      b.confidence - a.confidence ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );

  return {
    discoveries,
    profile,
    domain: profile.domain,
    meta: {
      rowCount: profile.rowCount,
      columnCount: profile.columnCount,
      detectors: detectors.map((d) => d.name),
      version: DISCOVERY_ENGINE_VERSION,
    },
  };
}
