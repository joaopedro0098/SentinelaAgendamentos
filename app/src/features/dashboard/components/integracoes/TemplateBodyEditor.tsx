import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import {
  type BodySegment,
  type TemplateLanguage,
  type TemplateVariableKey,
  VARIABLE_MARKERS,
  VARIABLE_UI_LABELS,
  parseBodyDisplayText,
  validateBodyDisplayText,
} from "@/features/dashboard/lib/metaTemplateProduct";
import {
  caretDisplayOffsetFromPoint,
  insertMarkerAtOffset,
  mapFullTextOffsetToWithoutMarker,
  mapWithoutMarkerOffsetToFull,
  rangeFromDisplayOffset,
  readDisplayTextFromEditor,
  removeVariableMarker,
  snapOffsetToWordBoundary,
} from "@/features/dashboard/components/integracoes/templateEditorDragUtils";

type TemplateBodyEditorProps = {
  value: string;
  onChange: (next: string) => void;
  language: TemplateLanguage;
  enabledVariableKeys: TemplateVariableKey[];
  disabled?: boolean;
};

export type TemplateBodyEditorHandle = {
  readDisplayText: () => string | null;
};

const DRAG_MIME = "application/x-template-variable-key";

function createVariableChip(key: TemplateVariableKey, language: TemplateLanguage): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.contentEditable = "false";
  chip.dataset.variable = key;
  chip.draggable = true;
  chip.title = "Arraste para reposicionar";
  chip.className =
    "inline-flex items-center gap-0.5 align-baseline mx-0.5 rounded-md bg-primary/10 text-primary px-2 py-0.5 text-sm font-medium select-none border border-primary/20 cursor-grab active:cursor-grabbing hover:bg-primary/15";

  const grip = document.createElement("span");
  grip.className = "text-[10px] opacity-60 leading-none";
  grip.setAttribute("aria-hidden", "true");
  grip.textContent = "⋮⋮";

  const label = document.createElement("span");
  label.textContent = VARIABLE_UI_LABELS[language][key];

  chip.append(grip, label);
  return chip;
}

function populateEditor(root: HTMLElement, segments: BodySegment[], language: TemplateLanguage) {
  root.innerHTML = "";
  for (const segment of segments) {
    if (segment.type === "text") {
      if (segment.value) root.appendChild(document.createTextNode(segment.value));
    } else {
      root.appendChild(createVariableChip(segment.key, language));
    }
  }
}

export const TemplateBodyEditor = forwardRef<TemplateBodyEditorHandle, TemplateBodyEditorProps>(function TemplateBodyEditor(
  {
  value,
  onChange,
  language,
  enabledVariableKeys,
  disabled,
  },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const lastEmittedValue = useRef(value);
  const lastValidValue = useRef(value);
  const dragStateRef = useRef<{
    key: TemplateVariableKey;
    textWithout: string;
    snapOffset: number;
  } | null>(null);
  const dropCommittedRef = useRef(false);
  const draggedChipRef = useRef<HTMLElement | null>(null);
  const isComposingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  useImperativeHandle(ref, () => ({
    readDisplayText: () => {
      const el = editorRef.current;
      if (!el) return null;
      return readDisplayTextFromEditor(el);
    },
  }));

  const rebuildFromValue = useCallback(
    (text: string) => {
      const el = editorRef.current;
      if (!el) return;
      populateEditor(el, parseBodyDisplayText(text), language);
    },
    [language],
  );

  const hideDropIndicator = useCallback(() => {
    const indicator = indicatorRef.current;
    if (indicator) indicator.style.display = "none";
  }, []);

  const showDropIndicatorAtOffset = useCallback(
    (offset: number) => {
      const editor = editorRef.current;
      const shell = shellRef.current;
      const indicator = indicatorRef.current;
      if (!editor || !shell || !indicator) return;

      const range = rangeFromDisplayOffset(editor, offset);
      if (!range) return;

      const rect = range.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      indicator.style.display = "block";
      indicator.style.left = `${rect.left - shellRect.left}px`;
      indicator.style.top = `${rect.top - shellRect.top}px`;
      indicator.style.height = `${Math.max(rect.height, 18)}px`;
    },
    [],
  );

  useLayoutEffect(() => {
    if (value !== lastEmittedValue.current && !dragStateRef.current) {
      lastEmittedValue.current = value;
      lastValidValue.current = value;
      rebuildFromValue(value);
    }
  }, [value, rebuildFromValue]);

  useEffect(() => {
    if (!dragStateRef.current) {
      rebuildFromValue(lastValidValue.current);
    }
  }, [language, rebuildFromValue]);

  function emitBody(text: string) {
    lastValidValue.current = text;
    lastEmittedValue.current = text;
    onChange(text);
  }

  function commitDisplayText(text: string, revertIfInvalid = false) {
    const validationError = validateBodyDisplayText(text, language, enabledVariableKeys);
    if (validationError && revertIfInvalid) {
      rebuildFromValue(lastValidValue.current);
      return;
    }
    emitBody(text);
  }

  function syncFromEditor() {
    const el = editorRef.current;
    if (!el || dragStateRef.current) return;
    emitBody(readDisplayTextFromEditor(el));
  }

  function handleInput() {
    if (disabled || isComposingRef.current || dragStateRef.current) return;
    syncFromEditor();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;

    if (e.key === "Enter") {
      e.preventDefault();
      return;
    }

    if (e.key !== "Backspace" && e.key !== "Delete") return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const editor = editorRef.current;
    if (!editor) return;

    const chips = editor.querySelectorAll("[data-variable]");
    for (const chip of chips) {
      if (range.intersectsNode(chip)) {
        e.preventDefault();
        return;
      }
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    syncFromEditor();
  }

  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const chip = target.closest("[data-variable]") as HTMLElement | null;
    if (!chip || !editorRef.current?.contains(chip)) return;

    const key = chip.dataset.variable as TemplateVariableKey | undefined;
    if (!key || !VARIABLE_MARKERS[key]) return;

    const fullText = readDisplayTextFromEditor(editorRef.current);
    const textWithout = removeVariableMarker(fullText, key);

    dropCommittedRef.current = false;
    dragStateRef.current = { key, textWithout, snapOffset: 0 };
    draggedChipRef.current = chip;
    chip.classList.add("opacity-50", "ring-2", "ring-[#00a884]/50");
    setIsDragging(true);

    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(DRAG_MIME, key);

    const ghost = chip.cloneNode(true) as HTMLElement;
    ghost.style.position = "absolute";
    ghost.style.top = "-9999px";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
    requestAnimationFrame(() => ghost.remove());
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    if (disabled || !drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const editor = editorRef.current!;
    const fullText = readDisplayTextFromEditor(editor);
    const textWithout = removeVariableMarker(fullText, drag.key);
    drag.textWithout = textWithout;

    const rawFull = caretDisplayOffsetFromPoint(editor, e.clientX, e.clientY);
    const rawInWithout = mapFullTextOffsetToWithoutMarker(fullText, rawFull, drag.key);
    const snap = snapOffsetToWordBoundary(textWithout, rawInWithout);
    drag.snapOffset = snap;

    const indicatorOffset = mapWithoutMarkerOffsetToFull(fullText, snap, drag.key);
    showDropIndicatorAtOffset(indicatorOffset);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    if (!shellRef.current?.contains(e.relatedTarget as Node)) {
      hideDropIndicator();
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();

    const drag = dragStateRef.current;
    hideDropIndicator();

    if (!drag) return;

    const editor = editorRef.current;
    if (!editor) return;

    const fullText = readDisplayTextFromEditor(editor);
    const textWithout = removeVariableMarker(fullText, drag.key);
    const marker = VARIABLE_MARKERS[drag.key];
    const next = insertMarkerAtOffset(textWithout, drag.snapOffset, marker);
    dropCommittedRef.current = true;
    dragStateRef.current = null;
    setIsDragging(false);

    rebuildFromValue(next);
    commitDisplayText(next, true);
  }

  function handleDragEnd() {
    hideDropIndicator();
    const chip = draggedChipRef.current;
    if (chip) {
      chip.classList.remove("opacity-50", "ring-2", "ring-[#00a884]/50");
    }
    draggedChipRef.current = null;
    if (!dropCommittedRef.current && dragStateRef.current) {
      rebuildFromValue(lastValidValue.current);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  }

  return (
    <div className="rounded-lg border bg-muted/30 space-y-2 p-2.5">
      <p className="text-sm text-muted-foreground leading-snug">
        Edite abaixo; arraste variáveis entre palavras (marcador verde).
      </p>

      <div ref={shellRef} className="relative">
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            syncFromEditor();
          }}
          className={cn(
            "w-full overflow-y-auto rounded-md border border-input bg-background px-3 py-2 leading-normal",
            "text-base min-h-[calc(3lh+0.5rem)] max-h-[calc(6lh+0.5rem)]",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "whitespace-pre-wrap break-words",
            disabled && "opacity-50 pointer-events-none",
            isDragging && "ring-1 ring-[#00a884]/40",
          )}
        />
        <div
          ref={indicatorRef}
          className="pointer-events-none absolute w-[2px] rounded-full bg-[#00a884] shadow-[0_0_6px_rgba(0,168,132,0.65)]"
          style={{ display: "none" }}
          aria-hidden
        />
      </div>
    </div>
  );
});
