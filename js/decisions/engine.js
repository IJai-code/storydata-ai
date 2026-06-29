// runDecisions(discoveryReport, relationshipReport): take both reports, run the
// rules, hand back triage verdicts. It only ever reads those two reports (no raw
// dataset) and doesn't touch either one. Whatever recommends or narrates later
// reads these decisions — this is the call they trust.

import { getDecisionRules } from './registry.js';
import { urgencyRank, impactRank } from './decision.js';

export const DECISION_ENGINE_VERSION = '1.0.0';

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
      // isolate each rule so one bad apple doesnt spoil the whole report
      // eslint-disable-next-line no-console
      console.warn(`[decisions] rule "${rule.name}" failed:`, err);
    }
  }

  // order: urgency first, then impact, then confidence, id to break ties
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
