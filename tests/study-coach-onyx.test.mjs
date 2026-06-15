import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCurriculumOnyxFilename,
  buildCurriculumOnyxYearSubjectPrefix,
  slugifyOnyxPathSegment,
} from "../lib/curriculum-onyx-filename.js";
import {
  buildOnyxChatRequestBody,
  buildOnyxCurriculumScope,
  buildOnyxInternalSearchFilters,
  buildOnyxSearchTags,
  buildOnyxYearSubjectScope,
  callOnyxStudyCoach,
  classifyOnyxReply,
  extractOnyxAssistantAnswer,
  resolveOnyxApiBaseUrl,
  resolveOnyxPersonaId,
  resolveOnyxSearchFilterMode,
} from "../lib/study-coach-onyx.js";
import {
  callStudyCoachLlm,
  isStudyCoachStreamingAvailable,
  resolveStudyCoachProvider,
  shouldSkipDiagramsForCoachSource,
  usesOnyxChatSession,
} from "../lib/study-coach-llm.js";
import { processStudyCoachLlmReply } from "../lib/study-coach.js";

const baseContext = {
  yearLevel: "Year 7",
  subject: "Science",
  focus: "Classification and ecosystems — Classification of living things",
  curriculumSummary: "Understand cell structures.",
  learningIntentions: ["Identify organelles"],
};

const mathContext = {
  yearLevel: "Year 7",
  subject: "Mathematics",
  focus:
    "Integers and rational numbers — Ordering and comparing integers; Integers and rational numbers — Adding and subtracting integers (+1 more)",
  curriculumSummary: "Compare and order integers on a number line.",
  learningIntentions: ["Compare integers", "Order rational numbers"],
  selectedSubtopics: [
    "Integers and rational numbers — Ordering and comparing integers",
    "Integers and rational numbers — Adding and subtracting integers",
    "Integers and rational numbers — Multiplying and dividing integers",
  ],
};

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

test("slugifyOnyxPathSegment matches prepare script output", () => {
  assert.equal(slugifyOnyxPathSegment("Year 10"), "year-10");
  assert.equal(slugifyOnyxPathSegment("Sine and cosine rules"), "sine-and-cosine-rules");
});

test("buildCurriculumOnyxFilename maps year subject subtopic to connector filename", () => {
  assert.equal(
    buildCurriculumOnyxFilename({
      yearLevel: "Year 10",
      subject: "Mathematics",
      subtopic: "Sine and cosine rules",
    }),
    "year-10-mathematics-sine-and-cosine-rules.md",
  );
  assert.equal(
    buildCurriculumOnyxFilename({
      yearLevel: "Year 7",
      subject: "Science",
      subtopic: "Classification of living things",
    }),
    "year-7-science-classification-of-living-things.md",
  );
});

test("buildCurriculumOnyxYearSubjectPrefix maps year and subject to filename prefix", () => {
  assert.equal(
    buildCurriculumOnyxYearSubjectPrefix({ yearLevel: "Year 7", subject: "Mathematics" }),
    "year-7-mathematics-",
  );
  assert.equal(
    buildCurriculumOnyxYearSubjectPrefix({ yearLevel: "Year 10", subject: "Science" }),
    "year-10-science-",
  );
});

test("buildOnyxYearSubjectScope derives filename prefix from context", () => {
  const scope = buildOnyxYearSubjectScope(baseContext);
  assert.equal(scope.yearLevel, "Year 7");
  assert.equal(scope.subject, "Science");
  assert.equal(scope.filenamePrefix, "year-7-science-");
});

test("buildOnyxCurriculumScope is alias for buildOnyxYearSubjectScope", () => {
  assert.deepEqual(buildOnyxCurriculumScope(baseContext), buildOnyxYearSubjectScope(baseContext));
});

test("buildOnyxSearchTags scopes year_level and subject only", () => {
  const tags = buildOnyxSearchTags(baseContext);
  assert.deepEqual(tags, [
    { tag_key: "year_level", tag_value: "Year 7" },
    { tag_key: "subject", tag_value: "Science" },
  ]);
});

test("buildOnyxSearchTags ignores studentTopic and selectedSubtopics", () => {
  const tags = buildOnyxSearchTags(mathContext, {
    studentTopic: { displayLabel: "Adding and subtracting integers", subtopic: "Adding and subtracting integers" },
  });
  assert.deepEqual(tags, [
    { tag_key: "year_level", tag_value: "Year 7" },
    { tag_key: "subject", tag_value: "Mathematics" },
  ]);
});

test("buildOnyxSearchTags returns empty when year or subject missing", () => {
  assert.deepEqual(buildOnyxSearchTags({ yearLevel: "Year 7" }), []);
  assert.deepEqual(buildOnyxSearchTags({ subject: "Science" }), []);
});

test("buildOnyxInternalSearchFilters returns null when disabled", () => {
  withEnv({ ONYX_SEARCH_FILTER_ENABLED: "false" }, () => {
    assert.equal(buildOnyxInternalSearchFilters(baseContext), null);
  });
});

test("buildOnyxChatRequestBody scopes search to year and subject", () => {
  withEnv(
    {
      ONYX_PERSONA_ID: "1",
      ONYX_PROJECT_ID: "42",
      ONYX_STREAM: "false",
      STUDY_COACH_ONYX_SKIP_SEARCH: "false",
    },
    () => {
      const body = buildOnyxChatRequestBody({
        context: baseContext,
        message: "Explain mitochondria",
      });
      assert.equal(body.stream, false);
      assert.equal(body.chat_session_info.persona_id, resolveOnyxPersonaId());
      assert.equal(body.chat_session_info.project_id, 42);
      assert.match(body.additional_context, /year-7-science-\*\.md/);
      assert.match(body.additional_context, /scoped to Year 7 Science curriculum/);
      assert.doesNotMatch(body.additional_context, /Primary curriculum file:/);
      assert.doesNotMatch(body.additional_context, /focus_label/);
      assert.equal(body.forced_tool_id, 1);
      assert.deepEqual(body.allowed_tool_ids, [1]);
      assert.deepEqual(body.internal_search_filters.tags, [
        { tag_key: "year_level", tag_value: "Year 7" },
        { tag_key: "subject", tag_value: "Science" },
      ]);
    },
  );
});

test("buildOnyxChatRequestBody uses mathematics filename prefix for Year 7 Mathematics", () => {
  withEnv({ STUDY_COACH_ONYX_SKIP_SEARCH: "false" }, () => {
    const body = buildOnyxChatRequestBody({
      context: mathContext,
      message: "How do I compare negative integers?",
      studentTopic: { displayLabel: "Adding and subtracting integers" },
    });
    assert.match(body.additional_context, /year-7-mathematics-\*\.md/);
    assert.deepEqual(body.internal_search_filters.tags, [
      { tag_key: "year_level", tag_value: "Year 7" },
      { tag_key: "subject", tag_value: "Mathematics" },
    ]);
  });
});

test("buildOnyxChatRequestBody skips internal_search when local curriculum is injected", () => {
  withEnv({ STUDY_COACH_ONYX_SKIP_SEARCH: "true" }, () => {
    const body = buildOnyxChatRequestBody({
      context: baseContext,
      message: "Explain classification",
      localCurriculumText: "# Classification\nScientists group organisms by shared traits.",
    });
    assert.deepEqual(body.allowed_tool_ids, []);
    assert.equal(body.forced_tool_id, undefined);
    assert.equal(body.internal_search_filters, undefined);
    assert.match(body.additional_context, /pre-loaded for Year 7 Science/);
    assert.match(body.additional_context, /Scientists group organisms/);
  });
});

test("buildOnyxChatRequestBody auto-skips search when year+subject scoped and local curriculum exists", () => {
  withEnv({ STUDY_COACH_ONYX_SKIP_SEARCH: "auto" }, () => {
    const body = buildOnyxChatRequestBody({
      context: baseContext,
      message: "Explain classification",
      localCurriculumText: "Local curriculum body text.",
    });
    assert.deepEqual(body.allowed_tool_ids, []);
    assert.equal(body.forced_tool_id, undefined);
  });
});

test("buildOnyxChatRequestBody auto-skips search for multi-subtopic Year 7 Mathematics", () => {
  withEnv({ STUDY_COACH_ONYX_SKIP_SEARCH: "auto" }, () => {
    const body = buildOnyxChatRequestBody({
      context: mathContext,
      message: "How do I compare negative integers?",
      localCurriculumText: "### Ordering integers\n\nUse a number line.",
    });
    assert.deepEqual(body.allowed_tool_ids, []);
    assert.match(body.additional_context, /year-7-mathematics-\*\.md/);
    assert.match(body.additional_context, /pre-loaded for Year 7 Mathematics/);
    assert.match(body.additional_context, /Do not call internal_search/);
  });
});

test("buildOnyxChatRequestBody continues existing Onyx chat sessions", () => {
  const body = buildOnyxChatRequestBody({
    context: baseContext,
    message: "Tell me more",
    chatSessionId: "3c90c3cc-0d44-4b50-8888-8dd25736052a",
  });
  assert.equal(body.chat_session_id, "3c90c3cc-0d44-4b50-8888-8dd25736052a");
  assert.equal(body.chat_session_info, undefined);
});

test("resolveStudyCoachProvider selects onyx when configured", () => {
  withEnv({ STUDY_COACH_PROVIDER: "onyx", DISABLE_OPENAI: undefined }, () => {
    assert.equal(resolveStudyCoachProvider(), "onyx");
  });
});

test("resolveOnyxApiBaseUrl appends /api when path is missing", () => {
  withEnv({ ONYX_API_BASE_URL: "http://localhost:3001" }, () => {
    assert.equal(resolveOnyxApiBaseUrl(), "http://localhost:3001/api");
  });
  withEnv({ ONYX_API_BASE_URL: "http://localhost:3001/" }, () => {
    assert.equal(resolveOnyxApiBaseUrl(), "http://localhost:3001/api");
  });
  withEnv({ ONYX_API_BASE_URL: "http://localhost:3001/api" }, () => {
    assert.equal(resolveOnyxApiBaseUrl(), "http://localhost:3001/api");
  });
});

test("callOnyxStudyCoach surfaces HTML misconfiguration instead of JSON parse errors", async () => {
  const fetchImpl = async (url) => {
    assert.match(String(url), /\/api\/chat\/send-chat-message$/);
    return {
      ok: true,
      headers: {
        get(name) {
          return name.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null;
        },
      },
      async text() {
        return "<!DOCTYPE html><html><body>Onyx UI</body></html>";
      },
    };
  };

  await withEnv(
    {
      ONYX_API_KEY: "test-key",
      ONYX_API_BASE_URL: "http://localhost:3001",
      ONYX_STREAM: "true",
    },
    async () => {
      await assert.rejects(
        () => callOnyxStudyCoach({ context: baseContext, message: "Hi" }, { fetchImpl }),
        /ONYX_API_BASE_URL ends with \/api/,
      );
    },
  );
});

test("extractOnyxAssistantAnswer strips Onyx internal_search query stubs", () => {
  const stub = '{"name": "F1", "parameters": {"q": "Newton\'s second law of motion VCE Physics U1-2"}}';
  assert.equal(extractOnyxAssistantAnswer({ answer: stub }), "");
  assert.equal(classifyOnyxReply(stub), "empty");
});

test("extractOnyxAssistantAnswer strips memory tool stubs with slug names", () => {
  const stub =
    '{"name": "ordering-and-comparing-integers", "parameters": {"memory": "User needs help understanding how to compare integers, especially negative numbers."}}';
  assert.equal(extractOnyxAssistantAnswer({ answer: stub }), "");
  assert.equal(classifyOnyxReply(stub), "empty");
});

test("processStudyCoachLlmReply ignores non-coach JSON tool stubs", () => {
  const result = processStudyCoachLlmReply({
    rawReply: '{"name":"F1","parameters":{"q":"Newton\'s second law"}}',
    context: baseContext,
    message: "Explain Newton's second law",
    source: "onyx",
  });
  assert.match(result.content, /trouble formatting/i);
  assert.doesNotMatch(result.content, /"parameters"/);
  assert.doesNotMatch(result.payload.steps.map((step) => step.text).join("\n"), /"name":/);
});

test("processStudyCoachLlmReply rejects memory slug tool stubs for integers", () => {
  const result = processStudyCoachLlmReply({
    rawReply:
      '{"name":"ordering-and-comparing-integers","parameters":{"memory":"User needs help understanding how to compare integers, especially negative numbers."}}',
    context: mathContext,
    message: "How do I compare -3 and -7?",
    source: "onyx",
  });
  assert.match(result.content, /trouble formatting/i);
  assert.doesNotMatch(result.content, /ordering-and-comparing-integers/);
});

test("classifyOnyxReply distinguishes search dumps from tutor answers", () => {
  const searchData = {
    tool_calls: [
      {
        search_docs: [
          {
            content:
              "**Electromagnetic Spectrum: A Year 10 Science Learning Guide**\n\n### Introduction\nHave you ever wondered how your mobile phone connects you to the internet?",
          },
        ],
      },
    ],
  };
  const dump =
    "**Electromagnetic Spectrum: A Year 10 Science Learning Guide**\n\n### Introduction\nHave you ever wondered how your mobile phone connects you to the internet?";
  assert.equal(classifyOnyxReply(dump, searchData), "search_dump");
  assert.equal(extractOnyxAssistantAnswer({ answer: dump, tool_calls: searchData.tool_calls }), "");

  const json = '{"intro":"Here is how wavelength works.","portions":[{"id":"p1","content":"..."}]}';
  assert.equal(classifyOnyxReply(json), "json_tutor");
  assert.equal(
    classifyOnyxReply("The electromagnetic spectrum spans radio waves through gamma rays. Wavelength decreases as frequency increases."),
    "reasoned_prose",
  );

  const polluted = `{
  "name": "explain-electromagnetic-spectrum",
  "parameters": { "queries": ["Why does wavelength matter?"] }
}

The electromagnetic spectrum spans radio waves through gamma rays.`;
  assert.equal(classifyOnyxReply(polluted), "reasoned_prose");
  assert.match(extractOnyxAssistantAnswer({ answer: polluted }), /spans radio waves/);

  const formulaStub = `{
  "name": "Newton's Second Law",
  "parameters": { "F": "$F$ (net force)", "m": "$m$ (mass)", "a": "$a$ (acceleration)" }
}`;
  assert.equal(classifyOnyxReply(formulaStub), "reasoned_prose");
  assert.match(extractOnyxAssistantAnswer({ answer: formulaStub }), /Newton's Second Law/);
});

test("callOnyxStudyCoach parses non-streaming Onyx responses", async () => {
  const fetchImpl = async (url, init) => {
    assert.match(String(url), /\/chat\/send-chat-message$/);
    const body = JSON.parse(init.body);
    assert.equal(body.message, "What is a cell?");
    assert.deepEqual(body.internal_search_filters.tags, [
      { tag_key: "year_level", tag_value: "Year 7" },
      { tag_key: "subject", tag_value: "Science" },
    ]);
    return {
      ok: true,
      async json() {
        return {
          answer_citationless: "A cell is the basic unit of life.",
          chat_session_id: "session-abc",
          message_id: 7,
        };
      },
    };
  };

  await withEnv(
    {
      ONYX_API_KEY: "test-key",
      ONYX_API_BASE_URL: "http://localhost:3001/api",
      ONYX_STREAM: "false",
      STUDY_COACH_ONYX_SKIP_SEARCH: "false",
    },
    async () => {
      const result = await callOnyxStudyCoach(
        { context: baseContext, message: "What is a cell?" },
        { fetchImpl },
      );
      assert.equal(result.rawReply, "A cell is the basic unit of life.");
      assert.equal(result.responseId, "session-abc");
      assert.equal(result.onyx.responseKind, "reasoned_prose");
    },
  );
});

test("callOnyxStudyCoach parses streaming Onyx SSE responses", async () => {
  const streamBody = [
    '{"chat_session_id":"session-stream"}',
    'data: {"ind":0,"obj":{"type":"message_delta","content":"{\\"intro\\":"}}',
    'data: {"ind":1,"obj":{"type":"message_delta","content":"\\"Hello\\"}"}}',
    "",
  ].join("\n");

  const fetchImpl = async () => ({
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(streamBody));
        controller.close();
      },
    }),
  });

  await withEnv(
    {
      ONYX_API_KEY: "test-key",
      ONYX_API_BASE_URL: "http://localhost:3001/api",
      ONYX_STREAM: "true",
    },
    async () => {
      const tokens = [];
      const result = await callOnyxStudyCoach(
        { context: baseContext, message: "Hi" },
        {
          fetchImpl,
          onToken: (delta) => tokens.push(delta),
        },
      );
      assert.equal(result.rawReply, '{"intro":"Hello"}');
      assert.deepEqual(tokens, ['{"intro":', '"Hello"}']);
    },
  );
});

test("callOnyxStudyCoach surfaces NDJSON stream errors", async () => {
  const streamBody = ['{"chat_session_id":"session-err"}', '{"error":"Ollama connection refused"}', ""].join("\n");

  const fetchImpl = async () => ({
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(streamBody));
        controller.close();
      },
    }),
  });

  await withEnv(
    { ONYX_API_KEY: "test-key", ONYX_STREAM: "true" },
    async () => {
      await assert.rejects(
        () => callOnyxStudyCoach({ context: baseContext, message: "Hi" }, { fetchImpl }),
        /Ollama connection refused/,
      );
    },
  );
});

test("callStudyCoachLlm routes to Onyx when provider is onyx", async () => {
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return {
        answer:
          '{"intro":"Cells are tiny factories.","onTopic":true,"steps":[],"followUps":["Show another example"]}',
        chat_session_id: "session-xyz",
      };
    },
  });

  await withEnv(
    { STUDY_COACH_PROVIDER: "onyx", ONYX_API_KEY: "test-key", ONYX_STREAM: "false" },
    async () => {
      const result = await callStudyCoachLlm(
        { context: baseContext, history: [], message: "Explain cells" },
        { fetchImpl },
      );
      assert.equal(result.source, "onyx");
      assert.match(result.rawReply, /Cells are tiny factories/);
      assert.equal(result.responseId, "session-xyz");
    },
  );
});

test("isStudyCoachStreamingAvailable includes onyx when ONYX_STREAM=true", () => {
  withEnv({ STUDY_COACH_PROVIDER: "onyx", ONYX_STREAM: "true" }, () => {
    assert.equal(isStudyCoachStreamingAvailable(), true);
  });
  withEnv({ STUDY_COACH_PROVIDER: "onyx", ONYX_STREAM: "false" }, () => {
    assert.equal(isStudyCoachStreamingAvailable(), false);
  });
});

test("resolveOnyxSearchFilterMode defaults to year_subject", () => {
  withEnv({ ONYX_SEARCH_FILTER_MODE: undefined }, () => {
    assert.equal(resolveOnyxSearchFilterMode(), "year_subject");
  });
});

test("usesOnyxChatSession and diagram skip flags include onyx", () => {
  withEnv({ STUDY_COACH_PROVIDER: "onyx" }, () => {
    assert.equal(usesOnyxChatSession(), true);
  });
  assert.equal(shouldSkipDiagramsForCoachSource("onyx"), true);
});
