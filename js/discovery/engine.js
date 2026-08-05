// runDiscovery(dataset): profile the data, let every detector look at it, and
// hand back a ranked report. Nothing in here cares how the report is shown —
// downstream layers just read what comes out.

import { profileDataset } from './profile.js';
import { getDetectors } from './registry.js';

export const DISCOVERY_ENGINE_VERSION = '1.0.0';

const emptyReport = () => ({
  discoveries: [],
  profile: null,
  domain: { id: 'generic', label: 'General' },
  meta: { rowCount: 0, columnCount: 0, detectors: [], version: DISCOVERY_ENGINE_VERSION },
});

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
      discoveries.push(...found.filter(Boolean));
    } catch (err) {
      // isolate each detector — one blowing up shouldnt cost us every other
      // signal too. we'd rather drop one finding than the whole report.
       
      console.warn(`[discovery] detector "${detector.name}" failed:`, err);
    }
  }

  // rank by importance, then confidence, with id as a stable tiebreaker
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
