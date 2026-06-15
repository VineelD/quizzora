import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCurriculumDocPrompt,
  CURRICULUM_DOC_DEPTH_ENRICHED,
  CURRICULUM_DOC_DEPTH_STANDARD,
  CURRICULUM_DOC_MATH_SUBJECTS,
  CURRICULUM_DOC_SYLLABUS_PHRASES,
  curriculumDocHasLatexDelimiters,
  curriculumDocRequiresLatex,
  validateCurriculumLearningMaterial,
} from "../lib/curriculum-doc-generator.js";

const sampleCell = {
  yearLevel: "Year 7",
  subject: "Science",
  subtopic: "Balanced and unbalanced forces",
  acaraCodes: "AC9S7U05",
};

const mathCell = {
  yearLevel: "Year 10",
  subject: "Mathematics",
  subtopic: "Sine and cosine rules",
  acaraCodes: "AC9M10M01",
};

test("buildCurriculumDocPrompt targets student learning material not syllabus overview", () => {
  const prompt = buildCurriculumDocPrompt(sampleCell);

  assert.match(prompt, /student learning guide/i);
  assert.match(prompt, new RegExp(CURRICULUM_DOC_DEPTH_STANDARD.label.replace("–", "–")));
  assert.match(prompt, /Key concepts/i);
  assert.match(prompt, /Worked examples/i);
  assert.match(prompt, /Common misconceptions/i);
  assert.match(prompt, /Real-world connections/i);
  assert.match(prompt, /not a syllabus overview/i);
  assert.match(prompt, /No quiz questions/i);
  assert.match(prompt, /Balanced and unbalanced forces/);
  assert.match(prompt, /AC9S7U05/);
});

test("buildCurriculumDocPrompt enriched mode targets deeper learning material", () => {
  const prompt = buildCurriculumDocPrompt(mathCell, { enriched: true });

  assert.match(prompt, /enriched student learning guide/i);
  assert.match(prompt, new RegExp(CURRICULUM_DOC_DEPTH_ENRICHED.label.replace("–", "–")));
  assert.match(prompt, /Formulae and rules/i);
  assert.match(prompt, /Example 1 and Example 2/i);
  assert.match(prompt, /Common mistakes/i);
  assert.match(prompt, /Practice questions/i);
  assert.match(prompt, /Answer key/i);
  assert.match(prompt, /not a syllabus overview/i);
});

test("buildCurriculumDocPrompt forbids syllabus-style phrasing in instructions", () => {
  const prompt = buildCurriculumDocPrompt(sampleCell).toLowerCase();

  assert.match(prompt, /never "students will"/);
  assert.match(prompt, /"students explore"/);
  assert.match(prompt, /"learning outcomes"/);
});

test("buildCurriculumDocPrompt requires LaTeX delimiters for mathematics and formulae", () => {
  const prompt = buildCurriculumDocPrompt(mathCell);

  assert.match(prompt, /\$\.{3}\$/);
  assert.match(prompt, /\$\$\.{3}\$\$/);
  assert.match(prompt, /Worked examples/i);
  assert.match(prompt, /LaTeX/i);
  assert.match(prompt, /Do not write raw ASCII math/i);
  assert.match(prompt, /\\frac|\\sin|\\theta/);
  assert.match(prompt, /never wrap full sentences/i);
  assert.match(prompt, /side \$a\$ is opposite angle \$A\$/);
});

test("curriculumDocRequiresLatex covers Mathematics and Science", () => {
  assert.equal(curriculumDocRequiresLatex("Mathematics"), true);
  assert.equal(curriculumDocRequiresLatex("Science"), true);
  assert.equal(curriculumDocRequiresLatex("English"), false);
  assert.ok(CURRICULUM_DOC_MATH_SUBJECTS.includes("Mathematics"));
});

test("curriculumDocHasLatexDelimiters detects inline and display math", () => {
  assert.equal(curriculumDocHasLatexDelimiters("Use $F = ma$ here."), true);
  assert.equal(curriculumDocHasLatexDelimiters("Use $$V = IR$$ here."), true);
  assert.equal(curriculumDocHasLatexDelimiters("Use F = ma here."), false);
});

test("validateCurriculumLearningMaterial rejects syllabus-style content", () => {
  const syllabusStyle = `
Introduction
In Year 7, students explore forces and motion. Students will learn about balanced forces.
Key concepts
- Forces
- Motion
Learning outcomes include understanding net force.
`.trim();

  const result = validateCurriculumLearningMaterial(syllabusStyle);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes("syllabus-style")));
});

test("validateCurriculumLearningMaterial accepts enriched teachable content", () => {
  const filler = "You apply the same rule with different numbers and check your sign carefully each time. ".repeat(80);
  const enriched = `
Introduction
You use integers whenever values can rise or fall — temperature, bank balances, and game scores all depend on adding and subtracting positive and negative numbers.

Key concepts
When both numbers share a sign, add their absolute values and keep that sign. When signs differ, subtract the smaller absolute value from the larger and keep the sign of the larger number.

Essential vocabulary
Absolute value means the distance from zero without considering sign.

Formulae and rules
For addition, think of moving left or right on a number line. For subtraction, add the opposite: $a - b = a + (-b)$.

Worked examples
Example 1
Step 1: Evaluate $5 + (-3)$.
Step 2: Signs differ, so subtract: $|5| - |{-3}| = 2$.
Step 3: The larger absolute value is positive, so the answer is $2$.

Example 2
Step 1: Evaluate $-4 + (-6)$.
Step 2: Signs match, so add absolute values: $4 + 6 = 10$.
Step 3: Both inputs are negative, so the answer is $-10$.

Common mistakes
Some people forget that subtracting a negative means adding a positive — rewrite $7 - (-2)$ as $7 + 2$.

Practice questions
1. What is $8 + (-5)$?
2. What is $-3 - 4$?

Answer key
1. $8 + (-5) = 3$ because $|8| > |{-5}|$ and the result keeps the sign of $8$.
2. $-3 - 4 = -7$ because subtracting $4$ moves further left on the number line.

Real-world connections
Weather forecasts in Hobart often move between positive and negative temperatures across a day.
${filler}
`.trim();

  const result = validateCurriculumLearningMaterial(enriched, { subject: "Mathematics", enriched: true });
  assert.equal(result.ok, true, result.issues.join("; "));
  assert.ok(result.wordCount >= CURRICULUM_DOC_DEPTH_ENRICHED.minWords);
});

test("validateCurriculumLearningMaterial rejects enriched content missing practice answers", () => {
  const filler = "Each step repeats the same reasoning with new numbers until the pattern feels natural. ".repeat(90);
  const incomplete = `
Introduction
You use integers whenever values can rise or fall.

Key concepts
When both numbers share a sign, add their absolute values and keep that sign.

Essential vocabulary
Absolute value means the distance from zero.

Formulae and rules
For subtraction, add the opposite: $a - b = a + (-b)$.

Worked examples
Example 1
Step 1: Evaluate $5 + (-3)$.
Step 2: The answer is $2$.

Example 2
Step 1: Evaluate $-4 + (-6)$.
Step 2: The answer is $-10$.

Common mistakes
Some people forget that subtracting a negative means adding a positive.

Practice questions
1. What is $8 + (-5)$?
2. What is $-3 - 4$?

Real-world connections
Weather forecasts move between positive and negative temperatures.
${filler}
`.trim();

  const result = validateCurriculumLearningMaterial(incomplete, { subject: "Mathematics", enriched: true });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes("answer")));
});

test("validateCurriculumLearningMaterial accepts substantive teachable content", () => {
  const paragraph = "When you push a box, friction opposes your push. ".repeat(120);
  const teachable = `
Introduction
You feel forces every day — when you kick a ball or sit on a chair, pushes and pulls change motion.

Key concepts
A force is a push or pull. Balanced forces cancel out, so an object stays still or moves at steady speed.

Essential vocabulary
Net force means the combined push or pull after you add all forces acting on an object.

Worked examples
Imagine two friends pulling a rope with equal strength in opposite directions. The rope does not move because the forces balance.

Common misconceptions
Some people think a moving object needs a constant push to keep moving; in fact, friction is what slows it down on Earth.

Real-world connections
Cyclists lean into corners because unbalanced forces change direction on curved paths.
${paragraph}
`.trim();

  const result = validateCurriculumLearningMaterial(teachable);
  assert.equal(result.ok, true, result.issues.join("; "));
  assert.ok(result.wordCount >= 500);
});

test("validateCurriculumLearningMaterial requires LaTeX for math-heavy Science content", () => {
  const paragraph = "When you calculate voltage, use V = IR with I = 2 A and R = 5 ohms. ".repeat(120);
  const rawMath = `
Introduction
You can predict voltage in a circuit when current and resistance are known.

Key concepts
Ohm's law links voltage, current, and resistance in a simple circuit.

Essential vocabulary
Voltage is electrical push measured in volts.

Worked examples
Suppose I = 2 A and R = 5 ohms. Then V = IR = 10 volts.

Common misconceptions
Some people think thicker wires always mean more voltage.

Real-world connections
Phone chargers are designed around expected current and resistance values.
${paragraph}
`.trim();

  const result = validateCurriculumLearningMaterial(rawMath, { subject: "Science" });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes("LaTeX")));
});

test("validateCurriculumLearningMaterial accepts LaTeX in Science worked examples", () => {
  const paragraph = "Each step uses the same formula with different values. ".repeat(120);
  const withLatex = `
Introduction
You can predict voltage in a circuit when current and resistance are known.

Key concepts
Ohm's law states $V = IR$, linking voltage, current, and resistance.

Essential vocabulary
Voltage is electrical push measured in volts.

Worked examples
Suppose $I = 2\\,\\text{A}$ and $R = 5\\,\\Omega$. Substitute into $V = IR$ to get $V = 10\\,\\text{V}$.

Common misconceptions
Some people think thicker wires always mean more voltage.

Real-world connections
Phone chargers are designed around expected current and resistance values.
${paragraph}
`.trim();

  const result = validateCurriculumLearningMaterial(withLatex, { subject: "Science" });
  assert.equal(result.ok, true, result.issues.join("; "));
});

test("CURRICULUM_DOC_SYLLABUS_PHRASES covers common overview wording", () => {
  assert.ok(CURRICULUM_DOC_SYLLABUS_PHRASES.includes("students will"));
  assert.ok(CURRICULUM_DOC_SYLLABUS_PHRASES.includes("students explore"));
});
