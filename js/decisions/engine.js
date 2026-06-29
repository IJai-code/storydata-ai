// Decision Engine orchestrator.
//
// runDecisions(discoveryReport, relationshipReport) reads ONLY those two
// immutable reports (never the raw dataset) and runs every registered rule to
// produce triage verdicts. Deterministic and read-only: neither input report is
// mutated. This is the authoritative input future Recommendation / Narrative
// engines consume — they read decisions without importing or modifying this.

import { getDecisionRules } from './registry.js';
import { urgencyRank, impactRank } from './decision.js';

export const DECISION_ENGINE_VERSION = '1.0.0';

/**
 * @typedef {Object} DecisionReport
 * @property {import('./decision.js').Decision[]} decisions  ranked desc by urgency, then impact
 * @property {Object} source
 * @property {{rules:string[], version:string}} meta
 */

const emptyReport = () => ({
  decisions: [],
  source: {
    discoveryCount: 0,
    relationshipCount: 0,
    domain: { id: 'generic', label: 'General' },
    discoveryVersion: null,
    relationshipVersion: null,
  },
  meta: { rules: [], version: DECISION_ENGINE_VERSION },
});

/** @returns {DecisionReport} */
export function runDecisions(discoveryReport, relationshipReport) {
  const discoveries = Array.isArray(discoveryReport?.discoveries) ? discoveryReport.discoveries : [];
  const relationships = Array.isArray(relationshipReport?.relationships) ? relationshipReport.relationships : [];
  if (!discoveries.length && !relationships.length) return emptyReport();

  const discoveryById = new Map(discoveries.map((d) => [d.id, d]));
  const ctx = {
    discoveries,
    relationships,
    discoveryById,
    relationshipsByType: (type) => relationships.filter((r) => r.type === type),
  };

  const rules = getDecisionRules();
  const decisions = [];
  for (const rule of rules) {
    try {
      const found = rule.decide(ctx) || [];
      for (const d of found) if (d) decisions.push(d);
    } catch (err) {
      // One faulty rule must never break the whole report.
      // eslint-disable-next-line no-console
      console.warn(`[decisions] rule "${rule.name}" failed:`, err);
    }
  }

  // Deterministic ranking: urgency, then impact, then confidence, then stable id.
  decisions.sort(
    (a, b) =>
      urgencyRank(b.urgency) - urgencyRank(a.urgency) ||
      impactRank(b.impact) - impactRank(a.impact) ||
      b.confidence - a.confidence ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );

  return {
    decisions,
    source: {
      discoveryCount: discoveries.length,
      relationshipCount: relationships.length,
      domain: discoveryReport?.domain || relationshipReport?.source?.domain || { id: 'generic', label: 'General' },
      discoveryVersion: discoveryReport?.meta?.version || null,
      relationshipVersion: relationshipReport?.meta?.version || null,
    },
    meta: { rules: rules.map((r) => r.name), version: DECISION_ENGINE_VERSION },
  };
}
