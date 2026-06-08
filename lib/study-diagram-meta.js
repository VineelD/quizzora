const DIAGRAM_TYPE_HINTS = {
  recursion_tree: "Draw a clear recursion tree with labelled nodes, branch values, and depth levels.",
  flowchart: "Use a top-to-bottom flowchart with rounded process boxes, decision diamonds, and numbered step labels.",
  number_line: "Draw a horizontal number line with tick marks, zero, arrows for intervals, and labelled points.",
  coordinate_plane: "Include labelled x/y axes, grid lines, scale markers, and plotted points or curves.",
  venn_diagram: "Use overlapping circles with region labels and a concise legend.",
  bar_chart: "Use a labelled bar chart with axis titles, units, and colour-coded categories.",
  cell_diagram: "Label organelles clearly with leader lines and a short legend for each structure.",
  timeline: "Use a horizontal timeline with dates, event labels, and brief captions.",
  concept_map: "Show linked concept nodes with arrows describing relationships between ideas.",
  geometric_figure: "Label sides, angles, and given measurements; include a scale note if relevant.",
  geometry: "Label sides, angles, and given measurements; include a scale note if relevant.",
  probability: "Show sample space, outcomes, or a clear chance diagram with readable labels and no overlap.",
  process_diagram: "Show stages left-to-right with arrows, inputs/outputs, and numbered labels.",
  generic: "Prioritise educational clarity: labelled parts, axes or scale where relevant, and a concise legend.",
};

export function normalizeDiagramType(value) {
  const key = String(value || "generic")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return DIAGRAM_TYPE_HINTS[key] ? key : "generic";
}

export function normalizeDiagramMetadata(raw = {}) {
  const labels = Array.isArray(raw.labels || raw.diagramLabels)
    ? (raw.labels || raw.diagramLabels).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8)
    : [];

  const title = String(raw.title || raw.diagramTitle || "").trim();
  const caption = String(raw.caption || raw.diagramCaption || "").trim();
  const whatItShows = String(raw.whatItShows || raw.diagramSummary || raw.summary || "").trim();
  const diagramType = normalizeDiagramType(raw.diagramType || raw.type || "");
  const altText =
    String(raw.altText || raw.imageAlt || raw.alt || "").trim() ||
    [title, caption, labels.join(", ")].filter(Boolean).join(" — ");

  return {
    title,
    caption,
    labels,
    whatItShows,
    diagramType,
    altText,
  };
}

export function diagramTypeHint(diagramType) {
  return DIAGRAM_TYPE_HINTS[normalizeDiagramType(diagramType)] || DIAGRAM_TYPE_HINTS.generic;
}
