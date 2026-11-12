/**
 * POST /api/ask — run the agent on one question.
 *
 * Body: { "question": string, "stream"?: boolean }
 *   stream=false (default): JSON AgentRunResult
 *   stream=true: NDJSON, one AgentEvent per line, ending with {"type":"result"} (R10)
 */
import { runAgent } from "@/agent/run";
import type { AgentEvent, AgentRunResult } from "@/agent/types";
import { getVersion } from "@/agent/versions";
import { admitRequest, clientIp, hashIp, recordOutcome } from "@/lib/abuse";
import { parseAskRequest } from "@/lib/ask-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Agent loops with several tool calls can take 30-60 s; raise the default.
export const maxDuration = 120;

function jsonError(
  status: number,
  error: string,
  headers: Record<string, string> = {},
) {
  return Response.json({ error }, { status, headers });
}

async function finalize(requestId: number | null, result: AgentRunResult) {
  await recordOutcome(requestId, {
    status: result.status,
    costUsd: result.costUsd,
    inputTokens:
      result.usage.input_tokens +
      result.usage.cache_creation_input_tokens +
      result.usage.cache_read_input_tokens,
    outputTokens: result.usage.output_tokens,
    latencyMs: result.latencyMs,
  });
}

async function recordFailure(requestId: number | null) {
  await recordOutcome(requestId, {
    status: "error",
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
  });
}

export async function POST(req: Request) {
  const body = await parseAskRequest(req);
  if (body instanceof Response) return body;
  const { question } = body;

  let version;
  try {
    version = getVersion(process.env.CINEQUERY_AGENT_VERSION);
  } catch {
    return jsonError(503, "Cinequery is temporarily unavailable.");
  }

  let admit;
  try {
    admit = await admitRequest(hashIp(clientIp(req.headers)), question);
  } catch (err) {
    console.error("rate limiter unavailable", err);
    // Fail closed: without the limiter we can't protect the API budget.
    return jsonError(
      503,
      "Cinequery is temporarily unavailable. Please try again shortly.",
    );
  }
  if (!admit.ok) {
    return jsonError(
      admit.status,
      admit.reason,
      admit.retryAfterSec ? { "Retry-After": String(admit.retryAfterSec) } : {},
    );
  }

  if (body.stream !== true) {
    try {
      const result = await runAgent({ question, version });
      await finalize(admit.requestId, result);
      return Response.json(result, {
        status: result.status === "ok" ? 200 : 502,
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      await recordFailure(admit.requestId);
      return jsonError(
        502,
        "The question could not be completed. Please try again.",
      );
    }
  }

  const encoder = new TextEncoder();
  // If the browser goes away mid-answer, keep running so the cost is still
  // recorded against the spend cap; just stop writing to the stream.
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (payload: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        const result = await runAgent({
          question,
          version,
          onEvent: (event: AgentEvent) => write(event),
        });
        await finalize(admit.requestId, result);
      } catch (err) {
        console.error("agent crashed", err);
        await recordFailure(admit.requestId);
        write({
          type: "error",
          error: "Something went wrong. Try asking again.",
        });
      } finally {
        if (open) {
          open = false;
          controller.close();
        }
      }
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
