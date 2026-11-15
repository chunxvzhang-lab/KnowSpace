const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { validateSettings } = require("./ai-provider.cjs");

const DEFAULT_SETTINGS = {
  provider: "compatible",
  baseUrl: "",
  model: "",
  maxOutputTokens: 2048,
  dailyTokenLimit: 200_000,
  saveHistory: false,
};

function createAiStore(directory, safeStorage) {
  let sessionKey = "";
  let tail = Promise.resolve();
  const serial = (action) => {
    const next = tail.then(action);
    tail = next.catch(() => {});
    return next;
  };
  async function read(name, fallback) {
    try {
      return JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return fallback;
      throw new Error("无法读取 AI 本地配置或记录，请检查文件是否损坏或无权限。");
    }
  }
  async function write(name, value) {
    await fs.mkdir(directory, { recursive: true });
    const target = path.join(directory, name);
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600 });
      await fs.rename(temporary, target);
    } catch {
      await fs.unlink(temporary).catch(() => {});
      throw new Error("AI 配置或记录保存失败，请检查磁盘空间与权限。");
    }
  }
  const publicSettings = (config) => ({
    ...Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map((key) => [key, config.settings[key]])),
    hasApiKey: Boolean(sessionKey || config.encryptedKey),
    keyStorage: sessionKey ? "session" : config.encryptedKey ? "encrypted" : "none",
  });
  const readConfig = () => read("settings.json", { settings: DEFAULT_SETTINGS, encryptedKey: "" });
  const readState = async () => {
    const state = await read("records.json", { date: "", spent: 0, records: {} });
    if (
      !state ||
      typeof state.date !== "string" ||
      !Number.isSafeInteger(state.spent) ||
      state.spent < 0 ||
      !state.records ||
      typeof state.records !== "object" ||
      Array.isArray(state.records) ||
      Object.values(state.records).some((records) => !Array.isArray(records))
    ) {
      throw new Error("AI 本地预算或记录格式无效，请检查记录文件。");
    }
    return state;
  };
  const vaultKey = (workspaceId) => crypto.createHash("sha256").update(workspaceId).digest("hex");
  return {
    getSettings: () => serial(async () => publicSettings(await readConfig())),
    saveSettings: (request) =>
      serial(async () => {
        if (!request || typeof request !== "object") throw new Error("AI 配置格式无效。");
        const settings = validateSettings(request.settings);
        const current = await readConfig();
        let encryptedKey = current.encryptedKey || "";
        let nextSessionKey = sessionKey;
        const changedService =
          current.settings.provider !== settings.provider ||
          current.settings.baseUrl !== settings.baseUrl;
        if (changedService || request.clearApiKey) {
          encryptedKey = "";
          nextSessionKey = "";
        }
        if (request.apiKey !== undefined && request.apiKey !== "") {
          if (
            typeof request.apiKey !== "string" ||
            request.apiKey.length > 2048 ||
            /[\r\n]/.test(request.apiKey)
          ) {
            throw new Error("API Key 格式无效。");
          }
          if (request.sessionOnly) {
            nextSessionKey = request.apiKey;
            encryptedKey = "";
          } else {
            if (!safeStorage.isEncryptionAvailable())
              throw new Error("系统安全存储不可用；可选择仅本次会话保存凭证。");
            encryptedKey = safeStorage.encryptString(request.apiKey).toString("base64");
            nextSessionKey = "";
          }
        }
        await write("settings.json", { settings, encryptedKey });
        sessionKey = nextSessionKey;
        return publicSettings({ settings, encryptedKey });
      }),
    getConnection: () =>
      serial(async () => {
        const config = await readConfig();
        const settings = validateSettings(config.settings);
        let apiKey = sessionKey;
        if (!apiKey && config.encryptedKey) {
          try {
            apiKey = safeStorage.decryptString(Buffer.from(config.encryptedKey, "base64"));
          } catch {
            throw new Error("系统无法解密 API Key，请重新设置凭证。");
          }
        }
        return { settings, apiKey };
      }),
    reserve: (tokens, limit) =>
      serial(async () => {
        const state = await readState();
        const date = new Date().toLocaleDateString("en-CA");
        if (state.date !== date) {
          state.date = date;
          state.spent = 0;
        }
        if (state.spent + tokens > limit)
          throw new Error("本机今日 AI 预算不足，请降低上下文或调整日预算。");
        state.spent += tokens;
        await write("records.json", state);
        return date;
      }),
    finish: (date, reserved, actual, workspaceId, record) =>
      serial(async () => {
        const state = await readState();
        if (state.date === date && actual !== null)
          state.spent = Math.max(0, state.spent - reserved + actual);
        if (record) {
          const key = vaultKey(workspaceId);
          state.records[key] = [record, ...(state.records[key] || [])].slice(0, 20);
          // Bound total retained records across libraries as well as within one library.
          const keys = Object.keys(state.records);
          while (keys.length > 20) delete state.records[keys.shift()];
        }
        await write("records.json", state);
      }),
    getHistory: (workspaceId) =>
      serial(async () => (await readState()).records[vaultKey(workspaceId)] || []),
    clearHistory: (workspaceId) =>
      serial(async () => {
        const state = await readState();
        delete state.records[vaultKey(workspaceId)];
        await write("records.json", state);
        return null;
      }),
  };
}

module.exports = { createAiStore, DEFAULT_SETTINGS };
