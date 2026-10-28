// Statistics shared by dataset profiling and the derivation graph. Both must
// produce bit-identical floats or Re-check would report false failures, so there
// is exactly one implementation. Sums run over ascending values, left to right.

export const numbers = (xs) =>
  Array.isArray(xs) ? xs.filter((v) => typeof v === 'number' && !Number.isNaN(v)) : [];

export const ascending = (xs) => numbers(xs).sort((a, b) => a - b);

export function sum(v) {
  let s = 0;
  for (let i = 0; i < v.length; i += 1) s += v[i];
  return s;
}

export const mean = (v) => sum(v) / v.length;

export function variance(v) {
  const m = mean(v);
  let sq = 0;
  for (let i = 0; i < v.length; i += 1) sq += (v[i] - m) ** 2;
  return sq / v.length;
}

export function median(v) {
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export const isBlank = (val) => val === null || val === undefined || val === '';

// [value, count] pairs, most frequent first, ties by value ascending. Blanks are
// not a category.
export function groupCounts(xs) {
  const counts = new Map();
  for (const val of xs) {
    if (isBlank(val)) continue;
    const k = String(val);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
}
