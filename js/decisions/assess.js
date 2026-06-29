// The scoring math, in one place. The rules just declare policy (urgency,
// impact, whether to investigate) and lean on this for the numbers, so nobody
// reimplements it. Works off a relationship and the discoveries it cites —
// never the raw dataset.
export function assess(relationship, discoveryById, { investigationRequired = false } = {}) {
  const supportIds = Array.isArray(relationship.supporting) ? relationship.supporting : [];
  const supports = supportIds.map((id) => discoveryById.get(id)).filter(Boolean);

  // A chain is only as strong as its weakest link, so confidence = the lowest of
  // the relationship's own confidence and each backing discovery's.
  const confs = [relationship.confidence, ...supports.map((d) => d.confidence)].filter(
    (n) => typeof n === 'number'
  );
  const confidence = confs.length ? Math.min(...confs) : Number(relationship.confidence) || 0;

  // How many separate discoveries back it up.
  const evidenceStrength = supports.length;

  // If it needs a closer look, keep actionability low; otherwise it tracks
  // confidence. (Look before you leap.)
  const actionability = investigationRequired ? Math.min(0.35, confidence * 0.4) : confidence;

  return { confidence, evidenceStrength, actionability, supportingDiscoveries: supportIds };
}
