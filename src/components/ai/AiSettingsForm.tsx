import { useEffect, useRef, useState } from "react";
import { Check, PlugZap, ShieldCheck } from "lucide-react";
import type { AiDesktopAPI, AiPublicSettings, AiSettings } from "../../types/ai";

export function AiSettingsForm({
  api,
  settings,
  onSaved,
}: {
  api: AiDesktopAPI;
  settings: AiPublicSettings;
  onSaved: (value: AiPublicSettings) => void;
}) {
  const [draft, setDraft] = useState<AiSettings>(settings);
  const [apiKey, setApiKey] = useState("");
  const [sessionOnly, setSessionOnly] = useState(false);
  const [clearApiKey, setClearApiKey] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const requestRef = useRef(false);
  const testId = useRef<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (testId.current) void api.cancel(testId.current);
    };
  }, [api]);
  const patch = (value: Partial<AiSettings>) => setDraft((current) => ({ ...current, ...value }));
  async function save(test: boolean) {
    if (requestRef.current) return;
    requestRef.current = true;
    setBusy(true);
    setMessage("");
    const key = apiKey;
    setApiKey("");
    try {
      const result = await api.saveSettings({
        settings: draft,
        apiKey: key || undefined,
        sessionOnly,
        clearApiKey,
      });
      if (!mounted.current) return;
      if (!result.success) throw new Error(result.message);
      onSaved(result.value);
      setClearApiKey(false);
      if (test) {
        testId.current = crypto.randomUUID();
        const tested = await api.testConnection(testId.current);
        testId.current = null;
        if (!mounted.current) return;
        if (!tested.success) throw new Error(tested.message);
        setMessage(
          `连接成功 · ${tested.value.model} · ${tested.value.usageReported ? "服务返回 Token 用量" : "服务未返回 Token 用量，预算按保守估算计入"}`,
        );
      } else setMessage("设置已保存。");
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : "设置操作失败。");
    } finally {
      requestRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <section className="ai-settings" aria-label="模型连接设置">
      <div className="ai-section-title">
        <PlugZap size={18} />
        <div>
          <h3>连接你的模型</h3>
          <p>云端或本机服务，按当前任务使用。</p>
        </div>
      </div>
      <fieldset disabled={busy}>
        <label>
          接口协议
          <select
            value={draft.provider}
            onChange={(e) =>
              patch({
                provider: e.target.value as AiSettings["provider"],
                baseUrl: e.target.value === "ollama" ? "http://127.0.0.1:11434" : "",
              })
            }
          >
            <option value="compatible">OpenAI 兼容 API</option>
            <option value="ollama">本地 Ollama</option>
          </select>
        </label>
        <label>
          服务地址
          <input
            type="url"
            value={draft.baseUrl}
            onChange={(e) => patch({ baseUrl: e.target.value })}
            placeholder="https://your-provider.example/v1"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label>
          模型名称
          <input
            value={draft.model}
            onChange={(e) => patch({ model: e.target.value })}
            placeholder="填写服务提供的模型 ID"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings.hasApiKey ? "已保存；留空保持当前服务的凭证" : "本地服务可留空"}
            autoComplete="off"
          />
        </label>
        <p className="ai-caption">更换服务地址或协议会清除旧凭证，避免发往其他服务。</p>
        <label className="ai-check">
          <input
            type="checkbox"
            checked={sessionOnly}
            onChange={(e) => setSessionOnly(e.target.checked)}
          />
          新凭证仅在本次应用会话保存
        </label>
        {settings.hasApiKey && (
          <label className="ai-check">
            <input
              type="checkbox"
              checked={clearApiKey}
              onChange={(e) => setClearApiKey(e.target.checked)}
            />
            清除已保存的凭证
          </label>
        )}
        <div className="ai-form-row">
          <label>
            单次输出上限
            <input
              type="number"
              min="16"
              max="8192"
              value={draft.maxOutputTokens}
              onChange={(e) => patch({ maxOutputTokens: Number(e.target.value) })}
            />
          </label>
          <label>
            本机每日 Token 预算
            <input
              type="number"
              min="1024"
              max="10000000"
              value={draft.dailyTokenLimit}
              onChange={(e) => patch({ dailyTokenLimit: Number(e.target.value) })}
            />
          </label>
        </div>
        <label className="ai-check">
          <input
            type="checkbox"
            checked={draft.saveHistory}
            onChange={(e) => patch({ saveHistory: e.target.checked })}
          />
          在本机保留对话与来源（每库最近 20 条）
        </label>
        <p className="ai-caption">
          用量缺失或请求中断时保留本次预算预留；这里的预算记录不代表服务商账单。
        </p>
        <div className="ai-button-row">
          <button type="button" onClick={() => void save(false)}>
            <Check size={14} />
            保存设置
          </button>
          <button type="button" className="ai-primary" onClick={() => void save(true)}>
            保存并测试连接
          </button>
        </div>
      </fieldset>
      <p className="ai-caption">连接测试会发送简短测试请求，可能产生少量用量，不携带笔记。</p>
      <div className="ai-info">
        <ShieldCheck size={16} />
        <span>凭证由主进程保管，系统加密后保存；本地服务失败不会自动切换到云端。</span>
      </div>
      {message && (
        <p className="ai-feedback" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
