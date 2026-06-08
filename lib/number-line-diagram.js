export function sanitizeLabel(raw) {
  return String(raw || "")
    .replace(/\$/g, "")
    .replace(/\\/g, "")
    .trim();
}

export function computeStaggeredLabelYs(
  entries,
  { width = 420, baseY = 36, thresholdRatio = 0.08, staggerStep = 12 } = {},
) {
  const threshold = width * thresholdRatio;
  const sorted = entries
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => a.x - b.x || a.index - b.index);

  const layout = new Map();

  for (let i = 0; i < sorted.length; i += 1) {
    let tier = 0;
    for (let j = 0; j < i; j += 1) {
      if (Math.abs(sorted[i].x - sorted[j].x) <= threshold) {
        tier = Math.max(tier, (layout.get(sorted[j].index)?.tier ?? 0) + 1);
      }
    }
    layout.set(sorted[i].index, { y: baseY - tier * staggerStep, tier });
  }

  return entries.map((_, index) => layout.get(index)?.y ?? baseY);
}

export function collectAboveAxisLabels(spec, min, max, padding, innerWidth) {
  const toX = (value) => padding + ((value - min) / (max - min)) * innerWidth;
  const labels = [];

  const intervals = Array.isArray(spec.intervals) ? spec.intervals : [];
  intervals.forEach((interval, index) => {
    const from = Number(interval.from ?? interval.start);
    const to = Number(interval.to ?? interval.end);
    const text = sanitizeLabel(interval.label);
    if (!Number.isFinite(from) || !Number.isFinite(to) || !text) {
      return;
    }
    labels.push({
      key: `interval-${index}`,
      x: toX((from + to) / 2),
      text,
    });
  });

  const customLabels = Array.isArray(spec.labels) ? spec.labels : [];
  customLabels.forEach((item, index) => {
    const at = Number(item?.at ?? item?.value ?? item?.x);
    const text = sanitizeLabel(item?.label ?? item?.text ?? item);
    if (!Number.isFinite(at) || !text) {
      return;
    }
    labels.push({
      key: `label-${index}`,
      x: toX(at),
      text,
    });
  });

  return labels;
}
