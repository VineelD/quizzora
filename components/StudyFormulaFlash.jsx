"use client";

import {
  hasFlashableFormulas,
  normalizeFlashFormulas,
  renderFormulaFlashHtml,
} from "../lib/study-formula-flash.js";

export default function StudyFormulaFlash({ formulas = [], className = "" }) {
  const items = normalizeFlashFormulas(formulas);
  if (!items.length) {
    return null;
  }

  return (
    <div className={`study-formula-flash${className ? ` ${className}` : ""}`} aria-label="Key formulas">
      {items.map((item) => {
        const html = item.expression ? renderFormulaFlashHtml(item.expression) : "";
        return (
          <figure className="study-formula-flash-card study-flash-reveal" key={`${item.label}-${item.expression}`}>
            {item.label ? <figcaption className="study-formula-flash-label">{item.label}</figcaption> : null}
            {html ? (
              <div
                className="study-formula-flash-equation"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

export { hasFlashableFormulas };
