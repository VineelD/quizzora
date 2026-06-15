/** Normalise LLM-produced circuit diagramSpec for deterministic SVG rendering. */

const LAYOUTS = new Set(["parallel", "series"]);

function normalizeComponent(raw, index) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const id = String(raw.id || raw.label || raw.name || `R${index + 1}`).trim();
  const value = Number(raw.value ?? raw.resistance ?? raw.ohms);
  if (!id || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  const unit = String(raw.unit || "Ω").trim() || "Ω";
  return { id, value, unit, type: String(raw.type || "resistor").trim() || "resistor" };
}

export function normalizeCircuitSpec(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const diagramType = String(raw.diagramType || raw.type || "").trim().toLowerCase();
  if (diagramType !== "circuit" && diagramType !== "circuit_diagram") {
    return null;
  }

  const sourceList = Array.isArray(raw.components)
    ? raw.components
    : Array.isArray(raw.branches)
      ? raw.branches
      : Array.isArray(raw.resistors)
        ? raw.resistors
        : [];

  const components = sourceList
    .map((item, index) => normalizeComponent(item, index))
    .filter(Boolean)
    .slice(0, 6);

  if (!components.length) {
    return null;
  }

  const layoutRaw = String(raw.layout || raw.topology || "").trim().toLowerCase();
  const layout =
    LAYOUTS.has(layoutRaw) ? layoutRaw : components.length === 1 ? "series" : "parallel";

  const voltage = Number(raw.voltage ?? raw.batteryVoltage ?? raw.supplyVoltage);
  const voltageUnit = String(raw.voltageUnit || raw.batteryUnit || "V").trim() || "V";

  return {
    diagramType: "circuit",
    layout,
    ...(Number.isFinite(voltage) && voltage > 0 ? { voltage, voltageUnit } : {}),
    components,
  };
}

const CIRCUIT_TOPIC_PATTERN =
  /\b(?:circuit|resistor|parallel|series|ohm|Ω|voltage|current|battery)\b/i;

/** True when prose looks like a physics circuit explanation. */
export function looksLikeCircuitContent(text) {
  const value = String(text || "");
  if (!CIRCUIT_TOPIC_PATTERN.test(value)) {
    return false;
  }
  return /R\d/i.test(value) || /\d+\s*(?:Ω|ohm)/i.test(value) || /\d+\s*V\b/i.test(value);
}

function parseCircuitComponents(text) {
  const value = String(text || "");
  const byId = new Map();

  for (const match of value.matchAll(/\[R(\d+)\]\s*\((\d+(?:\.\d+)?)\s*(?:Ω|ohm)/gi)) {
    byId.set(`R${match[1]}`, { id: `R${match[1]}`, value: Number(match[2]), unit: "Ω", type: "resistor" });
  }

  for (const match of value.matchAll(/\bR(\d+)\b[^0-9]{0,24}(\d+(?:\.\d+)?)\s*(?:Ω|ohm)/gi)) {
    const id = `R${match[1]}`;
    if (!byId.has(id)) {
      byId.set(id, { id, value: Number(match[2]), unit: "Ω", type: "resistor" });
    }
  }

  return [...byId.values()].sort((left, right) => {
    const leftIndex = Number(left.id.replace(/\D/g, "")) || 0;
    const rightIndex = Number(right.id.replace(/\D/g, "")) || 0;
    return leftIndex - rightIndex;
  });
}

/** Build circuit diagramSpec from coach/quiz prose when the model omitted structured fields. */
export function inferCircuitDiagramSpec(text) {
  if (!looksLikeCircuitContent(text)) {
    return null;
  }

  const components = parseCircuitComponents(text);
  if (!components.length) {
    return null;
  }

  const voltageMatch = String(text || "").match(/(\d+(?:\.\d+)?)\s*V\b/i);
  const layout = /\bparallel\b/i.test(text)
    ? "parallel"
    : /\bseries\b/i.test(text)
      ? "series"
      : components.length === 1
        ? "series"
        : "parallel";

  return normalizeCircuitSpec({
    diagramType: "circuit",
    layout,
    voltage: voltageMatch ? Number(voltageMatch[1]) : undefined,
    voltageUnit: "V",
    components,
  });
}
