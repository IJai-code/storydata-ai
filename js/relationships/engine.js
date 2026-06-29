// runRelationships(discoveryReport): walk the discoveries the report already
// produced and let the rules connect the dots. Read-only — it never opens the
// raw dataset and never mutates the report it was handed.

import { getRelationshipRules } from './registry.js';

export const RELATIONSHIP_ENGINE_VERSION = '1.0.0';

const emptyReport = () => ({
  relationships: [],
  source: { discoveryCount: 0, domain: { id: 'generic', label: 'General' }, discoveryVersion: null },
  meta: { rules: [], version: RELATIONSHIP_ENGINE_VERSION },
});

export function runRelationships(discoveryReport) {
  if (!discoveryReport || !Array.isArray(discoveryReport.discoveries)) {
    return emptyReport();
  }

  const discoveries = discoveryReport.discoveries;

  // The only window a rule gets onto the data: a few lookups over the discoveries.
  const byType = (type) => discoveries.filter((d) => d.type === type);
  const byKeyPrefix = (prefix) => discoveries.filter((d) => String(d.metadata?.key || '').startsWith(prefix));
  const find = (predicate) => discoveries.find(predicate);
  const ctx = { report: discoveryReport, discoveries, byType, byKeyPrefix, find };

  const rules = getRelationshipRules();
  const relationships = [];
  for (const rule of rules) {
    try {
      const found = rule.detect(ctx) || [];
      for (const rel of found) if (rel) relationships.push(rel);
    } catch (err) {
      // same deal as discovery — a thrown rule shouldnt take the others with it
      // eslint-disable-next-line no-console
      console.warn(`[relationships] rule "${rule.name}" failed:`, err);
    }
  }

  // same ordering as discoveries: importance, then confidence, then id
  relationships.sort(
    (a, b) =>
      b.importance - a.importance ||
      b.confidence - a.confidence ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );

  return {
    relationships,
    source: {
      discoveryCount: discoveries.length,
      domain: discoveryReport.domain || { id: 'generic', label: 'General' },
      discoveryVersion: discoveryReport.meta?.version || null,
    },
    meta: { rules: rules.map((r) => r.name), version: RELATIONSHIP_ENGINE_VERSION },
  };
}
