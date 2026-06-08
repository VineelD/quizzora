"use client";

import { useEffect, useState } from "react";
import { resolveDiagramRenderMode } from "../lib/study-diagram-render.js";
import StudyCoachMarkdown from "./StudyCoachMarkdown.jsx";
import StudyStepDiagram from "./StudyStepDiagram.jsx";

export default function StudyVisualStage({
  steps,
  activeIndex,
  subject = "Science",
  animate = true,
  narration = null,
  flashMode = true,
  visualSequence = false,
}) {
  const currentStep = steps[activeIndex];
  const [displayIndex, setDisplayIndex] = useState(activeIndex);
  const [transitioning, setTransitioning] = useState(false);
  const showFrameRail = !flashMode && visualSequence && steps.length > 1;

  useEffect(() => {
    if (!animate || displayIndex === activeIndex) {
      return undefined;
    }

    setTransitioning(true);
    const timer = window.setTimeout(() => {
      setDisplayIndex(activeIndex);
      setTransitioning(false);
    }, 220);

    return () => window.clearTimeout(timer);
  }, [activeIndex, animate, displayIndex]);

  const shownStep = steps[displayIndex] || currentStep;
  const diagram = shownStep?.diagram || {};
  const diagramTitle = diagram.title || shownStep?.diagramTitle || "";
  const diagramCaption = diagram.caption || shownStep?.diagramCaption || "";
  const diagramSummary = diagram.whatItShows || shownStep?.diagramSummary || "";
  const diagramLabels = diagram.labels?.length ? diagram.labels : shownStep?.diagramLabels || [];
  const renderMode = resolveDiagramRenderMode(shownStep);
  const hasClientDiagram = renderMode === "spec" || renderMode === "mermaid";
  const frames = steps.filter((step) => step.imageUrl || step.diagramPrompt || step.diagramSpec || step.diagramMermaid || step.callouts?.length);
  const hasVisual = Boolean(
    shownStep?.imageUrl ||
      hasClientDiagram ||
      shownStep?.callouts?.length ||
      frames.length ||
      diagramTitle ||
      diagramCaption ||
      shownStep?.diagramGenerationFailed,
  );

  if (!hasVisual) {
    return null;
  }

  return (
    <div
      className={`study-visual-stage${flashMode ? " study-visual-stage-flash" : ""}`}
      aria-live="polite"
    >
      <div className="study-visual-stage-header">
        <span className="study-visual-badge">{flashMode ? "Concept visual" : "Visual walkthrough"}</span>
        <div className="study-visual-stage-controls">
          {narration ? (
            <button
              aria-label={narration.muted ? "Turn narration on" : "Turn narration off"}
              aria-pressed={!narration.muted}
              className={`study-narration-toggle${narration.speaking ? " is-speaking" : ""}`}
              onClick={narration.toggleMute}
              type="button"
            >
              {narration.muted ? "Narration off" : narration.speaking ? "Narrating…" : "Narration on"}
            </button>
          ) : null}
          {showFrameRail ? (
            <div className="study-frame-rail" aria-hidden="true">
              {steps.map((step, index) => (
                <span
                  className={`study-frame-dot${index <= activeIndex ? " active" : ""}${index === activeIndex ? " current" : ""}`}
                  key={`frame-${index}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`study-visual-canvas study-flash-reveal${transitioning ? " is-transitioning" : ""}`}>
        {diagramTitle ? <p className="study-diagram-title study-visual-diagram-title">{diagramTitle}</p> : null}
        {diagramSummary ? <p className="study-diagram-summary study-visual-diagram-summary">{diagramSummary}</p> : null}
        {hasClientDiagram ? (
          <StudyStepDiagram className="study-visual-spec-diagram" step={shownStep} />
        ) : shownStep?.imageUrl ? (
          <img
            alt={shownStep.imageAlt || diagramTitle || "Study concept visual"}
            className="study-visual-image study-flash-image"
            key={shownStep.imageUrl}
            loading="lazy"
            src={shownStep.imageUrl}
          />
        ) : shownStep?.diagramGenerationFailed ? (
          <p className="muted study-diagram-fallback">Concept visual unavailable right now.</p>
        ) : (
          <StudyConceptCanvas callouts={shownStep?.callouts || []} frameIndex={activeIndex + 1} subject={subject} />
        )}

        <div className="study-visual-glow" aria-hidden="true" />
      </div>

      {diagramLabels.length ? (
        <ul aria-label="Diagram labels" className="study-diagram-labels study-visual-diagram-labels">
          {diagramLabels.map((label) => (
            <li className="study-diagram-label" key={label}>
              {label}
            </li>
          ))}
        </ul>
      ) : null}

      {diagramCaption ? <p className="study-diagram-caption study-visual-diagram-caption">{diagramCaption}</p> : null}

      {!flashMode && shownStep?.callouts?.length ? (
        <ul className="study-callout-list">
          {shownStep.callouts.map((callout, index) => (
            <li
              className="study-callout"
              key={`${callout.label}-${index}`}
              style={{ animationDelay: `${index * 120}ms` }}
            >
              <strong>{callout.label}</strong>
              {callout.detail ? (
                <StudyCoachMarkdown className="study-markdown study-callout-detail">{callout.detail}</StudyCoachMarkdown>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function StudyConceptCanvas({ callouts, frameIndex, subject }) {
  const palette = subjectPalette(subject);
  const nodes = callouts.length
    ? callouts
    : [
        { label: "Core idea", detail: "Building block 1" },
        { label: "Connection", detail: "Building block 2" },
        { label: "Application", detail: "Building block 3" },
      ];

  return (
    <div className="study-concept-canvas" aria-hidden="true">
      <div className="study-concept-orbit" />
      {nodes.slice(0, frameIndex + 1).map((node, index) => (
        <div
          className="study-concept-node"
          key={`${node.label}-${index}`}
          style={{
            animationDelay: `${index * 140}ms`,
            background: palette[index % palette.length],
            left: `${18 + index * 24}%`,
            top: `${28 + (index % 2) * 18}%`,
          }}
        >
          <span>{node.label}</span>
        </div>
      ))}
      {frameIndex > 0 ? <div className="study-concept-link study-concept-link-a" /> : null}
      {frameIndex > 1 ? <div className="study-concept-link study-concept-link-b" /> : null}
    </div>
  );
}

function subjectPalette(subject) {
  const key = String(subject || "").toLowerCase();
  if (key.includes("math")) {
    return ["#2d6cdf", "#6f8cff", "#9eb7ff"];
  }
  if (key.includes("science")) {
    return ["#148f77", "#3cb39a", "#7fd8c2"];
  }
  if (key.includes("english") || key.includes("history")) {
    return ["#8b5cf6", "#a78bfa", "#c4b5fd"];
  }
  return ["#11615c", "#2d8b84", "#6ec9be"];
}
