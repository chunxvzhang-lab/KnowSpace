import { useEffect, useState } from "react";
import type { AiPublicSettings } from "../../types/ai";
import { AiSettingsForm } from "../ai/AiSettingsForm";

export function AboutModelSettings() {
  const api = window.bookMDDesktop?.ai;
  const [settings, setSettings] = useState<AiPublicSettings | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    if (api)
      void api
        .getSettings()
        .then((result) => {
          if (!current) return;
          if (result.success) setSettings(result.value);
          else setError(result.message);
        })
        .catch(() => {
          if (current) setError("无法读取模型设置。");
        });
    return () => {
      current = false;
    };
  }, [api]);
  return (
    <div className="about-model-panel">
      {!api ? (
        <p>请在桌面版中配置模型接口。</p>
      ) : settings ? (
        <AiSettingsForm
          api={api}
          settings={settings}
          onSaved={(value) => {
            setSettings(value);
            window.dispatchEvent(new Event("knowspace-ai-settings-updated"));
          }}
        />
      ) : (
        <p role="status">{error || "正在读取模型设置…"}</p>
      )}
    </div>
  );
}
