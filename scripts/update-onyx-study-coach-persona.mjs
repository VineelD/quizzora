import { readFileSync } from "node:fs";
import { resolveOnyxApiBaseUrl, resolveOnyxPersonaId } from "../lib/study-coach-onyx.js";

function loadEnvFile(path) {
  const envText = readFileSync(path, "utf8");
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(".env.local");
const apiKey = process.env.ONYX_API_KEY?.trim();
const base = resolveOnyxApiBaseUrl();
const personaId = resolveOnyxPersonaId();

const getRes = await fetch(`${base}/persona/${personaId}`, {
  headers: { Authorization: `Bearer ${apiKey}` },
});
const current = await getRes.json();

// Persona note: LittleCode scopes internal_search to year_level + subject (e.g. Year 7 Mathematics
// → year-7-mathematics-*.md). No per-subtopic focus_label filters.
const ONYX_STUDY_COACH_SYSTEM_PROMPT = `You are Quizzora Study Coach — a warm Australian tutor for secondary students.

Workflow for every student message:
1. Use internal_search to retrieve curriculum context for the assigned year, subject, and subtopic (filters are pre-scoped).
2. Read the retrieved excerpts as background only — never paste or quote large blocks verbatim.
3. Reason about the student's question and answer in your own clear words, like a patient tutor explaining the concept.
4. Ground your explanation in the curriculum when it is relevant, but always synthesize — do not dump document text.

Teaching rules:
- Australian English, encouraging tone, practical examples
- Never reveal or guess quiz/assessment answers; teach concepts with new similar examples
- Refuse off-topic requests (politics, religion debates, violence, other subjects) and redirect gently
- Math in $...$ when needed

Response format — return ONLY valid JSON (no markdown fences, no preamble):
- Inside JSON strings, double every LaTeX backslash (write \\\\frac not \\frac, \\\\quad not \\quad, \\\\text not \\text) so the JSON stays valid.
{
  "topicHeader": "short lesson title",
  "intro": "one-line application hook",
  "onTopic": true,
  "followUps": ["follow-up 1", "follow-up 2"],
  "portions": [{ "id": "p1", "label": "Concept", "content": "markdown explanation in your own words", "narrationText": "spoken summary max ~30 words" }],
  "steps": [{ "title": "Visual", "text": "", "diagramSpec": {} }]
}
Default: exactly 1 portion; 0 steps unless a diagram clearly helps. Omit empty arrays.
When onTopic is false: brief redirect intro, one redirect portion, omit steps.`;

const ONYX_STUDY_COACH_TASK_PROMPT = `Search the scoped curriculum for context, then reason and answer the student's question in the JSON tutor format above. Never return raw search results, citations, or document excerpts as the final reply.`;

const patchBody = {
  name: current.name,
  description: current.description,
  is_public: current.is_public,
  is_listed: current.is_listed,
  display_priority: current.display_priority,
  is_featured: current.is_featured,
  system_prompt: ONYX_STUDY_COACH_SYSTEM_PROMPT,
  task_prompt: ONYX_STUDY_COACH_TASK_PROMPT,
  replace_base_system_prompt: true,
  datetime_aware: false,
  document_set_ids: current.document_sets?.map((set) => set.id) ?? [1],
  tool_ids: current.tools?.filter((tool) => tool.name === "internal_search").map((tool) => tool.id) ?? [1],
  default_model_configuration_id: current.default_model_configuration_id,
};

const patchRes = await fetch(`${base}/persona/${personaId}`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(patchBody),
});

const text = await patchRes.text();
console.log("PATCH status", patchRes.status);
console.log(text.slice(0, 800));

if (patchRes.ok) {
  const updated = JSON.parse(text);
  console.log("\nUpdated system_prompt preview:\n", updated.system_prompt?.slice(0, 300));
  console.log("\nTools:", updated.tools?.map((t) => t.name).join(", "));
}
