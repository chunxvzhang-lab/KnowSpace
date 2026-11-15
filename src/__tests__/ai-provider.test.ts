// @vitest-environment node
import { createRequire } from "node:module";
import { createServer } from "node:http";
import type { Server, RequestListener } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

const { complete, validateSettings } = createRequire(import.meta.url)(
  "../../electron/ai-provider.cjs",
);
const settings = {
  provider: "compatible",
  baseUrl: "https://example.test/v1",
  model: "test-model",
  maxOutputTokens: 128,
  dailyTokenLimit: 20000,
  saveHistory: false,
};
const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

async function service(handler: RequestListener) {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not listen");
  return `http://127.0.0.1:${address.port}`;
}

describe("AI streaming adapters", () => {
  it("uses the compatible route, parses fragmented UTF-8 and SSE usage, and never follows redirects", async () => {
    let received: Record<string, unknown> = {};
    const origin = await service((request, response) => {
      expect(request.url).toBe("/v1/chat/completions");
      expect(request.headers.authorization).toBe("Bearer fixture-secret");
      request.on("data", (chunk) => {
        received = JSON.parse(chunk.toString());
      });
      request.on("end", () => {
        response.writeHead(200, { "content-type": "text/event-stream" });
        const bytes = Buffer.from(
          'data: {"choices":[{"delta":{"content":"中文答案 [S1]"}}]}\r\n\r\ndata: {"choices":[],"usage":{"prompt_tokens":7,"completion_tokens":5}}\n\ndata: [DONE]\n\n',
        );
        for (let at = 0; at < bytes.length; at += 1) response.write(bytes.subarray(at, at + 1));
        response.end();
      });
    });
    const deltas: string[] = [];
    const result = await complete({
      settings: { ...settings, baseUrl: `${origin}/v1` },
      apiKey: "fixture-secret",
      messages: [{ role: "user", content: "问题" }],
      signal: new AbortController().signal,
      onText: (text: string) => deltas.push(text),
    });
    expect(result).toEqual({ text: "中文答案 [S1]", inputTokens: 7, outputTokens: 5 });
    expect(deltas.join("")).toBe(result.text);
    expect(received).toMatchObject({ stream: true, max_tokens: 128, model: "test-model" });
  });

  it("supports Ollama NDJSON, including a final frame without a newline", async () => {
    const origin = await service((request, response) => {
      expect(request.url).toBe("/api/chat");
      response.writeHead(200, { "content-type": "application/x-ndjson" });
      response.end(
        '{"message":{"content":"本地"},"done":false}\n{"message":{"content":"回答"},"done":true,"prompt_eval_count":3,"eval_count":2}',
      );
    });
    const result = await complete({
      settings: { ...settings, provider: "ollama", baseUrl: origin },
      messages: [{ role: "user", content: "问题" }],
      signal: new AbortController().signal,
      onText: () => {},
    });
    expect(result).toEqual({ text: "本地回答", inputTokens: 3, outputTokens: 2 });
  });

  it("rejects an Ollama token limit while preserving streamed draft text", async () => {
    const origin = await service((_request, response) => {
      response.writeHead(200, { "content-type": "application/x-ndjson" });
      response.end(
        '{"message":{"content":"# 方案\\n\\n尚未写完"},"done":false}\n{"done":true,"done_reason":"length"}',
      );
    });
    const deltas: string[] = [];
    await expect(
      complete({
        settings: { ...settings, provider: "ollama", baseUrl: origin },
        messages: [{ role: "user", content: "问题" }],
        signal: new AbortController().signal,
        onText: (text: string) => deltas.push(text),
      }),
    ).rejects.toThrow("长度上限");
    expect(deltas.join("")).toBe("# 方案\n\n尚未写完");
  });

  it.each([
    ['data: {"choices":[{"delta":{"content":"未完成"}}]}\n\n', "提前中断"],
    ["data: not-json\n\ndata: [DONE]\n\n", "无效的流式数据"],
    ['data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n', "长度上限"],
    ["data: [DONE]\n\n", "没有生成文字"],
  ])("reports incomplete or invalid streams: %s", async (body, reason) => {
    const origin = await service((_request, response) => {
      response.writeHead(200);
      response.end(body);
    });
    await expect(
      complete({
        settings: { ...settings, baseUrl: origin },
        messages: [{ role: "user", content: "问题" }],
        signal: new AbortController().signal,
        onText: () => {},
      }),
    ).rejects.toThrow(reason);
  });

  it.each([401, 403, 404, 429, 500, 302])(
    "reports HTTP %s without echoing a provider body or credential",
    async (status) => {
      const origin = await service((_request, response) => {
        response.writeHead(status, { location: "https://example.test/stolen" });
        response.end("fixture-secret: internal details");
      });
      try {
        await complete({
          settings: { ...settings, baseUrl: origin },
          messages: [{ role: "user", content: "问题" }],
          signal: new AbortController().signal,
          onText: () => {},
        });
        expect.fail("must reject");
      } catch (error) {
        const message = String(error);
        expect(message).not.toContain("fixture-secret");
        expect(message).not.toContain("internal details");
        expect(message).toMatch(status === 302 ? /无法连接/ : new RegExp(`HTTP ${status}`));
      }
    },
  );

  it("cancels an in-flight read and keeps no stream reader alive", async () => {
    const controller = new AbortController();
    const origin = await service((_request, response) => {
      response.writeHead(200);
      response.write('data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n');
    });
    await expect(
      complete({
        settings: { ...settings, baseUrl: origin },
        messages: [{ role: "user", content: "问题" }],
        signal: controller.signal,
        onText: () => controller.abort(),
      }),
    ).rejects.toThrow("已停止或超时");
  });
});

it.each([
  "http://example.test",
  "https://user:password@example.test",
  "https://example.test/?key=secret",
  "file:///tmp/model",
])("rejects an unsafe endpoint", (baseUrl) => {
  expect(() => validateSettings({ ...settings, baseUrl })).toThrow();
});

it("rejects oversized messages before making any network request", async () => {
  await expect(
    complete({
      settings,
      messages: [{ role: "user", content: "字".repeat(50000) }],
      signal: new AbortController().signal,
      onText: () => {},
    }),
  ).rejects.toThrow("上下文过大");
});
