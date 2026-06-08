import zlib from "node:zlib";
import PDFDocument from "pdfkit";
import {
  buildCoachPdfSectionTitles,
  coachPayloadHasPdfBodyContent,
  formatCoachExportLine,
  formatCoachExportText,
} from "./study-export-content.js";
import { prepareStudyMessageMarkdown } from "./study-message-content.js";
import { getQuizImage } from "./db.js";
import { hasFlashableFormulas, normalizeFlashFormulas } from "./study-formula-flash.js";
import { isDiagramCapableStep, stepsToPlainText } from "./study-message-normalize.js";
import { resolveDiagramRenderMode } from "./study-diagram-render.js";
import { downloadImage } from "./question-images.js";
import { studentFacingBreadcrumb } from "./student-display.js";

export const FORMULA_FLASH_SECTION_MARKER = "Key formulas";

function resolveHeroStep(steps) {
  if (!Array.isArray(steps) || !steps.length) {
    return null;
  }
  return steps.find(isDiagramCapableStep) || null;
}

function slugify(value) {
  return String(value || "study")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function loadDiagramImageBuffer(step) {
  const imageUrl = String(step?.imageUrl || "").trim();
  if (!imageUrl) {
    return null;
  }

  const mediaMatch = imageUrl.match(/\/api\/quiz-media\/(\d+)/);
  if (mediaMatch) {
    const image = getQuizImage(Number(mediaMatch[1]));
    if (image?.imageData) {
      return { buffer: image.imageData, contentType: image.contentType || "image/png" };
    }
    return null;
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    try {
      const buffer = await downloadImage(imageUrl);
      return { buffer, contentType: "image/png" };
    } catch {
      return null;
    }
  }

  return null;
}

function writeDiagramText(doc, step) {
  const title = String(step?.diagramTitle || step?.diagram?.title || "").trim();
  const caption = String(step?.diagramCaption || step?.diagram?.caption || "").trim();
  const summary = String(step?.diagramSummary || step?.diagram?.whatItShows || "").trim();
  const diagramPrompt = String(step?.diagramPrompt || "").trim();
  const labels = step?.diagramLabels?.length ? step.diagramLabels : step?.diagram?.labels || [];
  const mode = resolveDiagramRenderMode(step);
  let wroteContent = false;

  if (title) {
    doc.font("Helvetica-Bold").fontSize(13).text(formatCoachExportText(title));
    doc.moveDown(0.3);
    wroteContent = true;
  }
  if (summary) {
    doc.font("Helvetica").fontSize(11).text(formatCoachExportText(summary));
    doc.moveDown(0.3);
    wroteContent = true;
  }
  if (mode === "mermaid" && step?.diagramMermaid) {
    doc.font("Helvetica-Oblique").fontSize(10).text("Flow diagram (see Study Coach for interactive view).");
    doc.moveDown(0.3);
    wroteContent = true;
  } else if (mode === "spec" && step?.diagramSpec) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(10)
      .text(`Structured diagram: ${String(step.diagramSpec.diagramType || step.diagramType || "diagram").replace(/_/g, " ")}`);
    doc.moveDown(0.3);
    wroteContent = true;
  }
  if (labels.length) {
    doc.font("Helvetica-Bold").fontSize(10).text("Labels");
    doc.font("Helvetica").fontSize(10).list(labels.map((label) => formatCoachExportText(label)));
    doc.moveDown(0.3);
    wroteContent = true;
  }
  if (caption) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor("#334155").text(formatCoachExportText(caption));
    doc.fillColor("#000000");
    wroteContent = true;
  }
  if (!wroteContent && diagramPrompt) {
    doc.font("Helvetica").fontSize(11).text(`Concept visual: ${formatCoachExportText(diagramPrompt)}`);
    wroteContent = true;
  }
  if (!wroteContent) {
    doc.font("Helvetica-Oblique").fontSize(10).text("Concept visual (see Study Coach for the interactive diagram).");
  }
}

function writeMarkdownBody(doc, value, { indent = 0, bodyFont = "Helvetica", bodySize = 11 } = {}) {
  const source = prepareStudyMessageMarkdown(String(value || "")).trim();
  if (!source) {
    return;
  }

  const rawLines = source.split("\n");
  const bullets = [];
  const paragraphs = [];

  const flushParagraphs = () => {
    if (!paragraphs.length) {
      return;
    }
    doc
      .font(bodyFont)
      .fontSize(bodySize)
      .text(paragraphs.join("\n\n"), {
        indent,
        paragraphGap: 6,
        lineGap: 2,
      });
    paragraphs.length = 0;
  };

  const flushBullets = () => {
    if (!bullets.length) {
      return;
    }
    doc.font(bodyFont).fontSize(bodySize).list(bullets, { indent: indent + 10, bulletRadius: 2 });
    doc.moveDown(0.25);
    bullets.length = 0;
  };

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushBullets();
      flushParagraphs();
      continue;
    }

    const headerMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (headerMatch) {
      flushBullets();
      flushParagraphs();
      doc.font("Helvetica-Bold").fontSize(bodySize + 1).text(formatCoachExportLine(headerMatch[1]), { indent });
      doc.moveDown(0.25);
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraphs();
      bullets.push(formatCoachExportLine(bulletMatch[1]));
      continue;
    }

    flushBullets();
    paragraphs.push(formatCoachExportLine(trimmed));
  }

  flushBullets();
  flushParagraphs();
}

function writeKeyIdeas(doc, keyIdeas) {
  const ideas = (Array.isArray(keyIdeas) ? keyIdeas : [])
    .map((idea) => formatCoachExportText(idea))
    .filter(Boolean);
  if (!ideas.length) {
    return;
  }

  doc.font("Helvetica-Bold").fontSize(13).text("Key ideas");
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(11).list(ideas, { bulletRadius: 2 });
  doc.moveDown(0.8);
}

function writeSectionRule(doc) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc.moveDown(0.35);
  doc.strokeColor("#e2e8f0").lineWidth(0.5).moveTo(left, doc.y).lineTo(right, doc.y).stroke();
  doc.strokeColor("#000000");
  doc.moveDown(0.65);
}

function stripStepTitlePrefix(title) {
  return String(title || "")
    .trim()
    .replace(/^Step \d+[ —-]\s*/i, "");
}

function writeNumberedSection(doc, index, title, body, { bodyFont = "Helvetica", bodySize = 11, indent = 0 } = {}) {
  const sectionTitle = title ? formatCoachExportLine(title) : `Part ${index}`;
  doc.font("Helvetica-Bold").fontSize(13).text(`${index}. ${sectionTitle}`);
  doc.moveDown(0.4);

  if (body) {
    writeMarkdownBody(doc, body, { indent, bodyFont, bodySize });
  }
  doc.moveDown(0.7);
}

function writePortionSections(doc, portions) {
  const items = Array.isArray(portions) ? portions : [];
  let index = 0;
  let wroteAny = false;

  for (const portion of items) {
    const label = String(portion?.label || "").trim();
    const content = String(portion?.content || "").trim();
    if (!label && !content) {
      continue;
    }

    index += 1;
    if (wroteAny) {
      writeSectionRule(doc);
    }
    writeNumberedSection(doc, index, label, content);
    wroteAny = true;
  }

  return index;
}

function writeStepSections(doc, steps, startIndex = 0) {
  const items = Array.isArray(steps) ? steps : [];
  let index = startIndex;
  let wroteAny = false;

  for (const step of items) {
    const title = stripStepTitlePrefix(step?.title);
    const text = String(step?.text || "").trim();
    if (!title && !text) {
      continue;
    }

    index += 1;
    if (wroteAny || startIndex > 0) {
      writeSectionRule(doc);
    }
    writeNumberedSection(doc, index, title, text);
    wroteAny = true;
  }

  return index - startIndex;
}

function writeStudyBody(doc, payload) {
  const portions = Array.isArray(payload?.portions) ? payload.portions : [];
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  const portionCount = writePortionSections(doc, portions);
  const stepCount = writeStepSections(doc, steps, portionCount);

  if (!portionCount && !stepCount) {
    const fallback = formatCoachExportText(stepsToPlainText(payload));
    if (!fallback) {
      return;
    }
    writeNumberedSection(doc, 1, "Study notes", fallback);
  }
}

function writeFormulaFlashCard(doc, item) {
  const x = doc.page.margins.left;
  const width = doc.page.width - x - doc.page.margins.right;
  const pad = 14;
  const label = item.label ? formatCoachExportText(item.label) : "";
  const expression = item.expression ? formatCoachExportText(item.expression) : "";

  let contentHeight = pad;
  if (label) {
    contentHeight += doc.font("Helvetica-Bold").fontSize(11).heightOfString(label, { width: width - pad * 2, align: "center" }) + 8;
  }
  if (expression) {
    contentHeight += doc.font("Courier").fontSize(14).heightOfString(expression, { width: width - pad * 2, align: "center" }) + 6;
  }
  contentHeight += pad;

  const y = doc.y;
  doc.roundedRect(x, y, width, contentHeight, 8).fillColor("#f8fafc").strokeColor("#cbd5e1").lineWidth(1).fillAndStroke();
  doc.fillColor("#000000").strokeColor("#000000");

  let cursorY = y + pad;
  if (label) {
    doc.font("Helvetica-Bold").fontSize(11).text(label, x + pad, cursorY, { width: width - pad * 2, align: "center" });
    cursorY = doc.y + 8;
  }
  if (expression) {
    doc.font("Courier").fontSize(14).text(expression, x + pad, cursorY, { width: width - pad * 2, align: "center" });
  }

  doc.y = y + contentHeight + 10;
}

function writeFormulas(doc, formulas) {
  const items = normalizeFlashFormulas(formulas);
  if (!items.length) {
    return;
  }

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#64748b").text(FORMULA_FLASH_SECTION_MARKER);
  doc.fillColor("#000000");
  doc.moveDown(0.45);

  for (const item of items) {
    writeFormulaFlashCard(doc, item);
  }

  doc.moveDown(0.3);
}

function writeConceptVisual(doc, heroStep, diagramImage) {
  doc.font("Helvetica-Bold").fontSize(13).text("Concept visual");
  doc.moveDown(0.5);

  if (diagramImage?.buffer) {
    const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    try {
      doc.image(diagramImage.buffer, { fit: [maxWidth, 320], align: "center" });
      doc.moveDown(0.6);
      const caption = String(heroStep?.diagramCaption || heroStep?.diagram?.caption || "").trim();
      if (caption) {
        doc.font("Helvetica-Oblique").fontSize(10).fillColor("#334155").text(formatCoachExportText(caption), { align: "center" });
        doc.fillColor("#000000");
        doc.moveDown(0.4);
      }
      return;
    } catch {
      // fall through to text diagram summary
    }
  }

  writeDiagramText(doc, heroStep);
}

export function extractStudyPdfText(buffer) {
  const raw = Buffer.isBuffer(buffer) ? buffer.toString("latin1") : String(buffer || "");
  let decompressed = "";
  const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let streamMatch = streamPattern.exec(raw);

  while (streamMatch) {
    try {
      decompressed += zlib.inflateSync(Buffer.from(streamMatch[1], "latin1")).toString("latin1");
    } catch {
      // ignore non-deflate streams
    }
    streamMatch = streamPattern.exec(raw);
  }

  const parts = [];
  const decodePdfEscaped = (value) =>
    value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\\\/g, "\\");

  const tjArrayPattern = /\[(.*?)\]\s*TJ/g;
  let tjMatch = tjArrayPattern.exec(decompressed);
  while (tjMatch) {
    const hexPattern = /<([0-9a-fA-F]+)>/g;
    let hexMatch = hexPattern.exec(tjMatch[1]);
    while (hexMatch) {
      parts.push(Buffer.from(hexMatch[1], "hex").toString("latin1"));
      hexMatch = hexPattern.exec(tjMatch[1]);
    }

    const parenPattern = /\(((?:\\.|[^\\)])*)\)/g;
    let parenMatch = parenPattern.exec(tjMatch[1]);
    while (parenMatch) {
      parts.push(decodePdfEscaped(parenMatch[1]));
      parenMatch = parenPattern.exec(tjMatch[1]);
    }

    tjMatch = tjArrayPattern.exec(decompressed);
  }

  const parenTjPattern = /\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  let parenTjMatch = parenTjPattern.exec(decompressed);
  while (parenTjMatch) {
    parts.push(decodePdfEscaped(parenTjMatch[1]));
    parenTjMatch = parenTjPattern.exec(decompressed);
  }

  return parts.join("");
}

export function buildStudyFileTitle(payload, context = {}) {
  const topic = String(payload?.topicHeader || context.focus || "this topic").trim();
  const hasFormulas = hasFlashableFormulas(payload?.formulas);
  const heroStep = resolveHeroStep(payload?.steps);
  const hasDiagram = Boolean(heroStep && isDiagramCapableStep(heroStep));

  if (hasFormulas && hasDiagram) {
    return `Study notes — ${topic}`;
  }
  if (hasFormulas) {
    return `Key formulas — ${topic}`;
  }
  if (hasDiagram) {
    const diagramTitle = String(heroStep.diagramTitle || heroStep.diagram?.title || topic).trim();
    return `Concept visual — ${diagramTitle}`;
  }
  return `Study notes — ${topic}`;
}

export function buildStudyFileFilename(title, fileId) {
  return `study-${fileId}-${slugify(title)}.pdf`;
}

export async function renderStudyCoachPdf({ assignmentTitle, context, payload }) {
  if (!coachPayloadHasPdfBodyContent(payload)) {
    throw new Error("No exportable content available for PDF.");
  }

  const heroStep = resolveHeroStep(payload?.steps);
  const hasFormulas = hasFlashableFormulas(payload?.formulas);
  const hasDiagram = Boolean(heroStep && isDiagramCapableStep(heroStep));
  const diagramImage = hasDiagram ? await loadDiagramImageBuffer(heroStep) : null;
  const hasWalkthroughBody =
    (Array.isArray(payload?.portions) && payload.portions.some((portion) => String(portion?.content || "").trim())) ||
    (Array.isArray(payload?.steps) && payload.steps.some((step) => String(step?.text || "").trim())) ||
    Boolean(formatCoachExportText(stepsToPlainText(payload)));

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const title = buildStudyFileTitle(payload, context);
    doc.font("Helvetica-Bold").fontSize(18).text(title);
    doc.moveDown(0.4);

    if (assignmentTitle) {
      doc.font("Helvetica").fontSize(11).fillColor("#475569").text(assignmentTitle);
      doc.fillColor("#000000");
      doc.moveDown(0.2);
    }

    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#64748b")
      .text(new Date().toLocaleDateString("en-AU", { dateStyle: "medium" }));
    doc.fillColor("#000000");
    doc.moveDown(0.5);

    const breadcrumb = studentFacingBreadcrumb({
      yearLevel: context.yearLevel,
      subject: context.subject,
      focus: context.focus,
      assignmentTitle,
    });
    if (breadcrumb) {
      doc.font("Helvetica").fontSize(9).fillColor("#64748b").text(breadcrumb);
      doc.fillColor("#000000");
      doc.moveDown(0.8);
    }

    if (payload?.intro) {
      doc
        .font("Helvetica-Oblique")
        .fontSize(11)
        .text(formatCoachExportText(payload.intro), { indent: 16, paragraphGap: 4, lineGap: 2 });
      doc.moveDown(0.8);
    }

    if (hasFormulas) {
      writeFormulas(doc, payload.formulas);
      doc.moveDown(0.2);
    }

    if (hasDiagram) {
      if (hasFormulas) {
        writeSectionRule(doc);
      }
      writeConceptVisual(doc, heroStep, diagramImage);
      doc.moveDown(0.4);
    }

    if (hasWalkthroughBody) {
      if (hasFormulas || hasDiagram) {
        writeSectionRule(doc);
      }
      writeStudyBody(doc, payload);
    }

    if (payload?.keyIdeas?.length) {
      writeSectionRule(doc);
      writeKeyIdeas(doc, payload.keyIdeas);
    }

    doc.moveDown(1);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#94a3b8")
      .text("Generated by Quizzora Study Coach — for personal study use.", { align: "center" });

    doc.end();
  });
}

export { buildCoachPdfSectionTitles };
