import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStudyCoachChatMessages,
  callOllamaStudyCoach,
  callStudyCoachLlm,
  estimateOllamaMessageTokens,
  fitOllamaChatMessages,
  isStudyCoachOllamaCloudEnabled,
  resolveOllamaEndpoint,
  resolveOllamaKeepAlive,
  resolveOllamaMaxHistory,
  resolveOllamaMaxInputTokens,
  resolveOllamaModel,
  resolveStudyCoachProvider,
  usesOpenAiResponseSession,
} from "../lib/study-coach-llm.js";
import { resolveRagMaxChars, resolveRagTopK } from "../lib/curriculum-doc-retrieve.js";
import { buildOllamaRequestHeaders, resolveOllamaCloudChatEndpoint } from "../lib/ollama-config.js";
import { buildStudyCoachOllamaSystemPrompt, buildStudyCoachSystemPrompt } from "../lib/study-coach.js";

const baseContext = {
  yearLevel: "Year 7",
  subject: "Science",
  focus: "Cells › Animal cells",
  curriculumSummary: "Understand cell structures.",
  learningIntentions: ["Identify organelles"],
  selectedTopicKeys: [],
  selectedSubtopics: [],
};

const coachJson = JSON.stringify({
  intro: "Here's how cells work in practice.",
  onTopic: true,
  followUps: ["Show me another example"],
  portions: [{ id: "p1", label: "Concept", content: "Cells are the building blocks.", narrationText: "Cells are building blocks." }],
  steps: [],
});

function withEnv(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function withEnvAsync(overrides, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("resolveStudyCoachProvider defaults to openai and accepts aliases", () => {
  withEnv({ STUDY_COACH_PROVIDER: undefined }, () => {
    assert.equal(resolveStudyCoachProvider(), "openai");
  });
  withEnv({ STUDY_COACH_PROVIDER: "ollama" }, () => {
    assert.equal(resolveStudyCoachProvider(), "ollama");
  });
  withEnv({ STUDY_COACH_PROVIDER: "local" }, () => {
    assert.equal(resolveStudyCoachProvider(), "local");
  });
  withEnv({ STUDY_COACH_PROVIDER: "hybrid" }, () => {
    assert.equal(resolveStudyCoachProvider(), "hybrid");
  });
  withEnv({ STUDY_COACH_PROVIDER: "OPENAI" }, () => {
    assert.equal(resolveStudyCoachProvider(), "openai");
  });
});

test("resolveOllamaKeepAlive prefers study coach override", () => {
  withEnv(
    { STUDY_COACH_OLLAMA_KEEP_ALIVE: "45m", OLLAMA_KEEP_ALIVE: "5m" },
    () => {
      assert.equal(resolveOllamaKeepAlive(), "45m");
    },
  );
  withEnv({ STUDY_COACH_OLLAMA_KEEP_ALIVE: undefined, OLLAMA_KEEP_ALIVE: "10m" }, () => {
    assert.equal(resolveOllamaKeepAlive(), "10m");
  });
  withEnv({ STUDY_COACH_OLLAMA_KEEP_ALIVE: undefined, OLLAMA_KEEP_ALIVE: undefined }, () => {
    assert.equal(resolveOllamaKeepAlive(), "30m");
  });
});

test("resolveOllamaMaxHistory defaults to 4 turns for small local models", () => {
  withEnv({ STUDY_COACH_OLLAMA_MAX_HISTORY: undefined }, () => {
    assert.equal(resolveOllamaMaxHistory(), 4);
  });
});

test("resolveOllamaMaxInputTokens reserves output and margin from num_ctx", () => {
  withEnv(
    {
      STUDY_COACH_OLLAMA_NUM_CTX: "4096",
      STUDY_COACH_OLLAMA_MAX_OUTPUT_TOKENS: "256",
      STUDY_COACH_OLLAMA_INPUT_MARGIN: "128",
      STUDY_COACH_OLLAMA_MAX_INPUT_TOKENS: undefined,
    },
    () => {
      assert.equal(resolveOllamaMaxInputTokens(), 2821);
    },
  );
});

test("ollama RAG defaults are tighter than OpenAI", () => {
  withEnv({ STUDY_COACH_RAG_TOP_K: undefined, STUDY_COACH_RAG_MAX_CHARS: undefined }, () => {
    assert.equal(resolveRagTopK({ forOllama: true }), 1);
    assert.equal(resolveRagMaxChars({ forOllama: true }), 1600);
    assert.equal(resolveRagTopK({ forOllama: false }), 4);
    assert.equal(resolveRagMaxChars({ forOllama: false }), 6000);
  });
});

test("fitOllamaChatMessages trims oldest history before dropping system or user", () => {
  const longAssistant = "Concept: ".repeat(500);
  const messages = buildStudyCoachChatMessages({
    context: baseContext,
    history: [
      { role: "student", content: "Old question about cells." },
      { role: "assistant", content: longAssistant },
      { role: "student", content: "Recent question about mitochondria." },
      { role: "assistant", content: "Mitochondria produce ATP." },
    ],
    message: "Tell me more.",
    ragContext: "Curriculum reference excerpts\n### Cells\nMitochondria produce ATP.",
    useOllamaPrompt: true,
  });

  const fitted = fitOllamaChatMessages(messages, { maxInputTokens: 900 });
  assert.equal(fitted[0].role, "system");
  assert.equal(fitted.at(-1).role, "user");
  assert.equal(fitted.at(-1).content, "Tell me more.");
  assert.ok(fitted.length < messages.length);
  const fittedTokens =
    estimateOllamaMessageTokens(fitted[0]) +
    estimateOllamaMessageTokens(fitted.at(-1)) +
    fitted.slice(1, -1).reduce((sum, entry) => sum + estimateOllamaMessageTokens(entry), 0);
  assert.ok(fittedTokens <= 900);
});

test("fitOllamaChatMessages truncates RAG when history alone is not enough", () => {
  const ragContext = `Curriculum reference excerpts\n### Cells\n${"Mitochondria produce ATP. ".repeat(200)}`;
  const messages = buildStudyCoachChatMessages({
    context: baseContext,
    history: [],
    message: "Explain cells.",
    ragContext,
    useOllamaPrompt: true,
  });

  const fitted = fitOllamaChatMessages(messages, { maxInputTokens: 500 });
  assert.match(fitted[0].content, /truncated for context limit/);
});

test("resolveOllamaEndpoint uses cloud when STUDY_COACH_USE_OLLAMA_CLOUD is set", () => {
  withEnv(
    {
      OLLAMA_API_KEY: "test-key",
      STUDY_COACH_USE_OLLAMA_CLOUD: "true",
      STUDY_COACH_OLLAMA_ENDPOINT: "http://127.0.0.1:11434/v1/chat/completions",
    },
    () => {
      assert.equal(isStudyCoachOllamaCloudEnabled(), true);
      assert.equal(resolveOllamaEndpoint(), "https://ollama.com/v1/chat/completions");
      assert.equal(resolveOllamaEndpoint({ useCloud: false }), "http://127.0.0.1:11434/v1/chat/completions");
      assert.equal(resolveOllamaModel({ useCloud: true }), "qwen3-next:80b");
    },
  );
});

test("buildOllamaRequestHeaders adds Bearer auth for cloud", () => {
  withEnv({ OLLAMA_API_KEY: "secret-key", STUDY_COACH_USE_OLLAMA_CLOUD: "true" }, () => {
    assert.deepEqual(buildOllamaRequestHeaders({ useCloud: true }), {
      "Content-Type": "application/json",
      Authorization: "Bearer secret-key",
    });
    assert.deepEqual(buildOllamaRequestHeaders({ useCloud: false }), {
      "Content-Type": "application/json",
    });
  });
});

test("callOllamaStudyCoach cloud request sends auth and omits keep_alive", async () => {
  let capturedHeaders = null;
  let capturedBody = null;

  const fetchImpl = async (_url, init) => {
    capturedHeaders = init.headers;
    capturedBody = JSON.parse(init.body);
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: coachJson } }] };
      },
    };
  };

  await withEnvAsync(
    {
      OLLAMA_API_KEY: "cloud-key",
      STUDY_COACH_USE_OLLAMA_CLOUD: "true",
      STUDY_COACH_OLLAMA_CLOUD_MODEL: "qwen3-next:80b",
      STUDY_COACH_RAG_ENABLED: "false",
    },
    async () => {
      await callOllamaStudyCoach(
        { context: baseContext, history: [], message: "Hello" },
        { fetchImpl, useCloud: true, ragContext: "" },
      );

      assert.equal(capturedHeaders.Authorization, "Bearer cloud-key");
      assert.equal(capturedBody.model, "qwen3-next:80b");
      assert.equal(capturedBody.keep_alive, undefined);
      assert.equal(capturedBody.options, undefined);
    },
  );
});

test("callOllamaStudyCoach falls back to local when cloud fails", async () => {
  let attempt = 0;

  const fetchImpl = async (url) => {
    attempt += 1;
    if (url === resolveOllamaCloudChatEndpoint()) {
      return { ok: false, status: 503, text: async () => "cloud down" };
    }
    return {
      ok: true,
      async json() {
        return { choices: [{ message: { content: coachJson } }] };
      },
    };
  };

  await withEnvAsync(
    {
      OLLAMA_API_KEY: "cloud-key",
      STUDY_COACH_USE_OLLAMA_CLOUD: "true",
      STUDY_COACH_OLLAMA_MODEL: "llama3.2:3b-gpu",
      STUDY_COACH_RAG_ENABLED: "false",
    },
    async () => {
      const result = await callOllamaStudyCoach(
        { context: baseContext, history: [], message: "Hello" },
        { fetchImpl, ragContext: "" },
      );
      assert.equal(attempt, 2);
      assert.equal(result.ollamaTarget, "local");
      assert.equal(result.rawReply, coachJson);
    },
  );
});

test("resolveOllamaEndpoint and model use defaults", () => {
  withEnv({ STUDY_COACH_OLLAMA_ENDPOINT: undefined, STUDY_COACH_OLLAMA_MODEL: undefined }, () => {
    assert.equal(resolveOllamaEndpoint(), "http://127.0.0.1:11434/v1/chat/completions");
    assert.equal(resolveOllamaModel(), "qwen2.5:14b");
  });
});

test("usesOpenAiResponseSession is false for ollama and local", () => {
  assert.equal(usesOpenAiResponseSession("openai"), true);
  assert.equal(usesOpenAiResponseSession("hybrid"), true);
  assert.equal(usesOpenAiResponseSession("ollama"), false);
  assert.equal(usesOpenAiResponseSession("local"), false);
});

test("buildStudyCoachChatMessages orders system, history, and user", () => {
  const messages = buildStudyCoachChatMessages({
    context: baseContext,
    history: [
      { role: "student", content: "What is a mitochondria?" },
      { role: "assistant", content: "It is the powerhouse of the cell." },
    ],
    message: "Tell me more.",
  });

  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /Quizzora Study Coach/);
  assert.equal(messages[1].role, "user");
  assert.equal(messages[1].content, "What is a mitochondria?");
  assert.equal(messages[2].role, "assistant");
  assert.equal(messages[3].role, "user");
  assert.equal(messages[3].content, "Tell me more.");
});

test("ollama compact prompt is much smaller than full OpenAI prompt", () => {
  const full = buildStudyCoachSystemPrompt(baseContext);
  const compact = buildStudyCoachOllamaSystemPrompt(baseContext, {
    ragContext: "Curriculum reference excerpts\n### Cells\nMitochondria produce ATP.",
  });
  assert.ok(compact.length < full.length * 0.35, `compact=${compact.length} full=${full.length}`);
  assert.match(compact, /PRIMARY source/i);
  assert.match(compact, /Mitochondria produce ATP/);
});

test("callOllamaStudyCoach posts chat completions with json format and keep_alive", async () => {
  let capturedUrl = "";
  let capturedBody = null;

  const fetchImpl = async (url, init) => ({
    ok: true,
    async json() {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      return {
        choices: [{ message: { content: coachJson } }],
      };
    },
  });

  await withEnvAsync(
    {
      STUDY_COACH_PROVIDER: "ollama",
      STUDY_COACH_OLLAMA_ENDPOINT: "http://127.0.0.1:11434/v1/chat/completions",
      STUDY_COACH_OLLAMA_MODEL: "llama3.1:8b",
      STUDY_COACH_OLLAMA_MAX_OUTPUT_TOKENS: "900",
      STUDY_COACH_OLLAMA_KEEP_ALIVE: "45m",
      STUDY_COACH_RAG_ENABLED: "false",
    },
    async () => {
      const history = Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? "student" : "assistant",
        content: `turn ${index}`,
      }));

      const result = await callOllamaStudyCoach(
        {
          context: baseContext,
          history,
          message: "Explain cells.",
        },
        {
          fetchImpl,
          ragContext:
            "Curriculum reference excerpts\n### Cells\nMitochondria produce ATP for the cell.",
        },
      );

      assert.equal(capturedUrl, "http://127.0.0.1:11434/v1/chat/completions");
      assert.equal(capturedBody.model, "llama3.1:8b");
      assert.equal(capturedBody.temperature, 0.65);
      assert.equal(capturedBody.max_tokens, 900);
      assert.equal(capturedBody.options.num_predict, 900);
      assert.equal(capturedBody.options.num_ctx, 4096);
      assert.equal(capturedBody.keep_alive, "45m");
      assert.deepEqual(capturedBody.response_format, { type: "json_object" });
      assert.equal(capturedBody.messages[0].role, "system");
      assert.match(capturedBody.messages[0].content, /PRIMARY source/i);
      assert.equal(capturedBody.messages.length, resolveOllamaMaxHistory() + 2);
      assert.equal(capturedBody.messages.at(-1).content, "Explain cells.");
      assert.equal(result.rawReply, coachJson);
      assert.equal(result.responseId, null);
    },
  );
});

test("callOllamaStudyCoach fits oversized prompts before posting", async () => {
  let capturedBody = null;

  const fetchImpl = async (_url, init) => ({
    ok: true,
    async json() {
      capturedBody = JSON.parse(init.body);
      return { choices: [{ message: { content: coachJson } }] };
    },
  });

  const longReply = "Concept: ".repeat(800);
  const history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 === 0 ? "student" : "assistant",
    content: index % 2 === 0 ? `Question ${index} about cells and organelles.` : longReply,
  }));

  await withEnvAsync(
    {
      STUDY_COACH_OLLAMA_MAX_HISTORY: "6",
      STUDY_COACH_RAG_ENABLED: "false",
    },
    async () => {
      await callOllamaStudyCoach(
        {
          context: baseContext,
          history,
          message: "Explain mitochondria in detail.",
        },
        {
          fetchImpl,
          ragContext: `Curriculum reference excerpts\n### Cells\n${"Mitochondria produce ATP. ".repeat(300)}`,
        },
      );

      const messages = capturedBody.messages;
      const totalTokens =
        messages.reduce((sum, entry) => sum + estimateOllamaMessageTokens(entry), 0);
      assert.ok(totalTokens <= resolveOllamaMaxInputTokens() + 32);
      assert.equal(messages.at(-1).content, "Explain mitochondria in detail.");
    },
  );
});

test("callStudyCoachLlm hybrid uses ollama when available", async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return { choices: [{ message: { content: coachJson } }] };
    },
  });

  await withEnvAsync({ STUDY_COACH_PROVIDER: "hybrid" }, async () => {
    const result = await callStudyCoachLlm(
      { context: baseContext, history: [], message: "Hello" },
      { fetchImpl },
    );
    assert.equal(result.source, "ollama");
    assert.equal(result.responseId, null);
  });
});

test("callStudyCoachLlm ollama provider throws when request fails", async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 503,
    text: async () => "unavailable",
  });

  await withEnvAsync({ STUDY_COACH_PROVIDER: "ollama" }, async () => {
    await assert.rejects(
      () =>
        callStudyCoachLlm({ context: baseContext, history: [], message: "Hello" }, { fetchImpl }),
      /Ollama request failed \(503\)/,
    );
  });
});

test("callStudyCoachLlm returns ollama source when provider is ollama", async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return { choices: [{ message: { content: coachJson } }] };
    },
  });

  await withEnvAsync({ STUDY_COACH_PROVIDER: "ollama" }, async () => {
    const result = await callStudyCoachLlm(
      { context: baseContext, history: [], message: "Hello" },
      { fetchImpl },
    );
    assert.equal(result.source, "ollama");
    assert.equal(result.responseId, null);
  });
});
