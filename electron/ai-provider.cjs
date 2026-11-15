const MAX_REQUEST_BYTES = 120_000;
const MAX_RESPONSE_CHARS = 120_000;

function validateSettings(value) {
  if (!value || !["compatible", "ollama"].includes(value.provider)) {
    throw new Error("请选择支持的模型协议。");
  }
  let url;
  try {
    url = new URL(value.baseUrl);
  } catch {
    throw new Error("请输入有效的模型服务地址。");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("服务地址须使用 HTTPS；本机服务可使用 HTTP，地址中不能包含凭证、查询或片段。");
  }
  if (
    typeof value.model !== "string" ||
    !value.model.trim() ||
    value.model.length > 160 ||
    /[\r\n]/.test(value.model)
  ) {
    throw new Error("请输入有效的模型名称。");
  }
  if (
    !Number.isInteger(value.maxOutputTokens) ||
    value.maxOutputTokens < 16 ||
    value.maxOutputTokens > 8192 ||
    !Number.isInteger(value.dailyTokenLimit) ||
    value.dailyTokenLimit < 1024 ||
    value.dailyTokenLimit > 10_000_000
  ) {
    throw new Error("输出上限须为 16–8192，日预算须为 1024–10000000 的整数。");
  }
  return {
    provider: value.provider,
    baseUrl: url.href.replace(/\/+$/, ""),
    model: value.model.trim(),
    maxOutputTokens: value.maxOutputTokens,
    dailyTokenLimit: value.dailyTokenLimit,
    saveHistory: value.saveHistory === true,
  };
}

function validateMessages(messages) {
  if (
    !Array.isArray(messages) ||
    messages.length < 1 ||
    messages.length > 24 ||
    messages.some(
      (m) =>
        !m || !["system", "user", "assistant"].includes(m.role) || typeof m.content !== "string",
    )
  ) {
    throw new Error("模型消息格式无效。");
  }
  if (Buffer.byteLength(JSON.stringify(messages), "utf8") > MAX_REQUEST_BYTES) {
    throw new Error("本次上下文过大，请缩小资料范围或新建对话。");
  }
}

async function complete({ settings, apiKey, messages, signal, onText, fetchImpl = fetch }) {
  validateSettings(settings);
  validateMessages(messages);
  const ollama = settings.provider === "ollama";
  const body = ollama
    ? {
        model: settings.model,
        messages,
        stream: true,
        options: { num_predict: settings.maxOutputTokens },
      }
    : { model: settings.model, messages, stream: true, max_tokens: settings.maxOutputTokens };
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  let response;
  try {
    response = await fetchImpl(`${settings.baseUrl}${ollama ? "/api/chat" : "/chat/completions"}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
      redirect: "error",
    });
  } catch {
    if (signal.aborted) throw new Error("请求已停止或超时。");
    throw new Error("无法连接模型服务，请检查服务地址、网络与证书。");
  }
  if (!response.ok) {
    await response.body?.cancel();
    const reasons = {
      401: "凭证无效",
      403: "没有访问权限",
      404: "模型或接口不存在",
      429: "服务限流或额度不足",
    };
    throw new Error(
      `模型服务返回 HTTP ${response.status}：${reasons[response.status] || "请求失败，请核对协议与模型设置"}。`,
    );
  }
  if (!response.body) throw new Error("模型服务没有返回流式响应。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    text = "",
    ended = false;
  let inputTokens = null,
    outputTokens = null;
  const count = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
  const consume = (payload) => {
    if (!payload.trim()) return;
    if (payload.trim() === "[DONE]") {
      ended = true;
      return;
    }
    let data;
    try {
      data = JSON.parse(payload);
    } catch {
      throw new Error("模型服务返回了无效的流式数据。");
    }
    if (!data || typeof data !== "object" || data.error)
      throw new Error("模型服务在生成途中返回错误。");
    const delta = ollama ? data.message?.content : data.choices?.[0]?.delta?.content;
    if (delta != null && typeof delta !== "string")
      throw new Error("当前接口没有返回文字内容，请检查模型能力。");
    if (delta) {
      text += delta;
      if (text.length > MAX_RESPONSE_CHARS) throw new Error("模型输出超过本次长度上限。");
      onText(delta);
    }
    if (ollama && data.done === true) {
      if (data.done_reason === "length")
        throw new Error("输出达到长度上限，内容尚未完整生成；请缩小任务或提高输出上限。");
      ended = true;
      inputTokens = count(data.prompt_eval_count);
      outputTokens = count(data.eval_count);
    }
    if (!ollama) {
      if (data.usage) {
        inputTokens = count(data.usage.prompt_tokens);
        outputTokens = count(data.usage.completion_tokens);
      }
      if (data.choices?.[0]?.finish_reason === "length")
        throw new Error("输出达到长度上限，内容尚未完整生成；请缩小任务或提高输出上限。");
    }
  };
  try {
    while (true) {
      if (signal.aborted) throw new Error("请求已停止或超时。");
      const chunk = await reader.read();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      if (buffer.length > MAX_RESPONSE_CHARS * 2) throw new Error("模型流式数据超过大小限制。");
      const separator = ollama ? /\r?\n/ : /\r?\n\r?\n/;
      let match;
      while ((match = separator.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        if (ollama) consume(frame);
        else
          consume(
            frame
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n"),
          );
      }
      if (chunk.done || ended) break;
    }
    if (!ended && buffer.trim()) {
      if (ollama) consume(buffer);
      else
        consume(
          buffer
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n"),
        );
    }
    if (!ended) throw new Error("模型响应提前中断，当前内容仅为未完成草稿。");
    if (!text.trim()) throw new Error("模型没有生成文字内容。");
    return { text, inputTokens, outputTokens };
  } catch (error) {
    if (signal.aborted) throw new Error("请求已停止或超时。");
    if (error instanceof TypeError) throw new Error("模型响应读取失败，请检查网络。");
    throw error;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

module.exports = { validateSettings, validateMessages, complete };
