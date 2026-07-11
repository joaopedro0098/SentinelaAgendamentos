import { cn } from "@/lib/utils";

type Props = {
  mimeType: string;
  fileName: string;
  className?: string;
};

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

function resolveKind(mimeType: string, fileName: string): "pdf" | "word" | "image" {
  const ext = fileExtension(fileName);
  if (mimeType === "application/pdf" || ext === ".pdf") return "pdf";
  if (
    mimeType === "application/msword" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".doc" ||
    ext === ".docx"
  ) {
    return "word";
  }
  return "image";
}

/** Ícones no estilo Explorer (aproximação visual — não usa assets do Windows). */
export function PacienteDocumentoFileIcon({ mimeType, fileName, className }: Props) {
  const kind = resolveKind(mimeType, fileName);

  if (kind === "pdf") {
    return (
      <svg
        viewBox="0 0 32 40"
        aria-hidden
        className={cn("h-10 w-8 shrink-0 drop-shadow-sm", className)}
      >
        <path
          d="M6 2h12l8 8v28a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
          fill="#E74C3C"
        />
        <path d="M18 2v8h8" fill="#C0392B" />
        <rect x="7" y="18" width="18" height="8" rx="1" fill="#fff" opacity="0.95" />
        <text
          x="16"
          y="24"
          textAnchor="middle"
          fill="#C0392B"
          fontSize="6"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          PDF
        </text>
      </svg>
    );
  }

  if (kind === "word") {
    return (
      <svg
        viewBox="0 0 32 40"
        aria-hidden
        className={cn("h-10 w-8 shrink-0 drop-shadow-sm", className)}
      >
        <path
          d="M6 2h12l8 8v28a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
          fill="#2B579A"
        />
        <path d="M18 2v8h8" fill="#1E3F6F" />
        <text
          x="16"
          y="27"
          textAnchor="middle"
          fill="#fff"
          fontSize="11"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          W
        </text>
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 32 40"
      aria-hidden
      className={cn("h-10 w-8 shrink-0 drop-shadow-sm", className)}
    >
      <path
        d="M6 2h12l8 8v28a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
        fill="#4A90A4"
      />
      <path d="M18 2v8h8" fill="#3A7285" />
      <circle cx="12" cy="22" r="2.5" fill="#F4D03F" />
      <path
        d="M8 30 L14 24 L18 28 L22 22 L26 30 Z"
        fill="#58D68D"
        stroke="#2E7D4F"
        strokeWidth="0.5"
      />
      <circle cx="21" cy="19" r="1.5" fill="#85C1E9" />
    </svg>
  );
}
