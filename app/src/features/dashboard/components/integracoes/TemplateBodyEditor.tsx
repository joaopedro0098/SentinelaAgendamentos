import { useEffect, useRef, useState, type DragEvent } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type BodySegment,
  type TemplateLanguage,
  type TemplateVariableKey,
  VARIABLE_UI_LABELS,
  parseBodyDisplayText,
  serializeBodySegments,
} from "@/features/dashboard/lib/metaTemplateProduct";

type TemplateBodyEditorProps = {
  value: string;
  onChange: (next: string) => void;
  language: TemplateLanguage;
  disabled?: boolean;
};

const DRAG_MIME = "application/x-template-segment-index";

function reorderSegments(segments: BodySegment[], fromIndex: number, toIndex: number): BodySegment[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= segments.length) {
    return segments;
  }
  const next = segments.slice();
  const [moved] = next.splice(fromIndex, 1);
  const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
  next.splice(insertAt, 0, moved);
  return next;
}

function updateTextSegment(segments: BodySegment[], index: number, text: string): BodySegment[] {
  return segments.map((s, i) => (i === index && s.type === "text" ? { ...s, value: text } : s));
}

type DropSide = "before" | "after";

function resolveInsertIndex(targetIndex: number, side: DropSide, segmentCount: number): number {
  return side === "before" ? targetIndex : Math.min(targetIndex + 1, segmentCount);
}

export function TemplateBodyEditor({ value, onChange, language, disabled }: TemplateBodyEditorProps) {
  const [segments, setSegments] = useState<BodySegment[]>(() => parseBodyDisplayText(value));
  const lastEmittedValue = useRef(value);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropHint, setDropHint] = useState<{ index: number; side: DropSide } | null>(null);

  useEffect(() => {
    if (value !== lastEmittedValue.current) {
      lastEmittedValue.current = value;
      setSegments(parseBodyDisplayText(value));
    }
  }, [value]);

  function emit(next: BodySegment[]) {
    setSegments(next);
    const serialized = serializeBodySegments(next);
    lastEmittedValue.current = serialized;
    onChange(serialized);
  }

  function handleTextChange(index: number, text: string) {
    emit(updateTextSegment(segments, index, text));
  }

  function handleDropOnSlot(targetIndex: number, side: DropSide, fromIndex: number) {
    const insertAt = resolveInsertIndex(targetIndex, side, segments.length);
    emit(reorderSegments(segments, fromIndex, insertAt));
    setDraggingIndex(null);
    setDropHint(null);
  }

  function handleDragStart(index: number, e: DragEvent) {
    if (disabled) return;
    e.dataTransfer.setData(DRAG_MIME, String(index));
    e.dataTransfer.effectAllowed = "move";
    setDraggingIndex(index);
  }

  function handleDragEnd() {
    setDraggingIndex(null);
    setDropHint(null);
  }

  function handleDragOverSlot(index: number, e: DragEvent) {
    if (disabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const side: DropSide = e.clientX < rect.left + rect.width / 2 ? "before" : "after";
    setDropHint({ index, side });
  }

  function handleDropOnSegment(targetIndex: number, e: DragEvent) {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();

    const raw = e.dataTransfer.getData(DRAG_MIME);
    const fromIndex = Number(raw);
    if (!Number.isFinite(fromIndex)) return;

    const side = dropHint?.index === targetIndex ? dropHint.side : "after";
    handleDropOnSlot(targetIndex, side, fromIndex);
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <p className="text-sm text-muted-foreground">
        Edite o texto livremente. Arraste variáveis ou blocos de texto para reorganizar a mensagem.
      </p>

      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 text-base leading-relaxed min-h-[2.75rem] rounded-md p-1",
          draggingIndex !== null && "bg-background/60 ring-1 ring-primary/20",
        )}
        onDragOver={(e) => {
          if (disabled || segments.length > 0) return;
          e.preventDefault();
        }}
        onDrop={(e) => {
          if (disabled || segments.length > 0) return;
          e.preventDefault();
          const fromIndex = Number(e.dataTransfer.getData(DRAG_MIME));
          if (!Number.isFinite(fromIndex)) return;
          handleDropOnSlot(0, "before", fromIndex);
        }}
      >
        {segments.map((segment, index) => {
          const isDragging = draggingIndex === index;
          const showBefore =
            dropHint?.index === index && dropHint.side === "before" && draggingIndex !== null;
          const showAfter =
            dropHint?.index === index && dropHint.side === "after" && draggingIndex !== null;

          if (segment.type === "variable") {
            return (
              <div
                key={`seg-${index}-${segment.key}`}
                className="relative inline-flex items-center"
                onDragOver={(e) => handleDragOverSlot(index, e)}
                onDrop={(e) => handleDropOnSegment(index, e)}
              >
                {showBefore && <DropIndicator position="before" />}
                <span
                  draggable={!disabled}
                  onDragStart={(e) => handleDragStart(index, e)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-md bg-primary/10 text-primary px-2 py-0.5 text-sm font-medium select-none border border-primary/20",
                    !disabled && "cursor-grab active:cursor-grabbing hover:bg-primary/15",
                    isDragging && "opacity-40",
                  )}
                  title="Arraste para reposicionar"
                >
                  <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                  {VARIABLE_UI_LABELS[language][segment.key as TemplateVariableKey]}
                </span>
                {showAfter && <DropIndicator position="after" />}
              </div>
            );
          }

          return (
            <div
              key={`seg-${index}-text`}
              className="relative inline-flex items-start gap-0.5 min-w-[8rem] flex-1"
              onDragOver={(e) => handleDragOverSlot(index, e)}
              onDrop={(e) => handleDropOnSegment(index, e)}
            >
              {showBefore && <DropIndicator position="before" />}
              <span
                draggable={!disabled}
                onDragStart={(e) => handleDragStart(index, e)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "mt-1.5 inline-flex shrink-0 rounded p-0.5 text-muted-foreground",
                  !disabled && "cursor-grab active:cursor-grabbing hover:bg-muted hover:text-foreground",
                  isDragging && "opacity-40",
                )}
                title="Arraste para reposicionar este bloco"
                aria-label="Arrastar bloco de texto"
              >
                <GripVertical className="h-4 w-4" />
              </span>
              <textarea
                value={segment.value}
                disabled={disabled}
                rows={1}
                onChange={(e) => handleTextChange(index, e.target.value)}
                className={cn(
                  "min-w-[6rem] flex-1 resize-y overflow-y-auto rounded-md border border-input bg-background px-2 py-1 text-base leading-normal",
                  "min-h-[calc(1lh+0.5rem)] max-h-[calc(3lh+0.5rem)]",
                  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50",
                  isDragging && "opacity-60",
                )}
              />
              {showAfter && <DropIndicator position="after" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DropIndicator({ position }: { position: DropSide }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 bottom-0 w-0.5 rounded-full bg-primary z-10",
        position === "before" ? "-left-1" : "-right-1",
      )}
    />
  );
}
