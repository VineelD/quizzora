import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendClarityRequirements,
  generateValidatedDiagramImage,
  parseValidationResponse,
  resolveImageSizeForDiagramType,
  validateDiagramImage,
} from "../lib/diagram-image-validate.js";

test("parseValidationResponse accepts YES and rejects NO with issues", () => {
  assert.deepEqual(parseValidationResponse("YES"), { valid: true, issues: "" });
  assert.deepEqual(parseValidationResponse("NO\nOverlapping tick labels\nText clipped at edge"), {
    valid: false,
    issues: "Overlapping tick labels\nText clipped at edge",
  });
});

test("resolveImageSizeForDiagramType uses wide layout for number lines", () => {
  const previous = process.env.OPENAI_IMAGE_SIZE;
  delete process.env.OPENAI_IMAGE_SIZE;

  assert.equal(resolveImageSizeForDiagramType("number_line"), "1536x1024");
  assert.equal(resolveImageSizeForDiagramType("cell_diagram"), "1024x1024");

  process.env.OPENAI_IMAGE_SIZE = "1024x1024";
  assert.equal(resolveImageSizeForDiagramType("number_line"), "1024x1024");

  if (previous === undefined) {
    delete process.env.OPENAI_IMAGE_SIZE;
  } else {
    process.env.OPENAI_IMAGE_SIZE = previous;
  }
});

test("appendClarityRequirements adds non-overlapping layout guidance", () => {
  const prompt = appendClarityRequirements("Number line from 0 to 10", "number_line");
  assert.match(prompt, /NO overlapping text/i);
  assert.match(prompt, /wide horizontal layout/i);
  assert.match(prompt, /1536x1024/);
});

test("generateValidatedDiagramImage retries once when validation fails", async () => {
  const previousValidate = process.env.OPENAI_DIAGRAM_VALIDATE;
  process.env.OPENAI_DIAGRAM_VALIDATE = "true";

  const generations = [];
  const validations = [];

  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/chat/completions")) {
      validations.push(JSON.parse(init.body).messages[0].content[0].text);
      const attempt = validations.length;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: attempt === 1 ? "NO\nLabels overlap near zero" : "YES",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const result = await generateValidatedDiagramImage({
    diagramPrompt: "Mark 3 on a number line",
    diagramType: "number_line",
    apiKey: "test-key",
    generateOnce: async (prompt, attempt) => {
      generations.push({ prompt, attempt });
      return { imageBase64: Buffer.from(`png-${attempt}`).toString("base64") };
    },
  });

  assert.equal(generations.length, 2);
  assert.match(generations[1].prompt, /Fix these issues/i);
  assert.match(generations[1].prompt, /Labels overlap near zero/);
  assert.equal(validations.length, 2);
  assert.ok(result?.imageBase64);

  globalThis.fetch = previousFetch;
  if (previousValidate === undefined) {
    delete process.env.OPENAI_DIAGRAM_VALIDATE;
  } else {
    process.env.OPENAI_DIAGRAM_VALIDATE = previousValidate;
  }
});

test("generateValidatedDiagramImage skips vision calls when validation disabled", async () => {
  const previousValidate = process.env.OPENAI_DIAGRAM_VALIDATE;
  process.env.OPENAI_DIAGRAM_VALIDATE = "false";

  let fetchCalls = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error("Vision validation should not run");
  };

  const result = await generateValidatedDiagramImage({
    diagramPrompt: "Simple bar chart",
    diagramType: "bar_chart",
    apiKey: "test-key",
    generateOnce: async () => ({ imageBase64: Buffer.from("once").toString("base64") }),
  });

  assert.equal(fetchCalls, 0);
  assert.ok(result?.imageBase64);

  globalThis.fetch = previousFetch;
  if (previousValidate === undefined) {
    delete process.env.OPENAI_DIAGRAM_VALIDATE;
  } else {
    process.env.OPENAI_DIAGRAM_VALIDATE = previousValidate;
  }
});

test("validateDiagramImage treats API failures as pass-through", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("upstream error", { status: 503 });

  const result = await validateDiagramImage({
    imageBase64: Buffer.from("png").toString("base64"),
    diagramPrompt: "Test diagram",
    apiKey: "test-key",
  });

  assert.equal(result.valid, true);

  globalThis.fetch = previousFetch;
});
