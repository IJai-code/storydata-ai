// Shared assessment math — confidence quality, evidence strength, actionability.
//
// Centralised so the rules only declare POLICY (urgency / impact / whether
// investigation is needed) and never duplicate the scoring. Reads a relationship
// plus the discoveries it cites; computes nothing from the raw dataset.

/**
 * @param {Object} relationship                a Relationship object
 * @param {Map<string,Object>} discoveryById   id -> Discovery
 * @param {{investigationRequired?: boolean}} [opts]
 * @returns {{confidence:number, evidenceStrength:number, actionability:number, supportingDiscoveries:string[]}}
 */
export function assess(relationship, discoveryById, { investigationRequired = false } = {}) {
  const supportIds = Array.isArray(relationship.supporting) ? relationship.supporting : [];
  const supports = supportIds.map((id) => discoveryById.get(id)).filter(Boolean);

  // Confidence quality = the weakest link in the chain (relationship + each
  // corroborating discovery). A decision is only as trustworthy as its softest
  // piece of evidence.
  const confs = [relationship.confidence, ...supports.map((d) => d.confidence)].filter(
    (n) => typeof n === 'number'
  );
  const confidence = confs.length ? Math.min(...confs) : Number(relationship.confidence) || 0;

  // Evidence strength = how many independent discoveries corroborate it.
  const evidenceStrength = supports.length;

  // Actionability: act directly when confident and no investigation is needed;
  // otherwise it is capped low (you should look before you leap).
  const actionability = investigationRequired ? Math.min(0.35, confidence * 0.4) : confidence;

  return { confidence, evidenceStrength, actionability, supportingDiscoveries: supportIds };
}
