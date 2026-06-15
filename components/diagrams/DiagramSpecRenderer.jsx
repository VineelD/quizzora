"use client";

import MermaidDiagram from "../MermaidDiagram.jsx";
import CircuitDiagram from "./CircuitDiagram.jsx";
import NumberLineDiagram from "./NumberLineDiagram.jsx";
import RecursionTreeDiagram from "./RecursionTreeDiagram.jsx";

export default function DiagramSpecRenderer({ step, className = "" }) {
  const spec = step?.diagramSpec;
  const diagramType = String(spec?.diagramType || step?.diagramType || "").trim();

  if (spec?.diagramType === "recursion_tree") {
    return <RecursionTreeDiagram className={className} spec={spec} />;
  }

  if (spec?.diagramType === "number_line") {
    return <NumberLineDiagram className={className} spec={spec} />;
  }

  if (spec?.diagramType === "circuit") {
    return <CircuitDiagram className={className} spec={spec} />;
  }

  const mermaidSource = String(step?.diagramMermaid || "").trim();
  if ((diagramType === "flowchart" || diagramType === "process_diagram") && mermaidSource) {
    return <MermaidDiagram className={className} source={mermaidSource} />;
  }

  return (
    <p className="muted study-diagram-fallback">Diagram preview unavailable.</p>
  );
}
