// Where detectors sign up. Each one is { name, detect(ctx) } and registers
// itself on import, so adding a detector means adding a file — nothing here
// has to change.

const detectors = [];

export function registerDetector(detector) {
  if (!detector || typeof detector.detect !== 'function' || !detector.name) {
    throw new Error('registerDetector expects { name, detect(ctx) }');
  }
  if (detectors.some((d) => d.name === detector.name)) return; // already in — imports can run twice
  detectors.push(detector);
}

// Sorted by name so the run order is the same no matter how the imports land.
// (Final discovery order is by importance anyway.)
export function getDetectors() {
  return [...detectors].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
