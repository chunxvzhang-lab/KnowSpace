export type AiMode =
  "question" | "rewrite" | "outline" | "summary" | "create" | "edit" | "mindmap" | "canvas";

export type AiSettings = {
  provider: "compatible" | "ollama";
  baseUrl: string;
  model: string;
  maxOutputTokens: number;
  dailyTokenLimit: number;
  saveHistory: boolean;
};

export type AiPublicSettings = AiSettings & {
  hasApiKey: boolean;
  keyStorage: "encrypted" | "session" | "none";
};

export type AiSource = {
  id: string;
  chapterId: string;
  title: string;
  startLine: number;
  endLine: number;
  text: string;
};

export type AiMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiRequest = {
  requestId: string;
  workspaceId: string;
  mode: AiMode;
  prompt: string;
  sources: AiSource[];
  messages: AiMessage[];
};

export type AiUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  budgetTokens: number;
};

export type AiRecord = {
  id: string;
  prompt: string;
  mode: AiMode;
  text: string;
  sources: AiSource[];
  model: string;
  createdAt: string;
  elapsedMs: number;
  usage: AiUsage;
};

export type AiResult<T> = { success: true; value: T } | { success: false; message: string };

export type AiDesktopAPI = {
  getSettings: () => Promise<AiResult<AiPublicSettings>>;
  saveSettings: (request: {
    settings: AiSettings;
    apiKey?: string;
    clearApiKey?: boolean;
    sessionOnly?: boolean;
  }) => Promise<AiResult<AiPublicSettings>>;
  testConnection: (
    requestId: string,
  ) => Promise<AiResult<{ model: string; usageReported: boolean }>>;
  generate: (request: AiRequest) => Promise<AiResult<AiRecord>>;
  cancel: (requestId: string) => Promise<boolean>;
  onEvent: (callback: (event: { requestId: string; text: string }) => void) => () => void;
  getHistory: (workspaceId: string) => Promise<AiResult<AiRecord[]>>;
  clearHistory: (workspaceId: string) => Promise<AiResult<null>>;
};
