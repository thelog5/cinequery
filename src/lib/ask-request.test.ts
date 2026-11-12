import { describe, expect, it } from "vitest";
import { parseAskRequest } from "./ask-request";

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://cinequery.example/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("public question validation", () => {
  it("accepts a same-origin question and normalizes whitespace", async () => {
    expect(
      await parseAskRequest(
        request(
          { question: "  Who directed Heat?  ", stream: true },
          { origin: "https://cinequery.example" },
        ),
      ),
    ).toEqual({ question: "Who directed Heat?", stream: true });
  });

  it.each([
    null,
    [],
    1,
    "question",
    {},
    { question: "hi" },
    { question: "x".repeat(301) },
    { question: "Who directed Heat?", stream: "yes" },
  ])("rejects malformed question payload %j", async (body) => {
    expect(((await parseAskRequest(request(body))) as Response).status).toBe(
      400,
    );
  });

  it("rejects cross-origin browser requests", async () => {
    expect(
      (
        (await parseAskRequest(
          request(
            { question: "Who directed Heat?" },
            { origin: "https://other.example" },
          ),
        )) as Response
      ).status,
    ).toBe(403);
  });

  it("rejects non-JSON browser forms", async () => {
    expect(
      (
        (await parseAskRequest(
          request({}, { "Content-Type": "text/plain" }),
        )) as Response
      ).status,
    ).toBe(415);
  });

  it("bounds the actual bytes even without Content-Length", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(3_000));
        controller.enqueue(new Uint8Array(3_000));
        controller.close();
      },
    });
    const req = new Request("https://cinequery.example/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit & { duplex: "half" });
    expect(((await parseAskRequest(req)) as Response).status).toBe(413);
  });
});
