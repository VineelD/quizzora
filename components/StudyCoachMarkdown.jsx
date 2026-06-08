"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { isMermaidFenceLanguage } from "../lib/study-diagram-render.js";
import { prepareQuizQuestionMarkdown } from "../lib/quiz-display-text.js";
import { latexToUnicode, prepareStudyMessageMarkdown } from "../lib/study-message-content.js";
import MermaidDiagram from "./MermaidDiagram.jsx";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.min.css";

function visitKatexErrors(tree, onError) {
  if (!tree || typeof tree !== "object") {
    return;
  }

  if (tree.type === "element" && Array.isArray(tree.properties?.className)) {
    const classNames = tree.properties.className;
    if (classNames.includes("katex-error")) {
      onError(tree);
      return;
    }
  }

  const children = tree.children;
  if (!Array.isArray(children)) {
    return;
  }

  for (const child of children) {
    visitKatexErrors(child, onError);
  }
}

function rehypeKatexFallback({ suppressChip = false } = {}) {
  return (tree) => {
    visitKatexErrors(tree, (node) => {
      const raw = String(node.children?.[0]?.value || node.properties?.title || "").trim();
      if (!raw) {
        return;
      }

      const plain = latexToUnicode(raw) || raw.replace(/[$\\]/g, "").trim();
      node.tagName = "span";
      node.properties = { className: ["study-math-fallback-wrap"] };
      node.children = [
        {
          type: "element",
          tagName: "span",
          properties: { className: ["study-math-fallback-text"] },
          children: [{ type: "text", value: plain }],
        },
      ];

      if (!suppressChip) {
        node.children.push({
          type: "element",
          tagName: "span",
          properties: {
            className: ["study-math-warning-chip"],
            role: "status",
            "aria-label": "Formula shown as plain text because rendering failed",
          },
          children: [{ type: "text", value: "Plain formula" }],
        });
      }
    });
  };
}

export default function StudyCoachMarkdown({
  children,
  className = "study-markdown",
  variant,
  plainMode = false,
  suppressMathFallback = false,
  skipPrepare = false,
}) {
  const isQuiz = variant === "quiz";
  const suppressChip = suppressMathFallback || isQuiz;

  const source = useMemo(() => {
    const value = String(children ?? "").trim();
    if (!value) {
      return "";
    }
    if (isQuiz && !skipPrepare) {
      return prepareQuizQuestionMarkdown(value);
    }
    if (skipPrepare || plainMode) {
      return value;
    }
    return prepareStudyMessageMarkdown(value);
  }, [children, isQuiz, plainMode, skipPrepare]);

  if (!source) {
    return null;
  }

  const remarkPlugins = plainMode ? [remarkGfm] : [remarkGfm, remarkMath];
  const rehypePlugins = [
    ...(plainMode
      ? []
      : [
          [rehypeKatex, { throwOnError: false, strict: "ignore" }],
          rehypeKatexFallback({ suppressChip }),
        ]),
    rehypeHighlight,
  ];

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          pre({ node, children, ...props }) {
            const codeNode = node?.children?.[0];
            const classNames = codeNode?.properties?.className;
            const language = Array.isArray(classNames)
              ? classNames.find((item) => String(item).startsWith("language-"))?.replace("language-", "")
              : "";

            if (isMermaidFenceLanguage(language)) {
              const source = codeNode?.children?.[0]?.value || "";
              return <MermaidDiagram className="study-inline-mermaid" source={source} />;
            }

            return <pre {...props}>{children}</pre>;
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
