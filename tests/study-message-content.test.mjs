import assert from "node:assert/strict";
import { test } from "node:test";
import {
  convertBlockLatexEnvironments,
  convertLatexDelimiters,
  convertUnicodeMathSymbols,
  fixMalformedCasesEnvironments,
  formatStudyMessageLists,
  latexToPlainText,
  latexToUnicode,
  normalizeMangledBackslashes,
  normalizeMangledLatexCommands,
  normalizeStudyMessageContent,
  prepareStudyMessageMarkdown,
  protectMathRegions,
  repairCasesEnvironmentTypos,
  repairOrphanDisplayDelimiters,
  repairOrphanEndCases,
  repairPartialCasesBlocks,
  repairMalformedMathDelimiters,
  repairUnclosedMathDelimiters,
  sanitizeStudyMathContent,
  separateMathFromMarkdownHeaders,
  splitAndSanitizeMathChunks,
  stripAsciiDiagramArtifacts,
  stripInternalContentMarkers,
  stripLeadingPartialMath,
  unprotectMathRegions,
  wrapAsciiDiagramSections,
  wrapInlineLatex,
} from "../lib/study-message-content.js";
import {
  isPlainQuizOptionText,
  normalizeQuizOptionMath,
  prepareQuizOptionMarkdown,
  repairOrphanDollarLines,
  repairQuizMathDelimiters,
} from "../lib/quiz-display-text.js";
import {
  renderStudyCoachMarkdownText,
  renderQuizOptionMarkdownText,
  renderedStudyCoachMarkdownHasVisibleDollar,
} from "../lib/study-markdown-render.js";

test("normalizeStudyMessageContent converts literal escape sequences", () => {
  assert.equal(normalizeStudyMessageContent("Line one\\nLine two"), "Line one\nLine two");
  assert.equal(normalizeStudyMessageContent("Tab\\there"), "Tab\there");
  assert.equal(normalizeStudyMessageContent("Line one\\\\nLine two"), "Line one\nLine two");
});

test("convertLatexDelimiters maps inline and block delimiters", () => {
  const inline = convertLatexDelimiters("Solve \\( n + 2 \\) for n.");
  assert.match(inline, /\$n \+ 2\$/);

  const block = convertLatexDelimiters("Formula:\\n\\[ x^2 + y^2 = z^2 \\]");
  assert.match(block, /\$\$x\^2 \+ y\^2 = z\^2\$\$/);
});

test("convertBlockLatexEnvironments wraps cases and align blocks", () => {
  const cases = convertBlockLatexEnvironments(
    "Base values \\begin{cases} F_0 = 0 \\\\ F_1 = 1 \\end{cases} here.",
  );
  assert.match(cases, /\$\$[\s\S]*\\begin\{cases\}[\s\S]*\\end\{cases\}[\s\S]*\$\$/);

  const align = convertBlockLatexEnvironments(
    "\\begin{align} a &= b \\\\ c &= d \\end{align}",
  );
  assert.match(align, /\$\$[\s\S]*\\begin\{align\}[\s\S]*\\end\{align\}[\s\S]*\$\$/);
});

test("wrapInlineLatex wraps subscripts and commands", () => {
  const fib = wrapInlineLatex("Fibonacci uses F_n = F_{n-1} + F_{n-2}.");
  assert.match(fib, /\$F_n = F_\{n-1\} \+ F_\{n-2\}\$/);

  const inequality = wrapInlineLatex("Compare a_n \\geq a_{n-1}.");
  assert.match(inequality, /\$a_n \\geq a_\{n-1\}\$/);
});

test("formatStudyMessageLists breaks inline numbered items", () => {
  const formatted = formatStudyMessageLists("Formulae: 1. Factorial: n! 2. Fibonacci: F_n");
  assert.match(formatted, /Formulae:\n\n1\. Factorial/);
  assert.match(formatted, /\n\n2\. Fibonacci/);
});

test("prepareStudyMessageMarkdown normalizes and converts math", () => {
  const prepared = prepareStudyMessageMarkdown("### Example:\\n\\nUse \\( n \\).");
  assert.match(prepared, /### Example:/);
  assert.match(prepared, /\$n\$/);
  assert.doesNotMatch(prepared, /\\n/);
});

test("fixMalformedCasesEnvironments repairs mixed dollar delimiters and mangled text", () => {
  const raw =
    "\\begin{cases} $F_0 = 0 F_1 = 1 F_n = F_{n-1} + F_{n-2} \\quad$ ext{for } n $\\geq$ 2 \\end{cases}";

  const fixed = fixMalformedCasesEnvironments(raw);

  assert.doesNotMatch(fixed, /\$/);
  assert.match(fixed, /\\text\{for \}/);
  assert.match(fixed, /\\\\/);
  assert.match(fixed, /F_0 = 0/);
  assert.match(fixed, /F_1 = 1/);
  assert.match(fixed, /F_n = F_\{n-1\} \+ F_\{n-2\}/);
});

test("normalizeMangledLatexCommands restores text command", () => {
  assert.match(normalizeMangledLatexCommands("ext{for } n"), /\\text\{for \}/);
});

test("prepareStudyMessageMarkdown renders Fibonacci cases as display math", () => {
  const raw =
    "Fibonacci: \\begin{cases} $F_0 = 0 F_1 = 1 F_n = F_{n-1} + F_{n-2} \\quad$ ext{for } n $\\geq$ 2 \\end{cases}";

  const prepared = prepareStudyMessageMarkdown(raw);

  assert.match(prepared, /\$\$[\s\S]*\\begin\{cases\}[\s\S]*\\end\{cases\}[\s\S]*\$\$/);
  assert.match(prepared, /\\text\{for \}/);
  assert.match(prepared, /\\\\/);
  assert.doesNotMatch(prepared, /(?<![\\t])ext\{/);
});

test("prepareStudyMessageMarkdown splits comma-separated Fibonacci cases", () => {
  const raw = "\\begin{cases} F_0=0, F_1=1, F_n=F_{n-1}+F_{n-2} \\end{cases}";
  const prepared = prepareStudyMessageMarkdown(raw);

  assert.match(prepared, /\$\$[\s\S]*\\begin\{cases\}[\s\S]*F_0=0[\s\S]*\\\\[\s\S]*F_1=1[\s\S]*\\\\[\s\S]*F_n=F_\{n-1\}[\s\S]*\\end\{cases\}[\s\S]*\$\$/);
  assert.doesNotMatch(prepared, /F_0=0,\s*\\\\/);
});

test("convertBlockLatexEnvironments wraps gathered and matrix blocks", () => {
  const gathered = convertBlockLatexEnvironments("\\begin{gathered} a+b=c \\end{gathered}");
  assert.match(gathered, /\$\$[\s\S]*\\begin\{gathered\}[\s\S]*\\end\{gathered\}[\s\S]*\$\$/);

  const matrix = convertBlockLatexEnvironments("\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}");
  assert.match(matrix, /\$\$[\s\S]*\\begin\{pmatrix\}[\s\S]*\\end\{pmatrix\}[\s\S]*\$\$/);
});

test("wrapInlineLatex wraps frac and quad commands", () => {
  const fraction = wrapInlineLatex("Use \\frac{a}{b} and spacing \\quad x.");
  assert.match(fraction, /\$\\frac\{a\}\{b\}\$/);
  assert.match(fraction, /\$\\quad\$/);
});

test("formatStudyMessageLists does not split minus signs inside inline math", () => {
  const formatted = formatStudyMessageLists("$a_n = 2^n - 1$");
  assert.equal(formatted, "$a_n = 2^n - 1$");
});

test("formatStudyMessageLists does not split minus signs inside display math", () => {
  const formatted = formatStudyMessageLists("$$P_n = 1.1 P_{n-1} - 50$$ with $P_1 = 1000$");
  assert.equal(formatted, "$$P_n = 1.1 P_{n-1} - 50$$ with $P_1 = 1000$");
});

test("stripInternalContentMarkers removes leaked math region tokens", () => {
  assert.equal(stripInternalContentMarkers("4,200 \uE000MATH3\uE001"), "4,200");
  assert.equal(stripInternalContentMarkers("keep 3,600"), "keep 3,600");
});

test("prepareQuizOptionMarkdown keeps plain numeric options without math delimiters", () => {
  assert.equal(prepareQuizOptionMarkdown("4,200"), "4,200");
  assert.equal(prepareQuizOptionMarkdown("$4,200$"), "4,200");
  assert.equal(prepareQuizOptionMarkdown("3,600"), "3,600");
  assert.equal(prepareQuizOptionMarkdown("4,200 \uE000MATH3\uE001"), "4,200");
  assert.equal(isPlainQuizOptionText(prepareQuizOptionMarkdown("$4,200$")), true);
});

test("prepareQuizOptionMarkdown preserves real math options", () => {
  const prepared = prepareQuizOptionMarkdown("$a_n = 2^n - 1$");
  assert.match(prepared, /\$a_n = 2\^n - 1\$/);
  assert.equal(isPlainQuizOptionText(prepared), false);
});

test("repairOrphanDollarLines removes lines that contain only dollar delimiters", () => {
  const raw = "$\n\\begin{pmatrix} 0.43 \\\\ 0.57 \\end{pmatrix}\n$";
  const repaired = repairOrphanDollarLines(raw);
  assert.doesNotMatch(repaired, /^\s*\$\s*$/m);
  assert.match(repaired, /\\begin\{pmatrix\}/);
});

test("repairQuizMathDelimiters fixes $$...$$$$ derivative option from screenshot", () => {
  const raw = "$$f'(x) = \\frac{(e^x)}{(e^x)^2}$$$$";
  const repaired = repairQuizMathDelimiters(raw);
  assert.equal(repaired, "$f'(x) = \\frac{(e^x)}{(e^x)^2}$");
});

test("repairQuizMathDelimiters collapses balanced display math to inline", () => {
  const raw = "$$a_n = 2^n - 1$$";
  assert.equal(repairQuizMathDelimiters(raw), "$a_n = 2^n - 1$");
});

test("prepareQuizOptionMarkdown fixes malformed $$...$$$$ without raw LaTeX", () => {
  const raw = "$$f'(x) = \\frac{(e^x)}{(e^x)^2}$$$$";
  const prepared = prepareQuizOptionMarkdown(raw);
  assert.match(prepared, /^\$f'\(x\)/);
  assert.match(prepared, /\\frac\{\(e\^x\)\}\{\(e\^x\)\^2\}\$$/);
  assert.doesNotMatch(prepared, /\$\$/);
});

test("renderQuizOptionMarkdownText renders fixed derivative option without stray dollars", () => {
  const raw = "$$f'(x) = \\frac{(e^x)}{(e^x)^2}$$$$";
  const rendered = renderQuizOptionMarkdownText(raw);
  assert.doesNotMatch(rendered, /\$/);
  assert.match(rendered, /f/i);
});

test("normalizeQuizOptionMath collapses multiline pmatrix display math to inline", () => {
  const raw = "$$\n\\begin{pmatrix} 0.43 \\\\ 0.57 \\end{pmatrix}\n$$";
  const normalized = normalizeQuizOptionMath(raw);
  assert.equal(normalized, "$\\begin{pmatrix} 0.43 \\\\ 0.57 \\end{pmatrix}$");
});

test("prepareQuizOptionMarkdown collapses multiline pmatrix without stray dollar signs", () => {
  const raw = "$$\n\\begin{pmatrix} 0.43 \\\\ 0.57 \\end{pmatrix}\n$$";
  const prepared = prepareQuizOptionMarkdown(raw);
  assert.doesNotMatch(prepared, /^\s*\$\s*$/m);
  assert.match(prepared, /^\$\\begin\{pmatrix\}/);
  assert.match(prepared, /\\end\{pmatrix\}\$$/);
  assert.doesNotMatch(prepared, /\$\$/);
});

test("renderQuizOptionMarkdownText renders pmatrix without stray dollar signs", () => {
  const raw = "$$\n\\begin{pmatrix} 0.43 \\\\ 0.57 \\end{pmatrix}\n$$";
  const rendered = renderQuizOptionMarkdownText(raw);
  assert.doesNotMatch(rendered, /\$/);
  assert.match(rendered, /0\.43/);
});

test("renderQuizOptionMarkdownText hides internal markers for numeric options", () => {
  assert.equal(renderQuizOptionMarkdownText("4,200"), "4,200");
  assert.equal(renderQuizOptionMarkdownText("4,200 \uE000MATH3\uE001"), "4,200");
  const rendered = renderQuizOptionMarkdownText("$a_n = 2^n - 1$");
  assert.doesNotMatch(rendered, /MATH\d/i);
  assert.doesNotMatch(rendered, /Plain formula/i);
});

test("prepareStudyMessageMarkdown preserves recursive relation quiz options", () => {
  const options = [
    "$a_n = 2a_{n-1} + 1$",
    "$a_n = 2^n - 1$",
    "$a_n = n + 1$",
    "$a_n = 2^n$",
  ];

  for (const option of options) {
    const prepared = prepareStudyMessageMarkdown(option);
    assert.doesNotMatch(prepared, /\n-\s/);
    assert.match(prepared, /\$[^$\n]+\$/);
  }
});

test("prepareStudyMessageMarkdown preserves question text with recursive sums", () => {
  const prepared = prepareStudyMessageMarkdown(
    "Given $S_n = S_{n-1} + 3n$ and $S_1 = 2$, find $S_5$.",
  );

  assert.match(prepared, /\$S_n = S_\{n-1\} \+ 3n\$/);
  assert.doesNotMatch(prepared, /\n-\s/);
});

test("prepareStudyMessageMarkdown preserves display and inline math together", () => {
  const prepared = prepareStudyMessageMarkdown(
    "$$P_n = 1.1 P_{n-1} - 50$$ with $P_1 = 1000$",
  );

  assert.match(prepared, /\$\$P_n = 1\.1 P_\{n-1\} - 50\$\$/);
  assert.match(prepared, /\$P_1 = 1000\$/);
  assert.doesNotMatch(prepared, /50with/);
  assert.doesNotMatch(prepared, /\n-\s/);
});

test("protectMathRegions round-trips math placeholders", () => {
  const source = "Option $a_n = 2^n - 1$ and $$x = y - 3$$";
  const { text, regions } = protectMathRegions(source);
  assert.doesNotMatch(text, /\$a_n/);
  assert.equal(unprotectMathRegions(text, regions), source);
});

test("prepareStudyMessageMarkdown converts inline LaTeX in explanation text", () => {
  const prepared = prepareStudyMessageMarkdown(
    "The recurrence is \\( S_n = S_{n-1} + 3n \\) and the z-score is \\( z = \\frac{X - \\mu}{\\sigma} \\).",
  );

  assert.match(prepared, /\$S_n = S_\{n-1\} \+ 3n\$/);
  assert.match(prepared, /\$z = \\frac\{X - \\mu\}\{\\sigma\}\$/);
  assert.doesNotMatch(prepared, /\\\(/);
});

test("prepareStudyMessageMarkdown handles off-topic recursion reply from screenshot", () => {
  const raw =
    "OFF-TOPIC: Let's stay focused on the assignment topic. For reference, recursion formulae include: 1. Factorial: n! = n(n-1)! 2. Fibonacci: F_n = F_{n-1} + F_{n-2} with \\begin{cases} F_0 = 0 \\\\ F_1 = 1 \\end{cases} and monotonic sequences satisfy a_n \\geq a_{n-1}.";

  const prepared = prepareStudyMessageMarkdown(raw);

  assert.doesNotMatch(prepared, /OFF-TOPIC:/);
  assert.match(prepared, /Let's stay focused on the assignment topic/);
  assert.match(prepared, /\n\n1\. Factorial/);
  assert.match(prepared, /\n\n2\. Fibonacci/);
  assert.match(prepared, /\$\$[\s\S]*\\begin\{cases\}[\s\S]*\\end\{cases\}[\s\S]*\$\$/);
  assert.match(prepared, /\$F_n = F_\{n-1\} \+ F_\{n-2\}\$/);
  assert.match(prepared, /\$a_n \\geq a_\{n-1\}\$/);
  assert.match(prepared, /\$\$[\s\S]*\\begin\{cases\}[\s\S]*\\end\{cases\}[\s\S]*\$\$/);
});

test("sanitizeStudyMathContent renders screenshot recurrence cases block", () => {
  const raw =
    "\\begin{cases}b_1 = 1 \\quad \\text{(base case)} \\\\ b_2 = 3 \\quad \\text{(base case)} \\\\ b_n = b_{n-1} + 2 \\times b_{n-2} \\quad \\text{for } n \\geq 3 \\end{cases}";

  const prepared = sanitizeStudyMathContent(raw);

  assert.match(prepared, /^\$\$/);
  assert.match(prepared, /\$\$[\s\S]*\\begin\{cases\}[\s\S]*\\end\{cases\}[\s\S]*\$\$/);
  assert.match(prepared, /b_1 = 1 \\quad \\text\{\(base case\)\}/);
  assert.match(prepared, /b_2 = 3 \\quad \\text\{\(base case\)\}/);
  assert.match(prepared, /b_n = b_\{n-1\} \+ 2 \\times b_\{n-2\} \\quad \\text\{for \} n \\geq 3/);
  assert.doesNotMatch(prepared, /^\\begin\{cases\}/);
  assert.equal((prepared.match(/\$\$/g) || []).length, 2);
});

test("normalizeMangledBackslashes repairs double-escaped begin cases", () => {
  const raw =
    "\\\\begin{cases}b_1 = 1 \\\\quad \\\\text{(base case)} \\\\\\\\ b_2 = 3 \\\\end{cases}";

  const prepared = sanitizeStudyMathContent(raw);

  assert.doesNotMatch(prepared, /^\\/);
  assert.match(prepared, /\$\$[\s\S]*\\begin\{cases\}[\s\S]*\\end\{cases\}[\s\S]*\$\$/);
});

test("repairUnclosedMathDelimiters closes partial display math", () => {
  const repaired = repairUnclosedMathDelimiters("$$\\begin{cases}b_1 = 1 \\\\ b_2 = 3");
  assert.match(repaired, /\$\$[\s\S]*\\begin\{cases\}[\s\S]*b_2 = 3[\s\S]*\$\$/);
});

test("sanitizeStudyMathContent is idempotent for wrapped cases blocks", () => {
  const raw =
    "\\begin{cases}b_1 = 1 \\quad \\text{(base case)} \\\\ b_2 = 3 \\end{cases}";
  const once = sanitizeStudyMathContent(raw);
  const twice = sanitizeStudyMathContent(once);

  assert.equal(twice, once);
});

test("protectMathRegions shields bare cases from list formatting", () => {
  const raw =
    "Compare - note this \\begin{cases}b_1 = 1 \\\\ b_2 = 3 \\end{cases} carefully.";
  const { text, regions } = protectMathRegions(raw);
  const formatted = formatStudyMessageLists(text);
  const restored = unprotectMathRegions(formatted, regions);

  assert.match(restored, /\\begin\{cases\}b_1 = 1 \\\\ b_2 = 3 \\end\{cases\}/);
  assert.doesNotMatch(restored, /\\begin\{cases\}\n-/);
});

test("repairCasesEnvironmentTypos fixes begin{case} and end{case} typos", () => {
  const raw = "\\begin{case} F_0 = 0 \\\\ F_1 = 1 \\end{case}";
  const repaired = repairCasesEnvironmentTypos(raw);
  assert.match(repaired, /\\begin\{cases\}/);
  assert.match(repaired, /\\end\{cases\}/);
});

test("prepareStudyMessageMarkdown wraps typo cases blocks in display math", () => {
  const raw =
    "### Step-by-step solution\n\n\\begin{case} F_0 = 0 \\\\ F_1 = 1 \\end{cases}";

  const prepared = prepareStudyMessageMarkdown(raw);

  assert.match(prepared, /### Step-by-step solution/);
  assert.match(prepared, /\$\$[\s\S]*\\begin\{cases\}[\s\S]*\\end\{cases\}[\s\S]*\$\$/);
  assert.doesNotMatch(prepared, /\\begin\{case\}/);
});

test("repairPartialCasesBlocks prepends begin{cases} when only end is present", () => {
  const raw = "b_1 = 1 \\\\ b_2 = 3 \\end{cases}";
  const repaired = repairPartialCasesBlocks(raw);
  assert.match(repaired, /^\\begin\{cases\}/);
  assert.match(repaired, /\\end\{cases\}$/);
});

test("prepareStudyMessageMarkdown wraps boxed without nested dollar signs", () => {
  const prepared = prepareStudyMessageMarkdown("The answer is \\boxed{b_5 = 21} with \\geq 3.");
  assert.match(prepared, /\$\\boxed\{b_5 = 21\}\$/);
  assert.doesNotMatch(prepared, /\$\\boxed\{\$/);
  assert.match(prepared, /\$\\geq\$/);
});

test("prepareStudyMessageMarkdown handles screenshot recurrence typo cases block", () => {
  const raw =
    "\\begin{case} b_1 = 1 \\quad \\text{(base case)} \\\\ b_2 = 3 \\quad \\text{(base case)} \\\\ b_n = b_{n-1} + 2 \\times b_{n-2} \\quad \\text{for } n \\geq 3 \\end{cases}";

  const prepared = prepareStudyMessageMarkdown(raw);

  assert.match(prepared, /^\$\$/);
  assert.match(prepared, /\$\$[\s\S]*\\begin\{cases\}[\s\S]*\\end\{cases\}[\s\S]*\$\$/);
  assert.match(prepared, /b_1 = 1 \\quad \\text\{\(base case\)\}/);
  assert.doesNotMatch(prepared, /\\begin\{case\}/);
});

test("normalizeMangledBackslashes restores begin and text commands", () => {
  assert.match(
    normalizeMangledBackslashes("\\\\begin{cases} a \\\\quad \\\\text{for } n \\\\end{cases}"),
    /\\begin\{cases\} a \\quad \\text\{for \} n \\end\{cases\}/,
  );
});

test("stripLeadingPartialMath removes orphan end cases and stray display delimiters", () => {
  const stripped = stripLeadingPartialMath("\\end{cases}$$\nF_n = 1");
  assert.equal(stripped, "F_n = 1");
});

test("repairOrphanEndCases prepends begin for mid-content orphan cases blocks", () => {
  const raw = "F_n = F_{n-1} + F_{n-2} \\quad \\text{for } n \\geq 2 \\end{cases}";
  const repaired = repairOrphanEndCases(raw);
  assert.match(repaired, /^\\begin\{cases\}/);
  assert.match(repaired, /\\end\{cases\}$/);
  assert.match(repaired, /F_n = F_\{n-1\} \+ F_\{n-2\}/);
});

test("repairOrphanDisplayDelimiters wraps bare cases blocks in display math", () => {
  const raw = "\\begin{cases}F_0 = 0 \\\\ F_1 = 1 \\end{cases}$$";
  const repaired = repairOrphanDisplayDelimiters(raw);
  assert.match(repaired, /^\$\$/);
  assert.match(repaired, /\$\$$/);
  assert.equal((repaired.match(/\$\$/g) || []).length, 2);
});

test("prepareStudyMessageMarkdown repairs screenshot-like orphan cases blob", () => {
  const raw = String.raw`\end{cases}$$
F_n = F_{n-1} + F_{n-2} \quad \text{for } n \geq 2 \end{cases}$$

### Diagram:
Recursion tree for fib(5)

### Labels:
- F0, F1, F2

### Fibonacci sequence terms
F2 = F1 + F0 = 1
F3 = F2 + F1 = 1
F4 = F3 + F2 = 2`;

  const prepared = prepareStudyMessageMarkdown(raw);

  assert.doesNotMatch(prepared, /^\\end\{cases\}/);
  assert.match(prepared, /\$\$[\s\S]*\\begin\{cases\}[\s\S]*\\end\{cases\}[\s\S]*\$\$/);
  assert.match(prepared, /\\text\{for \}/);
  assert.doesNotMatch(prepared, /### Diagram:/);
  assert.doesNotMatch(prepared, /### Labels:/);
  assert.match(prepared, /### Fibonacci sequence terms/);
  assert.match(prepared, /F2 = F1 \+ F0 = 1/);
  assert.doesNotMatch(prepared, /F0 = 0 --> F2/);
  assert.equal((prepared.match(/\\end\{cases\}/g) || []).length, 1);
});

test("splitAndSanitizeMathChunks preserves markdown headers while fixing math bodies", () => {
  const raw = String.raw`F_n = F_{n-1} + F_{n-2} \end{cases}

### Fibonacci sequence terms
F2 = 1`;

  const prepared = splitAndSanitizeMathChunks(raw);
  assert.match(prepared, /### Fibonacci sequence terms/);
  assert.match(prepared, /\$\$[\s\S]*\\begin\{cases\}/);
});

test("separateMathFromMarkdownHeaders breaks inline headers after display math", () => {
  const raw = String.raw`$$\begin{cases}F_0 = 0\end{cases}$$ ### Diagram:`;
  const separated = separateMathFromMarkdownHeaders(raw);
  assert.match(separated, /\$\$\n\n### Diagram:/);
  assert.doesNotMatch(separated, /\$\$ ### Diagram:/);
});

test("prepareStudyMessageMarkdown repairs exact orphan end cases inline diagram pattern", () => {
  const raw = String.raw`\end{cases}$$ F_0 = 0 F_1 = 1 F_n = F_{n-1} + F_{n-2} \quad \text{for } n \geq 2 \end{cases}$$ ### Diagram:
F0 = 0 --> F2 = F1 + F0

### Labels:
- F0, F1`;

  const prepared = prepareStudyMessageMarkdown(raw);

  assert.doesNotMatch(prepared, /^\\end\{cases\}/);
  assert.doesNotMatch(prepared, /\$\$ ###/);
  assert.match(prepared, /\$\$[\s\S]*\\begin\{cases\}[\s\S]*\\end\{cases\}[\s\S]*\$\$/);
  assert.doesNotMatch(prepared, /### Diagram:/);
  assert.doesNotMatch(prepared, /F0 = 0 --> F2/);
  assert.equal((prepared.match(/\\end\{cases\}/g) || []).length, 1);
});

test("repairPartialCasesBlocks repairs content starting with orphan end cases", () => {
  const raw = String.raw`\end{cases}$$
F_0 = 0 F_1 = 1 F_n = F_{n-1} + F_{n-2} \end{cases}$$`;
  const repaired = repairPartialCasesBlocks(raw);
  assert.match(repaired, /\\begin\{cases\}/);
  assert.match(repaired, /\\end\{cases\}/);
  assert.doesNotMatch(repaired, /^\\end\{cases\}/);
});

test("stripAsciiDiagramArtifacts removes diagram sections and arrow flows", () => {
  const raw = `### Diagram:
F0 = 0 --> F2 = F1 + F0

### Labels:
- F0, F1

Keep this explanation.`;

  const stripped = stripAsciiDiagramArtifacts(raw);

  assert.doesNotMatch(stripped, /### Diagram:/);
  assert.doesNotMatch(stripped, /F0 = 0 --> F2/);
  assert.match(stripped, /Keep this explanation/);
});

test("prepareStudyMessageMarkdown wraps raw frac in portion text", () => {
  const prepared = prepareStudyMessageMarkdown("Half the area is \\frac{1}{2} of the whole.");
  assert.match(prepared, /\$\\frac\{1\}\{2\}\$/);
});

test("latexToPlainText converts frac to readable text", () => {
  const plain = latexToPlainText("Use $\\frac{1}{2}$ of the circle.");
  assert.match(plain, /\(1\)\/\(2\)/);
});

test("convertUnicodeMathSymbols maps common math unicode to LaTeX", () => {
  assert.match(convertUnicodeMathSymbols("α + β = γ"), /\\alpha \+ \\beta = \\gamma/);
  assert.match(convertUnicodeMathSymbols("x ± 3"), /x \\pm 3/);
  assert.match(convertUnicodeMathSymbols("∫ f(x) dx"), /\\int f\(x\) dx/);
  assert.match(convertUnicodeMathSymbols("√2 and √(x+1)"), /\\sqrt\{2\} and \\sqrt\{x\+1\}/);
  assert.match(convertUnicodeMathSymbols("30°"), /30\^\{\\circ\}/);
});

test("wrapInlineLatex wraps bare superscripts", () => {
  const wrapped = wrapInlineLatex("The area of a square is x^2 square units.");
  assert.match(wrapped, /\$x\^2\$/);
});

test("prepareStudyMessageMarkdown wraps undelimited superscripts and unicode symbols", () => {
  const prepared = prepareStudyMessageMarkdown(
    "Solve x^2 + y^2 = r^2 where θ is the angle and α, β are roots. Use √16 ± 1.",
  );

  assert.match(prepared, /\$x\^2\$/);
  assert.match(prepared, /\$y\^2\$/);
  assert.match(prepared, /\$r\^2\$/);
  assert.match(prepared, /\$\\theta\$/);
  assert.match(prepared, /\$\\alpha\$/);
  assert.match(prepared, /\$\\beta\$/);
  assert.match(prepared, /\$\\sqrt\{16\}(?:\s*\\pm)?\$/);
  assert.match(prepared, /\\pm/);
});

test("prepareStudyMessageMarkdown preserves mermaid diagram fences", () => {
  const raw = `### Flow:
\`\`\`mermaid
flowchart TD
A["α node"] --> B["β node"]
\`\`\``;

  const prepared = prepareStudyMessageMarkdown(raw);

  assert.match(prepared, /```mermaid[\s\S]*flowchart TD[\s\S]*```/);
  assert.doesNotMatch(prepared, /\\alpha node/);
});

test("repairMalformedMathDelimiters fixes double-escaped and split trig identity", () => {
  const raw = "$\\$\\sin^2 \\theta$ + $\\cos^2 \\theta = 1 }$$";
  const repaired = repairMalformedMathDelimiters(raw);
  assert.equal(repaired, "$\\sin^2 \\theta + \\cos^2 \\theta = 1$");
});

test("prepareStudyMessageMarkdown repairs screenshot-like split trig identity in portion", () => {
  const raw =
    "### The Formula You Might Be Referring To:\n\n$\\$\\sin^2 \\theta$ + $\\cos^2 \\theta = 1 }$$\n\n---$$";

  const prepared = prepareStudyMessageMarkdown(raw);

  assert.match(prepared, /### The Formula You Might Be Referring To:/);
  assert.match(prepared, /\$\\sin\^2 \\theta \+ \\cos\^2 \\theta = 1\$/);
  assert.doesNotMatch(prepared, /\$\\\$/);
  assert.doesNotMatch(prepared, /---\$\$/);
  assert.doesNotMatch(prepared, /\}\$\$/);

  const twice = prepareStudyMessageMarkdown(prepared);
  assert.equal(twice, prepared);
});

test("wrapInlineLatex does not double-wrap already delimited expressions", () => {
  const input = "$\\sin^2 \\theta + \\cos^2 \\theta = 1$";
  assert.equal(wrapInlineLatex(input), input);
  assert.equal(wrapInlineLatex(wrapInlineLatex(input)), input);
});

test("prepareStudyMessageMarkdown wraps bare trig identity without splitting commands", () => {
  const prepared = prepareStudyMessageMarkdown("\\sin^2 \\theta + \\cos^2 \\theta = 1");
  assert.match(prepared, /\$\\sin\^2 \\theta \+ \\cos\^2 \\theta = 1\$/);
  assert.doesNotMatch(prepared, /\$\\sin\$\^2/);
});

test("latexToUnicode converts trig identity without dollar delimiters", () => {
  const unicode = latexToUnicode("$\\sin^2 \\theta + \\cos^2 \\theta = 1$");
  assert.match(unicode, /sin²\s*θ/);
  assert.match(unicode, /cos²\s*θ/);
  assert.doesNotMatch(unicode, /\$/);
});

test("rendered coach markdown hides dollar signs for trig identity portion", () => {
  const raw =
    "### The Formula You Might Be Referring To:\n\n$\\$\\sin^2 \\theta$ + $\\cos^2 \\theta = 1 }$$\n\n---$$";

  assert.equal(renderedStudyCoachMarkdownHasVisibleDollar(raw), false);
  const rendered = renderStudyCoachMarkdownText(raw);
  assert.match(rendered, /sin|θ|cos|=/i);
  assert.doesNotMatch(rendered, /\$/);
});

test("latexToPlainText converts trig identity without dollar delimiters", () => {
  const plain = latexToPlainText("The identity $\\sin^2 \\theta + \\cos^2 \\theta = 1$.");
  assert.match(plain, /sin squared/i);
  assert.match(plain, /θ/);
  assert.doesNotMatch(plain, /\$/);
});
