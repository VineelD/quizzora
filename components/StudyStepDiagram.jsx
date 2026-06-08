"use client";

import { resolveDiagramRenderMode } from "../lib/study-diagram-render.js";
import DiagramSpecRenderer from "./diagrams/DiagramSpecRenderer.jsx";
import MermaidDiagram from "./MermaidDiagram.jsx";

export default function StudyStepDiagram({ step, className = "" }) {
  const mode = resolveDiagramRenderMode(step);

  if (mode === "spec") {
    return (
      <div className={`study-step-diagram study-step-diagram-spec ${className}`.trim()}>
        <DiagramSpecRenderer step={step} />
      </div>
    );
  }

  if (mode === "mermaid") {
    return (
      <div className={`study-step-diagram study-step-diagram-mermaid ${className}`.trim()}>
        <MermaidDiagram source={step.diagramMermaid} />
      </div>
    );
  }

  return null;
}
