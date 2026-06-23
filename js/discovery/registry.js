// Detector registry — the extension point.
//
// A detector is { name: string, detect(ctx) -> Discovery[] }, where
// ctx = { dataset, profile }. Detectors self-register on import; adding a new
// one never requires editing existing detectors or the engine.

const detectors = [];

export function registerDetector(detector) {
  if (!detector || typeof detector.detect !== 'function' || !detector.name) {
    throw new Error('registerDetector expects { name, detect(ctx) }');
  }
  if (detectors.some((d) => d.name === detector.name)) return; // idempotent under repeated imports
  detectors.push(detector);
}

// Returned in a stable (name-sorted) order so a run is deterministic regardless
// of import order; the engine still sorts results by importance.
export function getDetectors() {
  return [...detectors].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
