const DEFAULT_CHARS_PER_TOKEN = 4;

/**
 * Split curriculum reference text into overlapping chunks (~500–800 tokens).
 * Uses paragraph boundaries where possible.
 */
export function chunkCurriculumText(
  text,
  {
    minTokens = 500,
    maxTokens = 800,
    overlapTokens = 100,
    charsPerToken = DEFAULT_CHARS_PER_TOKEN,
  } = {},
) {
  const source = String(text || "").trim();
  if (!source) {
    return [];
  }

  const minChars = minTokens * charsPerToken;
  const maxChars = maxTokens * charsPerToken;
  const overlapChars = overlapTokens * charsPerToken;

  const paragraphs = source
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [source];
  }

  const chunks = [];
  let current = "";

  function pushChunk(value) {
    const trimmed = String(value || "").trim();
    if (trimmed) {
      chunks.push(trimmed);
    }
  }

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      pushChunk(current);
      const tail = current.slice(Math.max(0, current.length - overlapChars));
      current = tail ? `${tail}\n\n${paragraph}` : paragraph;
      if (current.length > maxChars) {
        pushChunk(current.slice(0, maxChars));
        current = current.slice(Math.max(0, maxChars - overlapChars));
      }
      continue;
    }

    if (paragraph.length <= maxChars) {
      current = paragraph;
      continue;
    }

    let offset = 0;
    while (offset < paragraph.length) {
      const slice = paragraph.slice(offset, offset + maxChars);
      pushChunk(slice);
      offset += Math.max(1, maxChars - overlapChars);
    }
    current = "";
  }

  if (current) {
    pushChunk(current);
  }

  if (chunks.length === 1 && chunks[0].length < minChars && source.length >= minChars) {
    return chunks;
  }

  return chunks.length > 0 ? chunks : [source];
}
