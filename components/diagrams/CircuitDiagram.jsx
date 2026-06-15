"use client";

function ResistorSymbol({ x, y, width = 56, height = 16 }) {
  const midY = y;
  const left = x;
  const right = x + width;
  const amplitude = height / 2;
  const segments = 6;
  const step = width / segments;
  const points = [`${left},${midY}`];
  for (let index = 1; index <= segments; index += 1) {
    const px = left + step * index;
    const py = midY + (index % 2 === 0 ? amplitude : -amplitude);
    points.push(`${px},${py}`);
  }
  points.push(`${right},${midY}`);
  return <polyline fill="none" points={points.join(" ")} stroke="#1e293b" strokeWidth="2" />;
}

function BatterySymbol({ x, y, height = 36 }) {
  const longX = x + 10;
  const shortX = x + 18;
  const top = y - height / 2;
  const bottom = y + height / 2;
  return (
    <g>
      <line stroke="#1e293b" strokeWidth="2.5" x1={longX} x2={longX} y1={top} y2={bottom} />
      <line stroke="#1e293b" strokeWidth="4" x1={shortX} x2={shortX} y1={top + 6} y2={bottom - 6} />
      <text fill="#334155" fontSize="11" fontWeight="600" x={x - 4} y={bottom + 16} textAnchor="middle">
        +
      </text>
    </g>
  );
}

function formatComponentLabel(component) {
  const unit = component.unit === "ohm" || component.unit === "ohms" ? "Ω" : component.unit;
  return `${component.id} ${component.value} ${unit}`;
}

function ParallelCircuit({ spec }) {
  const components = spec.components;
  const branchGap = 72;
  const topY = 40;
  const bottomY = topY + (components.length - 1) * branchGap + 80;
  const leftX = 88;
  const rightX = 380;
  const branchMidX = (leftX + rightX) / 2;
  const width = 420;
  const height = bottomY + 48;
  const voltageLabel =
    Number.isFinite(spec.voltage) && spec.voltage > 0
      ? `${spec.voltage} ${spec.voltageUnit || "V"}`
      : "";

  return (
    <svg
      aria-label={`Parallel circuit with ${components.map((item) => item.id).join(", ")}`}
      className="study-spec-diagram study-circuit-diagram"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <BatterySymbol x={24} y={(topY + bottomY) / 2} />
      {voltageLabel ? (
        <text fill="#475569" fontSize="11" textAnchor="middle" x={34} y={(topY + bottomY) / 2 + 34}>
          {voltageLabel}
        </text>
      ) : null}

      <line stroke="#1e293b" strokeWidth="2" x1={leftX} x2={rightX} y1={topY} y2={topY} />
      <line stroke="#1e293b" strokeWidth="2" x1={leftX} x2={rightX} y1={bottomY} y2={bottomY} />
      <line stroke="#1e293b" strokeWidth="2" x1={leftX} x2={leftX} y1={topY} y2={bottomY} />

      {components.map((component, index) => {
        const branchY = topY + index * branchGap + 36;
        return (
          <g key={`branch-${component.id}`}>
            <line stroke="#1e293b" strokeWidth="2" x1={leftX} x2={branchMidX - 34} y1={branchY} y2={branchY} />
            <ResistorSymbol x={branchMidX - 28} y={branchY} />
            <line stroke="#1e293b" strokeWidth="2" x1={branchMidX + 28} x2={rightX} y1={branchY} y2={branchY} />
            <line stroke="#1e293b" strokeWidth="2" x1={rightX} x2={rightX} y1={topY} y2={branchY} />
            <line stroke="#1e293b" strokeWidth="2" x1={rightX} x2={rightX} y1={branchY} y2={bottomY} />
            <text fill="#0f172a" fontSize="12" fontWeight="600" textAnchor="middle" x={branchMidX} y={branchY - 14}>
              {formatComponentLabel(component)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SeriesCircuit({ spec }) {
  const components = spec.components;
  const startX = 72;
  const gap = 92;
  const y = 56;
  const width = Math.max(360, startX + components.length * gap + 72);
  const height = 120;
  const voltageLabel =
    Number.isFinite(spec.voltage) && spec.voltage > 0
      ? `${spec.voltage} ${spec.voltageUnit || "V"}`
      : "";

  return (
    <svg
      aria-label={`Series circuit with ${components.map((item) => item.id).join(", ")}`}
      className="study-spec-diagram study-circuit-diagram"
      role="img"
      viewBox={`0 0 ${width} ${height}`}
    >
      <BatterySymbol x={18} y={y} />
      {voltageLabel ? (
        <text fill="#475569" fontSize="11" textAnchor="middle" x={28} y={y + 34}>
          {voltageLabel}
        </text>
      ) : null}

      <line stroke="#1e293b" strokeWidth="2" x1={48} x2={startX} y1={y} y2={y} />

      {components.map((component, index) => {
        const resistorX = startX + index * gap;
        const nextX = resistorX + gap;
        return (
          <g key={`series-${component.id}`}>
            <line stroke="#1e293b" strokeWidth="2" x1={resistorX} x2={resistorX + 18} y1={y} y2={y} />
            <ResistorSymbol x={resistorX + 18} y={y} />
            <line stroke="#1e293b" strokeWidth="2" x1={resistorX + 74} x2={nextX} y1={y} y2={y} />
            <text fill="#0f172a" fontSize="12" fontWeight="600" textAnchor="middle" x={resistorX + 46} y={y - 16}>
              {formatComponentLabel(component)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function CircuitDiagram({ spec = {} }) {
  const layout = String(spec.layout || "parallel").toLowerCase();
  if (layout === "series") {
    return <SeriesCircuit spec={spec} />;
  }
  return <ParallelCircuit spec={spec} />;
}
