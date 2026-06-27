// Relationship Engine orchestrator.
//
// runRelationships(discoveryReport) reads ONLY the report's discoveries (never
// the raw dataset, never the profile's rows) and runs every registered rule to
// surface higher-order relationships. Deterministic and read-only: the input
// report is never mutated. Future Narrative / Recommendation engines consume the
// returned relationships without importing or modifying this module.

import { getRelationshipRules } from './registry.js';

export const RELATIONSHIP_ENGINE_VERSION = '1.0.0';

/**
 * @typedef {Object} RelationshipReport
 * @property {import('./relationship.js').Relationship[]} relationships  ranked desc by importance
 * @property {{discoveryCount:number, domain:Object, discoveryVersion:?string}} source
 * @property {{rules:string[], version:string}} meta
 */

const emptyReport = () => ({
  relationships: [],
  source: { discoveryCount: 0, domain: { id: 'generic', label: 'General' }, discoveryVersion: null },
  meta: { rules: [], version: RELATIONSHIP_ENGINE_VERSION },
});

/** @returns {RelationshipReport} */
export function runRelationships(discoveryReport) {
  if (!discoveryReport || !Array.isArray(discoveryReport.discoveries)) {
    return emptyReport();
  }

  const discoveries = discoveryReport.discoveries;

  // Read-only query helpers over the discovery list — the only thing rules see.
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
      // One faulty rule must never break the whole report.
      // eslint-disable-next-line no-console
      console.warn(`[relationships] rule "${rule.name}" failed:`, err);
    }
  }

  // Deterministic ranking: importance, then confidence, then stable id.
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
