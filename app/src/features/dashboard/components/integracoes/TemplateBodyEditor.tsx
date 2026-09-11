import { useMemo } from "react";
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

function updateTextSegment(segments: BodySegment[], index: number, text: string): BodySegment[] {
  return segments.map((s, i) => (i === index && s.type === "text" ? { ...s, value: text } : s));
}

export function TemplateBodyEditor({ value, onChange, language, disabled }: TemplateBodyEditorProps) {
  const segments = useMemo(() => parseBodyDisplayText(value), [value]);

  function handleTextChange(index: number, text: string) {
    onChange(serializeBodySegments(updateTextSegment(segments, index, text)));
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <p className="text-xs text-muted-foreground">
        Edite o texto livremente. As variáveis destacadas são preenchidas automaticamente no envio.
      </p>
      <div className="flex flex-wrap items-center gap-1 text-sm leading-relaxed">
        {segments.map((segment, index) => {
          if (segment.type === "variable") {
            return (
              <span
                key={`var-${index}`}
                className="inline-flex items-center rounded-md bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium select-none"
                title="Variável automática"
              >
                {VARIABLE_UI_LABELS[language][segment.key as TemplateVariableKey]}
              </span>
            );
          }

          return (
            <textarea
              key={`text-${index}`}
              value={segment.value}
              disabled={disabled}
              rows={Math.max(1, Math.ceil(segment.value.length / 48))}
              onChange={(e) => handleTextChange(index, e.target.value)}
              className="min-w-[8rem] flex-1 resize-y rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
          );
        })}
      </div>
    </div>
  );
}
