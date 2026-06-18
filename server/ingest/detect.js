// Format sniffing: JSON → delimited table → free text. Never throws.

const DELIMITERS = [',', '\t', ';', '|'];

export function detectFormat(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return { format: 'empty' };

  if (/^[[{]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return { format: 'json' };
    } catch {
      /* fall through — looked like JSON but isn't */
    }
  }

  const lines = trimmed.split(/\r\n|\r|\n/).filter((l) => l.trim()).slice(0, 40);
  let best = null;

  for (const delim of DELIMITERS) {
    const counts = lines.map((l) => countOutsideQuotes(l, delim));
    const withDelim = counts.filter((c) => c > 0).length;
    if (withDelim < Math.max(1, lines.length * 0.7)) continue;

    // Consistency: how often the modal count appears among delimited lines.
    const mode = modal(counts.filter((c) => c > 0));
    const consistent = counts.filter((c) => c === mode).length / lines.length;
    const score = consistent * 10 + mode;
    if (!best || score > best.score) best = { delim, score };
  }

  if (best && lines.length >= 2) return { format: 'csv', delimiter: best.delim };
  if (best && lines.length === 1) return { format: 'csv', delimiter: best.delim };
  return { format: 'text' };
}

function countOutsideQuotes(line, delim) {
  let count = 0;
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delim && !inQuotes) count++;
  }
  return count;
}

function modal(values) {
  const freq = new Map();
  let best = 0;
  let bestCount = 0;
  for (const v of values) {
    const n = (freq.get(v) || 0) + 1;
    freq.set(v, n);
    if (n > bestCount) {
      bestCount = n;
      best = v;
    }
  }
  return best;
}
