import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type {
  CanvasData,
  CanvasFileNode,
  CanvasNode,
  CanvasTextNode,
  CanvasViewport,
} from "../../types/canvasTypes";
import type { LightboxMedia } from "../../core/types";
import { getMediaFileType, isMediaFile, resolveMediaSrc } from "../../services/canvasService";

/**
 * The multimodal + clipboard-IO domain of the canvas: paste-clipboard-as-card,
 * the hidden media file inputs and their per-modality insert triggers, the
 * file drag-and-drop onto the canvas, the window paste listener, and the
 * media-lightbox opener.
 *
 * Extracted from CanvasView (wave 5 of the CanvasView decomposition); the node
 * CRUD lives in `useCanvasNodeOps` and the edge mutations in
 * `useCanvasEdgeOps`.
 */
type UseCanvasMediaClipboardParams = {
  editable: boolean;
  /** Camera state; toolbar/keyboard inserts fall back to the viewport centre. */
  viewport: CanvasViewport;
  /** The scrollable canvas container; drop and paste map client points through it. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** The camera transform the drop handler reads. */
  viewportRef: RefObject<CanvasViewport>;
  latestDataRef: RefObject<CanvasData>;
  pushHistory: (newData: CanvasData) => void;
  setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
  setSelectedNodeId: (id: string | null) => void;
  setContextMenu: (menu: null) => void;
  /** Opening a media preview writes the lightbox; CanvasView renders it. */
  setLightboxMedia: Dispatch<SetStateAction<LightboxMedia | null>>;
  showToast: (msg: string) => void;
  /** Media saved through the desktop bridge is filed next to the open document. */
  currentFilePath?: string;
  /** The paste listener stands down while a card editor or edge label is open. */
  editingNodeId: string | null;
  editingEdgeId: string | null;
};

export function useCanvasMediaClipboard({
  editable,
  viewport,
  containerRef,
  viewportRef,
  latestDataRef,
  pushHistory,
  setSelectedNodeIds,
  setSelectedNodeId,
  setContextMenu,
  setLightboxMedia,
  showToast,
  currentFilePath,
  editingNodeId,
  editingEdgeId,
}: UseCanvasMediaClipboardParams) {
  // Multimodal media file input ref
  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  // Dedicated inputs so the context menu can offer image / video / audio with
  // a pre-filtered file dialog for each.
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const videoFileInputRef = useRef<HTMLInputElement>(null);
  const audioFileInputRef = useRef<HTMLInputElement>(null);
  /**
   * Drop point for the next media insertion. Set when the user triggers an
   * insert from the context menu (so the card lands where they right-clicked);
   * falls back to the viewport centre for toolbar/keyboard paths.
   */
  const mediaInsertPosRef = useRef<{ x: number; y: number } | null>(null);

  const handlePasteClipboardAsCard = useCallback(
    async (canvasX: number, canvasY: number) => {
      if (!editable) return;
      let text = "";
      let imageBlob: Blob | null = null;
      try {
        if (navigator?.clipboard?.read) {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            const imgType = item.types.find((t) => t.startsWith("image/"));
            if (imgType) {
              imageBlob = await item.getType(imgType);
              break;
            }
          }
        }
      } catch {
        // clipboard permission fallback
      }

      if (imageBlob) {
        try {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(imageBlob!);
          });

          let finalFilePath = base64;
          const desktop =
            typeof window !== "undefined"
              ? window.knowSpaceDesktop || window.bookMDDesktop
              : undefined;
          if (desktop?.savePastedImage) {
            const res = await desktop.savePastedImage({
              currentFilePath,
              bufferBase64: base64,
              originalName: "pasted_image",
              ext: imageBlob.type.replace("image/", "") || "png",
            });
            if (res?.success && res.relativePath) {
              finalFilePath = res.relativePath;
            }
          }

          const newCard: CanvasFileNode = {
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: "file",
            file: finalFilePath,
            x: Math.round(canvasX - 180),
            y: Math.round(canvasY - 130),
            width: 360,
            height: 260,
          };

          const currentData = latestDataRef.current;
          pushHistory({
            ...currentData,
            nodes: [...currentData.nodes, newCard],
          });
          setSelectedNodeIds(new Set([newCard.id]));
          setSelectedNodeId(newCard.id);
          showToast("已从剪贴板粘贴为图片卡片");
          setContextMenu(null);
          return;
        } catch {
          // fallback to text
        }
      }

      try {
        if (navigator?.clipboard?.readText) {
          text = await navigator.clipboard.readText();
        }
      } catch {
        // clipboard permission fallback
      }
      if (!text || !text.trim()) {
        text = "从剪贴板粘贴的卡片";
      }

      const newCard: CanvasTextNode = {
        id: `text-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: "text",
        text: text.trim(),
        x: Math.round(canvasX),
        y: Math.round(canvasY),
        width: 280,
        height: 180,
      };

      const currentData = latestDataRef.current;
      pushHistory({
        ...currentData,
        nodes: [...currentData.nodes, newCard],
      });
      setSelectedNodeIds(new Set([newCard.id]));
      setSelectedNodeId(newCard.id);
      showToast("已从剪贴板粘贴为新卡片");
      setContextMenu(null);
    },
    [
      editable,
      currentFilePath,
      latestDataRef,
      pushHistory,
      setSelectedNodeIds,
      setSelectedNodeId,
      showToast,
      setContextMenu,
    ],
  );

  const handleTriggerInsertMedia = useCallback(() => {
    if (!editable) return;
    mediaFileInputRef.current?.click();
  }, [editable]);

  /**
   * Context-menu insert helpers. Each pre-filters its file dialog to one
   * modality and remembers the click point so the card lands exactly where
   * the user right-clicked.
   */
  const handleTriggerInsertImage = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!editable) return;
      mediaInsertPosRef.current = { x: canvasX, y: canvasY };
      imageFileInputRef.current?.click();
    },
    [editable],
  );

  const handleTriggerInsertVideo = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!editable) return;
      mediaInsertPosRef.current = { x: canvasX, y: canvasY };
      videoFileInputRef.current?.click();
    },
    [editable],
  );

  const handleTriggerInsertAudio = useCallback(
    (canvasX: number, canvasY: number) => {
      if (!editable) return;
      mediaInsertPosRef.current = { x: canvasX, y: canvasY };
      audioFileInputRef.current?.click();
    },
    [editable],
  );

  const handleMediaFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0 || !editable) return;

      const desktop =
        typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
      const newNodes: CanvasNode[] = [];

      // Right-click inserts land exactly where the user clicked; toolbar /
      // keyboard paths fall back to the viewport centre.
      const insertPos = mediaInsertPosRef.current;
      const centerX = insertPos
        ? insertPos.x
        : -viewport.panX / viewport.zoom +
          (containerRef.current?.clientWidth || 800) / (2 * viewport.zoom);
      const centerY = insertPos
        ? insertPos.y
        : -viewport.panY / viewport.zoom +
          (containerRef.current?.clientHeight || 600) / (2 * viewport.zoom);
      mediaInsertPosRef.current = null;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const offsetX = i * 28;
        const offsetY = i * 28;

        try {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          let finalFilePath = base64;
          if (desktop?.savePastedImage) {
            const res = await desktop.savePastedImage({
              currentFilePath,
              bufferBase64: base64,
              originalName: file.name,
              ext: file.name.split(".").pop() || "png",
            });
            if (res?.success && res.relativePath) {
              finalFilePath = res.relativePath;
            }
          }

          newNodes.push({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
            type: "file",
            file: finalFilePath,
            x: Math.round(centerX + offsetX - 180),
            y: Math.round(centerY + offsetY - 130),
            width: 360,
            height: 260,
          });
        } catch {
          // fallback
        }
      }

      if (newNodes.length > 0) {
        const currentData = latestDataRef.current;
        pushHistory({
          ...currentData,
          nodes: [...currentData.nodes, ...newNodes],
        });
        setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
        setSelectedNodeId(newNodes[0].id);
        showToast(`已插入 ${newNodes.length} 张媒体卡片`);
      }

      e.target.value = "";
    },
    [
      editable,
      viewport,
      currentFilePath,
      containerRef,
      latestDataRef,
      pushHistory,
      setSelectedNodeIds,
      setSelectedNodeId,
      showToast,
    ],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleCanvasDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!editable || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      const canvasX = Math.round((localX - viewportRef.current.panX) / viewportRef.current.zoom);
      const canvasY = Math.round((localY - viewportRef.current.panY) / viewportRef.current.zoom);

      const files = Array.from(e.dataTransfer.files || []);
      if (files.length === 0) return;

      const desktop =
        typeof window !== "undefined" ? window.knowSpaceDesktop || window.bookMDDesktop : undefined;
      const newNodes: CanvasNode[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const offsetX = i * 28;
        const offsetY = i * 28;

        if (isMediaFile(file.name) || file.type.startsWith("image/")) {
          try {
            const reader = new FileReader();
            const base64 = await new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });

            let finalFilePath = base64;
            if (desktop?.savePastedImage) {
              const res = await desktop.savePastedImage({
                currentFilePath,
                bufferBase64: base64,
                originalName: file.name,
                ext: file.name.split(".").pop() || "png",
              });
              if (res?.success && res.relativePath) {
                finalFilePath = res.relativePath;
              }
            }

            newNodes.push({
              id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
              type: "file",
              file: finalFilePath,
              x: Math.round(canvasX + offsetX - 180),
              y: Math.round(canvasY + offsetY - 130),
              width: 360,
              height: 260,
            });
          } catch {
            // fallback
          }
        } else if (file.name.endsWith(".md") || file.name.endsWith(".canvas")) {
          newNodes.push({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
            type: "file",
            file: file.name,
            x: Math.round(canvasX + offsetX - 140),
            y: Math.round(canvasY + offsetY - 90),
            width: 280,
            height: 180,
          });
        }
      }

      if (newNodes.length > 0) {
        const currentData = latestDataRef.current;
        pushHistory({
          ...currentData,
          nodes: [...currentData.nodes, ...newNodes],
        });
        setSelectedNodeIds(new Set(newNodes.map((n) => n.id)));
        setSelectedNodeId(newNodes[0].id);
        showToast(`已将 ${newNodes.length} 个文件添加为画布卡片`);
      }
    },
    [
      editable,
      containerRef,
      viewportRef,
      currentFilePath,
      latestDataRef,
      pushHistory,
      setSelectedNodeIds,
      setSelectedNodeId,
      showToast,
    ],
  );

  // Global Clipboard Paste listener for media cards (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handlePasteEvent = () => {
      if (editingNodeId || editingEdgeId || !editable) return;
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.getAttribute("contenteditable") === "true")
      ) {
        return;
      }
      const centerX =
        -viewport.panX / viewport.zoom +
        (containerRef.current?.clientWidth || 800) / (2 * viewport.zoom);
      const centerY =
        -viewport.panY / viewport.zoom +
        (containerRef.current?.clientHeight || 600) / (2 * viewport.zoom);
      handlePasteClipboardAsCard(centerX, centerY);
    };

    window.addEventListener("paste", handlePasteEvent);
    return () => window.removeEventListener("paste", handlePasteEvent);
  }, [
    editingNodeId,
    editingEdgeId,
    editable,
    viewport.panX,
    viewport.panY,
    viewport.zoom,
    containerRef,
    handlePasteClipboardAsCard,
  ]);

  /**
   * Opens the lightbox preview for an image / video / audio media card
   * (double-click). The preview window closes via its own ✕ button or Esc.
   */
  const openMediaPreview = useCallback(
    (node: CanvasFileNode) => {
      const mType = getMediaFileType(node.file);
      if (mType !== "image" && mType !== "video" && mType !== "audio") return;
      const src = resolveMediaSrc(node.file, currentFilePath);
      const title = node.file.split(/[\\/]/).pop() || "媒体预览";
      setLightboxMedia({
        type: mType === "video" ? "video" : mType === "audio" ? "audio" : "image",
        src,
        title,
        alt: title,
      });
    },
    [currentFilePath, setLightboxMedia],
  );

  return {
    mediaFileInputRef,
    imageFileInputRef,
    videoFileInputRef,
    audioFileInputRef,
    handlePasteClipboardAsCard,
    handleTriggerInsertMedia,
    handleTriggerInsertImage,
    handleTriggerInsertVideo,
    handleTriggerInsertAudio,
    handleMediaFileInputChange,
    handleDragOver,
    handleCanvasDrop,
    openMediaPreview,
  };
}
