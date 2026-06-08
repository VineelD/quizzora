"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseFocusLabel } from "../lib/curriculum-topics.js";
import {
  hasDiagramSteps,
  isDiagramCapableStep,
  mapPortionsToSteps,
  parseStoredMessagePayload,
  stepsToPlainText,
} from "../lib/study-message-payload.client.js";
import StudyCoachMarkdown from "./StudyCoachMarkdown.jsx";
import StudyFormulaFlash, { hasFlashableFormulas } from "./StudyFormulaFlash.jsx";
import StudySaveToFilesButton from "./StudySaveToFilesButton.jsx";
import StudyStepDiagram from "./StudyStepDiagram.jsx";
import StudyVisualStage from "./StudyVisualStage.jsx";
import { useStudySyncedNarration } from "./useStudySyncedNarration.js";
import { resolveDiagramRenderMode } from "../lib/study-diagram-render.js";
import { studyClientNarrationEnabled } from "../lib/study-narration-config.js";
import { buildMessageContext } from "../lib/study-narration-situational.js";

const CLIENT_NARRATION_ENABLED = studyClientNarrationEnabled();

function resolveHeroStep(steps) {
  if (!Array.isArray(steps) || !steps.length) {
    return null;
  }
  return steps.find(isDiagramCapableStep) || null;
}

function StudyLessonHeader({ payload, subject, yearLevel, focus }) {
  const parsed = parseFocusLabel(focus || "");
  const breadcrumbs =
    payload?.breadcrumbs?.length > 0
      ? payload.breadcrumbs
      : [yearLevel, subject, parsed.stream, parsed.topic, parsed.subtopic].filter(Boolean);

  if (!breadcrumbs.length && !payload?.topicHeader) {
    return null;
  }

  return (
    <header className="study-lesson-header">
      {breadcrumbs.length ? (
        <nav aria-label="Topic path" className="study-breadcrumbs">
          {breadcrumbs.map((crumb, index) => (
            <span className="study-breadcrumb" key={`${crumb}-${index}`}>
              {index > 0 ? <span aria-hidden="true" className="study-breadcrumb-sep">›</span> : null}
              {crumb}
            </span>
          ))}
        </nav>
      ) : null}
      {payload?.topicHeader ? <h3 className="study-lesson-title">{payload.topicHeader}</h3> : null}
    </header>
  );
}

function StudyKeyIdeas({ ideas, compact = false }) {
  if (!ideas?.length) {
    return null;
  }
  return (
    <div className={`study-key-ideas${compact ? " study-key-ideas-compact" : ""}`}>
      {!compact ? <p className="study-section-label">Key ideas</p> : null}
      <ul className="study-key-ideas-list">
        {ideas.map((idea) => (
          <li className="study-key-idea-chip" key={idea}>
            <StudyCoachMarkdown className="study-markdown study-key-idea-markdown">{idea}</StudyCoachMarkdown>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StudyNarrationBar({
  narration,
  listenLabel = "Listen to explanation",
  onListen,
  onDismiss,
  showOffer = true,
}) {
  if (!narration || !showOffer) {
    return null;
  }

  const handleListen = () => {
    onListen?.();
    narration.beginFromUserGesture?.();
  };

  if (!narration.speaking && !narration.muted) {
    return (
      <div className="study-narration-bar study-narration-offer">
        <button
          aria-label="Listen to explanation"
          className="study-narration-chip"
          onClick={handleListen}
          type="button"
        >
          {listenLabel}
        </button>
        {onDismiss ? (
          <button
            aria-label="Dismiss narration for this session"
            className="study-narration-dismiss"
            onClick={onDismiss}
            type="button"
          >
            Not now
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="study-narration-bar">
      <button
        aria-label="Play explanation narration"
        className="button primary study-narration-play"
        disabled={narration.muted}
        onClick={handleListen}
        type="button"
      >
        {narration.speaking ? "Playing…" : listenLabel}
      </button>
      <button
        aria-label={narration.muted ? "Turn narration on" : "Turn narration off"}
        aria-pressed={!narration.muted}
        className={`study-narration-toggle${narration.speaking ? " is-speaking" : ""}`}
        onClick={() => {
          if (!narration.muted) {
            onDismiss?.({ persist: true });
          }
          narration.toggleMute?.();
        }}
        type="button"
      >
        {narration.muted ? "Muted" : "Sound on"}
      </button>
      <button
        aria-label="Listen again"
        className="button secondary study-narration-replay"
        disabled={narration.muted}
        onClick={narration.replayCurrent}
        type="button"
      >
        Replay
      </button>
    </div>
  );
}

function StudyHeroFlash({ formulas, heroStep, steps, visualSequence, subject, activeIndex = 0 }) {
  const showFormulas = hasFlashableFormulas(formulas);
  const showVisual = heroStep && isDiagramCapableStep(heroStep);

  if (!showFormulas && !showVisual) {
    return null;
  }

  return (
    <div className="study-hero-flash">
      {showFormulas ? <StudyFormulaFlash formulas={formulas} /> : null}
      {showVisual ? (
        <StudyVisualStage
          activeIndex={activeIndex}
          animate
          flashMode={!visualSequence}
          steps={steps}
          subject={subject}
          visualSequence={visualSequence}
        />
      ) : null}
    </div>
  );
}

function StudyDiagramPanel({ step }) {
  const diagram = step?.diagram || {};
  const title = diagram.title || step?.diagramTitle || "";
  const caption = diagram.caption || step?.diagramCaption || "";
  const summary = diagram.whatItShows || step?.diagramSummary || "";
  const labels = diagram.labels?.length ? diagram.labels : step?.diagramLabels || [];
  const alt = step?.imageAlt || diagram.altText || title || caption || "Study diagram";
  const renderMode = resolveDiagramRenderMode(step);
  const hasClientDiagram = renderMode === "spec" || renderMode === "mermaid";
  const hasDiagramIntent = Boolean(
    String(step?.diagramPrompt || "").trim() || step?.diagramType || step?.diagramSpec || step?.diagramMermaid,
  );
  const failed =
    !hasClientDiagram &&
    (step?.diagramGenerationFailed || (hasDiagramIntent && !step?.imageUrl));

  if (!hasClientDiagram && !step?.imageUrl && !title && !caption && !labels.length && !failed) {
    return null;
  }

  return (
    <figure className="study-diagram-panel">
      {title ? <StudyCoachMarkdown className="study-markdown study-diagram-title">{title}</StudyCoachMarkdown> : null}
      {summary ? <StudyCoachMarkdown className="study-markdown study-diagram-summary">{summary}</StudyCoachMarkdown> : null}
      {hasClientDiagram ? <StudyStepDiagram step={step} /> : null}
      {!hasClientDiagram && step?.imageUrl ? (
        <img alt={alt} className="study-diagram-image" loading="lazy" src={step.imageUrl} />
      ) : null}
      {failed ? (
        <p className="study-diagram-error" role="status">
          Picture couldn&apos;t load — read the steps below.
        </p>
      ) : null}
      {labels.length ? (
        <ul aria-label="Diagram labels" className="study-diagram-labels">
          {labels.map((label) => (
            <li className="study-diagram-label" key={label}>
              <StudyCoachMarkdown className="study-markdown study-diagram-label-markdown">{label}</StudyCoachMarkdown>
            </li>
          ))}
        </ul>
      ) : null}
      {caption ? (
        <StudyCoachMarkdown className="study-markdown study-diagram-caption">{caption}</StudyCoachMarkdown>
      ) : null}
    </figure>
  );
}

function StudyPortionCard({ portion, index, isCurrent = false, reveal = false, storyMode = false }) {
  return (
    <section
      aria-current={isCurrent ? "step" : undefined}
      className={`study-portion study-lesson-card${reveal ? " study-portion-reveal" : ""}${isCurrent ? " study-portion-current" : ""}${storyMode ? " study-portion-story" : ""}`}
      style={reveal ? { animationDelay: `${index * 60}ms` } : undefined}
    >
      {!storyMode ? (
        <div className="study-step-card-head">
          <span aria-hidden="true" className="study-step-index">
            {index + 1}
          </span>
          {portion.label ? <h3 className="study-step-title">{portion.label}</h3> : null}
        </div>
      ) : portion.label ? (
        <h3 className="study-story-beat-title">{portion.label}</h3>
      ) : null}
      <StudyCoachMarkdown className="study-markdown study-step-text study-story-text">{portion.content}</StudyCoachMarkdown>
    </section>
  );
}

function StudyPortionWalkthrough({
  entry,
  payload,
  portions,
  steps = [],
  visualSequence = false,
  interactive,
  subject,
  yearLevel,
  focus,
  situationalNarration = null,
  assignmentId = null,
  onStudyFileSaved = null,
}) {
  const hasMultiple = portions.length > 1;
  const storyMode = !hasMultiple || portions.length <= 3;
  const heroStep = useMemo(() => resolveHeroStep(steps), [steps]);
  const heroShown = Boolean(heroStep) || hasFlashableFormulas(payload.formulas);
  const portionStepMap = useMemo(
    () => payload?.portionStepMap || mapPortionsToSteps(portions, steps),
    [payload?.portionStepMap, portions, steps],
  );
  const [started, setStarted] = useState(!interactive || !hasMultiple);
  const [activePortion, setActivePortion] = useState(0);

  const activeMapping = portionStepMap[activePortion] || { stepIndex: -1, step: null };
  const activeStepIndex = activeMapping.stepIndex >= 0 ? activeMapping.stepIndex : 0;
  const showWalkthroughChrome = hasMultiple;

  const handlePortionComplete = useCallback(() => {
    setActivePortion((current) => {
      if (current >= portions.length - 1) {
        return current;
      }
      return current + 1;
    });
  }, [portions.length]);

  const messageContext = useMemo(() => buildMessageContext(payload), [payload]);
  const situationalResult = useMemo(
    () => situationalNarration?.evaluateForMessage(messageContext) || { shouldOfferNarration: false, shouldAutoNarrate: false },
    [messageContext, situationalNarration],
  );
  const narrationEnabled =
    CLIENT_NARRATION_ENABLED && interactive && portions.length > 0 && situationalResult.shouldOfferNarration;

  const narration = useStudySyncedNarration({
    portions,
    activeIndex: activePortion,
    animate: interactive,
    autoAdvance: false,
    autoPlay: situationalResult.shouldAutoNarrate,
    enabled: narrationEnabled,
    onPortionComplete: handlePortionComplete,
    portionMode: true,
    started,
  });

  useEffect(() => {
    setStarted(!interactive || !hasMultiple);
    setActivePortion(0);
  }, [entry.id, interactive, hasMultiple]);

  useEffect(() => {
    if (!interactive || !situationalNarration) {
      return;
    }
    situationalNarration.recordStepChange(`${entry.id}:portion:${activePortion}`);
  }, [activePortion, entry.id, interactive, situationalNarration]);

  const atLastPortion = activePortion >= portions.length - 1;

  if (!interactive) {
    return (
      <div className="study-walkthrough study-walkthrough-complete study-portion-walkthrough study-story-layout">
        <StudyLessonHeader focus={focus} payload={payload} subject={subject} yearLevel={yearLevel} />
        <StudyKeyIdeas compact ideas={payload.keyIdeas} />
        <StudyHeroFlash
          activeIndex={activeStepIndex}
          formulas={payload.formulas}
          heroStep={heroStep}
          steps={steps}
          subject={subject}
          visualSequence={visualSequence}
        />
        {payload.intro ? (
          <StudyCoachMarkdown className="study-markdown study-walkthrough-intro study-story-intro">{payload.intro}</StudyCoachMarkdown>
        ) : null}
        {portions.map((portion, index) => (
          <StudyPortionCard index={index} portion={portion} storyMode={storyMode} key={`${entry.id}-${portion.id || index}`} />
        ))}
      </div>
    );
  }

  return (
    <div className="study-walkthrough study-portion-walkthrough study-story-layout">
      <StudyLessonHeader focus={focus} payload={payload} subject={subject} yearLevel={yearLevel} />
      <StudyKeyIdeas compact={storyMode} ideas={payload.keyIdeas} />

      {started && CLIENT_NARRATION_ENABLED ? (
        <StudyNarrationBar
          listenLabel="Listen to explanation"
          narration={narration}
          onDismiss={(options) => situationalNarration?.recordDismiss(options)}
          onListen={() => situationalNarration?.recordExplicitPlay()}
          showOffer={situationalResult.shouldOfferNarration}
        />
      ) : null}

      {payload.intro ? (
        <StudyCoachMarkdown className="study-markdown study-walkthrough-intro study-story-intro">{payload.intro}</StudyCoachMarkdown>
      ) : null}

      {!started && showWalkthroughChrome ? (
        <button
          className="button secondary study-start-walkthrough"
          onClick={() => setStarted(true)}
          type="button"
        >
          Start walkthrough
        </button>
      ) : null}

      {started ? (
        <StudyHeroFlash
          activeIndex={activeStepIndex}
          formulas={payload.formulas}
          heroStep={heroStep}
          steps={steps}
          subject={subject}
          visualSequence={visualSequence}
        />
      ) : null}

      {started
        ? portions.map((portion, index) => (
            <StudyPortionCard
              index={index}
              isCurrent={hasMultiple ? index === activePortion : true}
              key={`${entry.id}-${portion.id || index}`}
              portion={portion}
              reveal
              storyMode={storyMode}
            />
          ))
        : null}

      {started && showWalkthroughChrome ? (
        <div className="study-portion-controls">
          <button
            className="button secondary study-portion-prev"
            disabled={activePortion <= 0}
            onClick={() => setActivePortion((current) => Math.max(0, current - 1))}
            type="button"
          >
            Previous part
          </button>
          <span className="study-portion-progress">
            Part {activePortion + 1} of {portions.length}
          </span>
          <button
            className="button primary study-portion-next"
            disabled={atLastPortion}
            onClick={() => setActivePortion((current) => Math.min(current + 1, portions.length - 1))}
            type="button"
          >
            Next part
          </button>
        </div>
      ) : null}

      {started && heroShown && heroStep?.engagementHook ? (
        <p className="study-engagement-hook">
          <span className="study-engagement-label">Wonder about this</span>
          <StudyCoachMarkdown className="study-markdown study-engagement-copy">{heroStep.engagementHook}</StudyCoachMarkdown>
        </p>
      ) : null}

      {started && atLastPortion && showWalkthroughChrome ? (
        <p className="muted study-walkthrough-done">Walkthrough complete — ask a follow-up or request another concept visual.</p>
      ) : null}

      {interactive && assignmentId && atLastPortion ? (
        <StudySaveToFilesButton
          assignmentId={assignmentId}
          entry={entry}
          messageId={entry.id}
          onSaved={onStudyFileSaved}
        />
      ) : null}
    </div>
  );
}

function StudyStepWalkthrough({
  entry,
  payload,
  steps,
  interactive,
  subject,
  yearLevel,
  focus,
  situationalNarration = null,
  assignmentId = null,
  onStudyFileSaved = null,
}) {
  const hasStepWalkthrough = steps.length > 1 || (steps.length === 1 && payload?.intro);
  const visualSequence =
    Boolean(payload?.visualSequence) || steps.filter((step) => String(step.diagramPrompt || "").trim()).length >= 2;
  const heroStep = useMemo(() => resolveHeroStep(steps), [steps]);
  const [started, setStarted] = useState(!interactive || !hasStepWalkthrough);
  const [visibleStep, setVisibleStep] = useState(0);
  const messageContext = useMemo(() => buildMessageContext(payload), [payload]);
  const situationalResult = useMemo(
    () => situationalNarration?.evaluateForMessage(messageContext) || { shouldOfferNarration: false, shouldAutoNarrate: false },
    [messageContext, situationalNarration],
  );
  const narrationEnabled =
    CLIENT_NARRATION_ENABLED && interactive && steps.length > 0 && situationalResult.shouldOfferNarration;

  const narration = useStudySyncedNarration({
    activeIndex: visibleStep,
    animate: interactive,
    autoPlay: situationalResult.shouldAutoNarrate,
    enabled: narrationEnabled,
    intro: payload?.intro || "",
    introAudioUrl: payload?.introAudioUrl || "",
    introNarrationText: payload?.introNarrationText || "",
    started,
    steps,
  });

  useEffect(() => {
    setStarted(!interactive || !hasStepWalkthrough);
    setVisibleStep(0);
  }, [entry.id, interactive, hasStepWalkthrough]);

  useEffect(() => {
    if (!interactive || !situationalNarration) {
      return;
    }
    situationalNarration.recordStepChange(`${entry.id}:step:${visibleStep}`);
  }, [entry.id, interactive, situationalNarration, visibleStep]);

  if (!interactive) {
    return (
      <div className="study-walkthrough study-walkthrough-complete study-story-layout">
        <StudyLessonHeader focus={focus} payload={payload} subject={subject} yearLevel={yearLevel} />
        <StudyKeyIdeas compact ideas={payload.keyIdeas} />
        <StudyHeroFlash
          activeIndex={Math.max(0, steps.length - 1)}
          formulas={payload.formulas}
          heroStep={heroStep}
          steps={steps}
          subject={subject}
          visualSequence={visualSequence}
        />
        {payload.intro ? (
          <StudyCoachMarkdown className="study-markdown study-walkthrough-intro study-story-intro">{payload.intro}</StudyCoachMarkdown>
        ) : null}
        {steps.map((step, index) => (
          <StudyCoachStep index={index} showInlineDiagram={false} step={step} storyMode key={`${entry.id}-${index}`} />
        ))}
      </div>
    );
  }

  const revealedSteps = started ? steps.slice(0, visibleStep + 1) : [];
  const atLastStep = visibleStep >= steps.length - 1;
  const currentStep = steps[visibleStep];
  const showStepChrome = steps.length > 1;

  return (
    <div className="study-walkthrough study-story-layout">
      <StudyLessonHeader focus={focus} payload={payload} subject={subject} yearLevel={yearLevel} />
      <StudyKeyIdeas compact ideas={payload.keyIdeas} />

      {started && CLIENT_NARRATION_ENABLED ? (
        <StudyNarrationBar
          listenLabel="Listen to explanation"
          narration={narration}
          onDismiss={(options) => situationalNarration?.recordDismiss(options)}
          onListen={() => situationalNarration?.recordExplicitPlay()}
          showOffer={situationalResult.shouldOfferNarration}
        />
      ) : null}

      {payload.intro ? (
        <StudyCoachMarkdown className="study-markdown study-walkthrough-intro study-story-intro">{payload.intro}</StudyCoachMarkdown>
      ) : null}

      {!started && showStepChrome ? (
        <button
          className="button secondary study-start-walkthrough"
          onClick={() => setStarted(true)}
          type="button"
        >
          Start walkthrough
        </button>
      ) : null}

      {started ? (
        <StudyHeroFlash
          activeIndex={visibleStep}
          formulas={payload.formulas}
          heroStep={heroStep}
          steps={steps}
          subject={subject}
          visualSequence={visualSequence}
        />
      ) : null}

      {revealedSteps.map((step, index) => (
        <StudyCoachStep
          index={index}
          isCurrent={index === visibleStep}
          key={`${entry.id}-${index}`}
          reveal
          showInlineDiagram={false}
          step={step}
          storyMode={!showStepChrome}
        />
      ))}

      {started && currentStep?.engagementHook ? (
        <p className="study-engagement-hook">
          <span className="study-engagement-label">Wonder about this</span>
          <StudyCoachMarkdown className="study-markdown study-engagement-copy">{currentStep.engagementHook}</StudyCoachMarkdown>
        </p>
      ) : null}

      {started && !atLastStep && showStepChrome ? (
        <button
          className="button primary study-next-step"
          onClick={() => setVisibleStep((current) => Math.min(current + 1, steps.length - 1))}
          type="button"
        >
          Next part ({visibleStep + 1} of {steps.length})
        </button>
      ) : null}

      {started && atLastStep && showStepChrome ? (
        <p className="muted study-walkthrough-done">Walkthrough complete — ask a follow-up or request another concept visual.</p>
      ) : null}

      {interactive && assignmentId && atLastStep ? (
        <StudySaveToFilesButton
          assignmentId={assignmentId}
          entry={entry}
          messageId={entry.id}
          onSaved={onStudyFileSaved}
        />
      ) : null}
    </div>
  );
}

export default function StudyCoachMessage({
  entry,
  interactive = false,
  subject = "Science",
  yearLevel = "",
  focus = "",
  situationalNarration = null,
  assignmentId = null,
  onStudyFileSaved = null,
}) {
  const payload = entry.payload || parseStoredMessagePayload(entry);
  const portions = payload?.portions || [];
  const steps = payload?.steps || [];
  const hasPortionWalkthrough = portions.length >= 1 && portions.some((portion) => portion.content?.trim());

  if (hasPortionWalkthrough) {
    return (
      <StudyPortionWalkthrough
        assignmentId={assignmentId}
        entry={entry}
        focus={focus}
        interactive={interactive}
        onStudyFileSaved={onStudyFileSaved}
        payload={payload}
        portions={portions}
        situationalNarration={situationalNarration}
        steps={steps}
        subject={subject}
        visualSequence={Boolean(payload?.visualSequence)}
        yearLevel={yearLevel}
      />
    );
  }

  if (!payload?.steps?.length) {
    const plainText = stepsToPlainText(payload) || String(entry.content || "").trim();
    if (!plainText) {
      return null;
    }
    return <StudyCoachMarkdown className="study-markdown study-coach-plain">{plainText}</StudyCoachMarkdown>;
  }

  return (
    <StudyStepWalkthrough
      assignmentId={assignmentId}
      entry={entry}
      focus={focus}
      interactive={interactive}
      onStudyFileSaved={onStudyFileSaved}
      payload={payload}
      situationalNarration={situationalNarration}
      steps={steps}
      subject={subject}
      yearLevel={yearLevel}
    />
  );
}

function StudyCoachStep({ step, index, reveal = false, isCurrent = false, showInlineDiagram = false, storyMode = false }) {
  const text = String(step.text || "").trim();
  if (!text && !step.title && !showInlineDiagram) {
    return null;
  }

  return (
    <section
      className={`study-step study-lesson-card${reveal ? " study-step-reveal" : ""}${isCurrent ? " study-step-current" : ""}${storyMode ? " study-portion-story" : ""}`}
      style={reveal ? { animationDelay: `${index * 80}ms` } : undefined}
    >
      {!storyMode ? (
        <div className="study-step-card-head">
          <span aria-hidden="true" className="study-step-index">
            {index + 1}
          </span>
          {step.title ? <h3 className="study-step-title">{step.title.replace(/^Step \d+[ —-]\s*/i, "")}</h3> : null}
        </div>
      ) : step.title ? (
        <h3 className="study-story-beat-title">{step.title}</h3>
      ) : null}
      {text ? <StudyCoachMarkdown className="study-markdown study-step-text study-story-text">{step.text}</StudyCoachMarkdown> : null}

      {showInlineDiagram &&
      (step.imageUrl ||
        step.diagramPrompt ||
        step.diagramTitle ||
        step.diagramCaption ||
        step.diagramSpec ||
        step.diagramMermaid) ? (
        <StudyDiagramPanel step={step} />
      ) : null}

      {!showInlineDiagram && step.callouts?.length ? (
        <ul className="study-step-callouts">
          {step.callouts.map((callout, calloutIndex) => (
            <li key={`${callout.label}-${calloutIndex}`}>
              <strong>{callout.label}</strong>
              {callout.detail ? (
                <StudyCoachMarkdown className="study-markdown study-callout-detail">{callout.detail}</StudyCoachMarkdown>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
