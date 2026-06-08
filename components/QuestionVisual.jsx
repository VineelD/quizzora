import {
  hasQuizVisual,
  questionHasDiagramIntent,
  STUDENT_DIAGRAM_FAILURE_MESSAGE,
} from "../lib/question-display.js";
import DiagramSpecRenderer from "./diagrams/DiagramSpecRenderer.jsx";

export default function QuestionVisual({ question, showDiagramStatus = false }) {
  const hasVisual = hasQuizVisual(question);
  const diagramFailed =
    !hasVisual && questionHasDiagramIntent(question) && Boolean(question?.imageError);

  if (!hasVisual && !(showDiagramStatus && question?.imageError) && !diagramFailed) {
    return null;
  }

  const alt =
    question.imageAlt ||
    question.diagramPrompt ||
    question.imagePrompt ||
    "Question diagram";

  return (
    <figure className="question-visual">
      {hasVisual ? (
        <>
          {question.imageUrl ? (
            <img alt={alt} loading="lazy" src={question.imageUrl} />
          ) : (
            <DiagramSpecRenderer className="quiz-diagram-spec" step={question} />
          )}
        </>
      ) : null}
      {diagramFailed ? (
        <figcaption className="question-visual-status question-visual-student-notice" role="status">
          {STUDENT_DIAGRAM_FAILURE_MESSAGE}
        </figcaption>
      ) : null}
      {showDiagramStatus && question.imageError && !diagramFailed ? (
        <figcaption className="muted question-visual-status">{question.imageError}</figcaption>
      ) : null}
    </figure>
  );
}
