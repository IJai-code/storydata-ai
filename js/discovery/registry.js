// Detectors and rules add themselves on import, so a new one is a new file.
// Run order is by name, independent of import order.

export function createRegistry(label) {
  const items = [];
  return {
    register(item) {
      if (!item || typeof item.detect !== 'function' || !item.name) {
        throw new Error(`${label} expects { name, detect(ctx) }`);
      }
      if (!items.some((i) => i.name === item.name)) items.push(item);
    },
    all: () => [...items].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  };
}

const detectors = createRegistry('registerDetector');

export const registerDetector = detectors.register;
export const getDetectors = detectors.all;
