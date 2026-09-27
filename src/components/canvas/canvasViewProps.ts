import type { ThemeMode } from "../../core/types";

/** Props of {@link CanvasView}; in its own file so the view root stays wiring. */
export type CanvasViewProps = {
  title: string;
  source?: string;
  onSourceChange?: (newSource: string) => void;
  editable?: boolean;
  theme?: ThemeMode;
  onClose?: () => void;
  allChapters?: Array<{ id: string; title: string; src: string; absolutePath?: string }>;
  onOpenFile?: (filePath: string) => void;
  onExtractToNote?: (title: string, content: string) => void;
  onSave?: () => void;
  isDirty?: boolean;
  isSaving?: boolean;
  currentFilePath?: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
};
