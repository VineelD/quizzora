import assert from "node:assert/strict";
import { test } from "node:test";
import { extractStreamingCoachPreview, encodeSseEvent, readOnyxChatStream } from "../lib/study-coach-stream.js";
import {
  isStudyCoachStreamingAvailable,
  resolveOllamaMaxOutputTokens,
  resolveOllamaSkipDiagrams,
  shouldSkipDiagramsForCoachSource,
} from "../lib/study-coach-llm.js";

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

test("extractStreamingCoachPreview pulls readable text from partial JSON", () => {
  const partial =
    '{"intro":"Here is how friction works","portions":[{"id":"p1","label":"Concept","content":"Friction opposes motion';
  const preview = extractStreamingCoachPreview(partial);
  assert.match(preview, /Here is how friction works/);
  assert.match(preview, /Friction opposes motion/);
});

test("encodeSseEvent formats SSE payloads", () => {
  assert.equal(encodeSseEvent({ type: "token", preview: "Hi" }), 'data: {"type":"token","preview":"Hi"}\n\n');
});

test("resolveOllamaMaxOutputTokens defaults to 256", () => {
  withEnv({ STUDY_COACH_OLLAMA_MAX_OUTPUT_TOKENS: undefined, STUDY_COACH_MAX_OUTPUT_TOKENS: undefined }, () => {
    assert.equal(resolveOllamaMaxOutputTokens(), 256);
  });
});

test("ollama skip diagrams defaults true for ollama source", () => {
  withEnv({ STUDY_COACH_OLLAMA_SKIP_DIAGRAMS: undefined }, () => {
    assert.equal(resolveOllamaSkipDiagrams(), true);
    assert.equal(shouldSkipDiagramsForCoachSource("ollama"), true);
    assert.equal(shouldSkipDiagramsForCoachSource("openai"), false);
  });
});

test("isStudyCoachStreamingAvailable for ollama provider", () => {
  withEnv({ STUDY_COACH_PROVIDER: "ollama", STUDY_COACH_OLLAMA_STREAM: "true" }, () => {
    assert.equal(isStudyCoachStreamingAvailable(), true);
  });
  withEnv({ STUDY_COACH_PROVIDER: "ollama", STUDY_COACH_OLLAMA_STREAM: "false" }, () => {
    assert.equal(isStudyCoachStreamingAvailable(), false);
  });
});

test("readOnyxChatStream extracts message_delta content", async () => {
  const encoder = new TextEncoder();
  const payload = [
    'data: {"ind":0,"obj":{"type":"message_delta","content":"Hello"}}',
    'data: {"ind":1,"obj":{"type":"message_delta","content":" world"}}',
    "",
  ].join("\n");

  const response = {
    body: {
      getReader() {
        let sent = false;
        return {
          async read() {
            if (sent) {
              return { done: true, value: undefined };
            }
            sent = true;
            return { done: false, value: encoder.encode(payload) };
          },
          releaseLock() {},
        };
      },
    },
  };

  const deltas = [];
  for await (const packet of readOnyxChatStream(response)) {
    if (packet.delta) {
      deltas.push(packet.delta);
    }
  }
  assert.deepEqual(deltas, ["Hello", " world"]);
});

test("readOnyxChatStream handles NDJSON error lines", async () => {
  const payload = ['{"chat_session_id":"abc"}', '{"error":"backend down"}', ""].join("\n");

  const response = {
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    }),
  };

  const packets = [];
  for await (const packet of readOnyxChatStream(response)) {
    packets.push(packet);
  }
  assert.deepEqual(packets, [{ responseId: "abc" }, { error: "backend down" }]);
});
