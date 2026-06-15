/**
 * Helpers for streaming Study Coach Ollama replies to the client.
 */

const PREVIEW_KEYS = ["intro", "reply", "content", "narrationText", "label", "topicHeader", "text"];

export function extractStreamingCoachPreview(partialJson) {
  const raw = String(partialJson || "");
  if (!raw) {
    return "";
  }

  const parts = [];
  const seen = new Set();

  for (const key of PREVIEW_KEYS) {
    const re = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`, "g");
    let match = re.exec(raw);
    while (match) {
      const decoded = match[1]
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
        .trim();
      if (decoded && !seen.has(decoded)) {
        seen.add(decoded);
        parts.push(decoded);
      }
      match = re.exec(raw);
    }
  }

  return parts.join("\n\n").trim();
}

export async function* readOllamaChatCompletionStream(response) {
  if (!response?.body) {
    throw new Error("Ollama stream response has no body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") {
          if (payload === "[DONE]") {
            return;
          }
          continue;
        }

        let parsed;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        const delta = parsed?.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) {
          yield delta;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function encodeSseEvent(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Parse Onyx /chat/send-chat-message stream (SSE data: lines or NDJSON).
 * Yields { delta, responseId, error }.
 */
function parseOnyxStreamPayload(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (typeof parsed.error === "string" && parsed.error) {
    return { error: parsed.error };
  }

  if (parsed.chat_session_id) {
    return { responseId: String(parsed.chat_session_id) };
  }

  const obj = parsed?.obj || parsed;
  const type = String(obj?.type || "").trim();

  if (type === "error") {
    return { error: String(obj.message || obj.content || "Onyx stream error.") };
  }

  if (type === "message_delta" && typeof obj.content === "string" && obj.content) {
    return { delta: obj.content };
  }

  if (type === "message_start" && obj.chat_session_id) {
    return { responseId: String(obj.chat_session_id) };
  }

  return null;
}

export async function* readOnyxChatStream(response) {
  if (!response?.body) {
    throw new Error("Onyx stream response has no body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
        const packet = parseOnyxStreamPayload(payload);
        if (packet) {
          yield packet;
        }
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      const payload = trailing.startsWith("data:") ? trailing.slice(5).trim() : trailing;
      const packet = parseOnyxStreamPayload(payload);
      if (packet) {
        yield packet;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
