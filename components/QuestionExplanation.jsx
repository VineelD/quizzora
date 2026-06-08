import { formatExplanationSteps } from "../lib/explanation-format.js";
import StudyCoachMarkdown from "./StudyCoachMarkdown.jsx";

export default function QuestionExplanation({ explanation }) {
  const steps = formatExplanationSteps(explanation);
  if (!steps.length) {
    return null;
  }

  if (steps.length === 1) {
    return (
      <StudyCoachMarkdown className="study-markdown explanation-text quiz-explanation-markdown" variant="quiz">
        {steps[0]}
      </StudyCoachMarkdown>
    );
  }

  return (
    <ol className="explanation-steps">
      {steps.map((step, index) => (
        <li key={`${index}-${step.slice(0, 32)}`}>
          <StudyCoachMarkdown className="study-markdown quiz-explanation-markdown" variant="quiz">
            {step}
          </StudyCoachMarkdown>
        </li>
      ))}
    </ol>
  );
}
