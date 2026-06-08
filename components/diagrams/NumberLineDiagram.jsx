"use client";

import {
  collectAboveAxisLabels,
  computeStaggeredLabelYs,
} from "../../lib/number-line-diagram.js";

function toX(value, min, max, padding, innerWidth) {
  const ratio = (value - min) / (max - min);
  return padding + ratio * innerWidth;
}

export default function NumberLineDiagram({ spec = {} }) {
  const min = Number(spec.min ?? -5);
  const max = Number(spec.max ?? 5);
  const points = Array.isArray(spec.points) ? spec.points.map(Number).filter(Number.isFinite) : [];
  const intervals = Array.isArray(spec.intervals) ? spec.intervals : [];
  const width = 420;
  const padding = 36;
  const innerWidth = width - padding * 2;
  const axisY = 48;
  const pointLabelY = 55;
  const aboveLabelBaseY = axisY - 12;

  const aboveAxisLabels = collectAboveAxisLabels(spec, min, max, padding, innerWidth);
  const aboveLabelYs = computeStaggeredLabelYs(aboveAxisLabels, {
    width,
    baseY: aboveLabelBaseY,
  });

  const ticks = [];
  const span = max - min;
  const step = span <= 10 ? 1 : span <= 20 ? 2 : 5;
  for (let value = Math.ceil(min / step) * step; value <= max; value += step) {
    ticks.push(value);
  }

  return (
    <svg
      aria-label={`Number line from ${min} to ${max}`}
      className="study-spec-diagram study-number-line"
      role="img"
      viewBox={`0 0 ${width} 96`}
    >
      {intervals.map((interval, index) => {
        const from = Number(interval.from ?? interval.start);
        const to = Number(interval.to ?? interval.end);
        if (!Number.isFinite(from) || !Number.isFinite(to)) {
          return null;
        }

        const x1 = toX(Math.min(from, to), min, max, padding, innerWidth);
        const x2 = toX(Math.max(from, to), min, max, padding, innerWidth);

        return (
          <g key={`interval-${index}`}>
            <rect fill="rgba(17, 97, 92, 0.15)" height="10" rx="4" width={Math.max(x2 - x1, 2)} x={x1} y={axisY - 5} />
          </g>
        );
      })}

      <line stroke="#334155" strokeWidth="2" x1={padding} x2={width - padding} y1={axisY} y2={axisY} />
      <polygon fill="#334155" points={`${width - padding},${axisY} ${width - padding - 8},${axisY - 4} ${width - padding - 8},${axisY + 4}`} />

      {ticks.map((value) => {
        const x = toX(value, min, max, padding, innerWidth);
        return (
          <g key={`tick-${value}`}>
            <line stroke="#64748b" strokeWidth="1.5" x1={x} x2={x} y1={axisY - 8} y2={axisY + 8} />
            <text fill="#475569" fontSize="10" textAnchor="middle" x={x} y={axisY + 22}>
              {value}
            </text>
          </g>
        );
      })}

      {points.map((value, index) => {
        const x = toX(value, min, max, padding, innerWidth);
        return (
          <g key={`point-${index}-${value}`}>
            <circle cx={x} cy={axisY} fill="#11615c" r="5" />
            <text fill="#11615c" fontSize="10" fontWeight="700" textAnchor="middle" x={x} y={pointLabelY}>
              {value}
            </text>
          </g>
        );
      })}

      {aboveAxisLabels.map((label, index) => (
        <text
          key={label.key}
          fill="#11615c"
          fontSize="10"
          textAnchor="middle"
          x={label.x}
          y={aboveLabelYs[index]}
        >
          {label.text}
        </text>
      ))}
    </svg>
  );
}
