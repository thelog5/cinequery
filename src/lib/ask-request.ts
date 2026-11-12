const MAX_BODY_BYTES = 4_096;

/** Reject bad requests before opening a database connection or making an AI call. */
export async function parseAskRequest(
  req: Request,
): Promise<{ question: string; stream: boolean } | Response> {
  const reject = (status: number, error: string) =>
    Response.json({ error }, { status });
  const origin = req.headers.get("origin");
  if (
    req.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== new URL(req.url).origin)
  ) {
    return reject(403, "Submit questions from the Cinequery website.");
  }
  if (
    !/^application\/json(?:\s*;|$)/i.test(req.headers.get("content-type") ?? "")
  ) {
    return reject(415, "Send the question as application/json.");
  }
  if (Number(req.headers.get("content-length")) > MAX_BODY_BYTES) {
    return reject(413, "Request body is too large.");
  }
  const reader = req.body?.getReader();
  if (!reader) return reject(400, "Send a movie question.");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        return reject(413, "Request body is too large.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body))
      return reject(400, "Send a JSON object with a question.");
    const { question, stream } = body as Record<string, unknown>;
    if (
      typeof question !== "string" ||
      question.trim().length < 3 ||
      question.trim().length > 300
    ) {
      return reject(400, "Ask a question between 3 and 300 characters long.");
    }
    if (stream !== undefined && typeof stream !== "boolean")
      return reject(400, "stream must be a boolean.");
    return { question: question.trim(), stream: stream === true };
  } catch {
    return reject(400, "Send valid JSON with a question.");
  } finally {
    reader.releaseLock();
  }
}
