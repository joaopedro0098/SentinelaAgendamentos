import { bodyToPreviewText, type TemplateLanguage } from "@/features/dashboard/lib/metaTemplateProduct";
import { cn } from "@/lib/utils";
import { Camera, ChevronLeft, Mic, MoreVertical, Paperclip, Phone, Smile, User, Video } from "lucide-react";

type WhatsAppTemplatePhonePreviewProps = {
  body: string;
  language: TemplateLanguage;
  quickReplyLabels: string[];
  className?: string;
  /** `viewport` preenche o contêiner (celular flutuante, altura da tela). */
  size?: "default" | "large" | "viewport";
};

/** Preview estático do chat WhatsApp (modo escuro) para o editor de templates. */
export function WhatsAppTemplatePhonePreview({
  body,
  language,
  quickReplyLabels,
  className,
  size = "default",
}: WhatsAppTemplatePhonePreviewProps) {
  const previewMessage = bodyToPreviewText(body, language).trim() || "Sua mensagem aparecerá aqui.";
  const isViewport = size === "viewport";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-[2.25rem] border-[4px] border-[#1a252d] shadow-[0_16px_48px_rgba(0,0,0,0.45)]",
        isViewport && "h-full w-full",
        size === "large" && "w-[340px] shrink-0",
        size === "default" && "mx-auto w-[min(100%,280px)] shrink-0",
        className,
      )}
      aria-hidden
    >
      <div
        className={cn(
          "bg-[#0b141a] text-[#e9edef] leading-tight flex flex-col h-full min-h-0",
          isViewport && "text-[12px]",
          size === "large" && "min-h-[620px] text-[12px]",
          size === "default" && "min-h-[480px] max-h-[520px] text-[11px]",
        )}
      >
        {/* barra de status simulada */}
        <div className="flex items-center justify-between px-4 pt-2 pb-0.5 text-[10px] text-[#e9edef]/90">
          <span>18:56</span>
          <div className="flex items-center gap-1 opacity-80">
            <span className="text-[9px]">97%</span>
          </div>
        </div>

        {/* header do chat */}
        <div className="flex items-center gap-2 px-2 py-2 bg-[#1f2c34] border-b border-black/20">
          <ChevronLeft className="h-5 w-5 shrink-0 text-[#aebac1]" strokeWidth={2} />
          <div className="h-9 w-9 rounded-full bg-[#6b7c85] flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-[#cfd4d6]" strokeWidth={1.75} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-[14px] text-[#e9edef] truncate">Seu nome</p>
          </div>
          <Video className="h-[18px] w-[18px] text-[#aebac1] shrink-0" strokeWidth={1.75} />
          <Phone className="h-[17px] w-[17px] text-[#aebac1] shrink-0 ml-1" strokeWidth={1.75} />
          <MoreVertical className="h-[18px] w-[18px] text-[#aebac1] shrink-0 ml-0.5" strokeWidth={1.75} />
        </div>

        {/* área do chat */}
        <div
          className={cn(
            "flex-1 min-h-0 px-3 py-3 relative",
            isViewport ? "overflow-hidden" : "overflow-y-auto",
          )}
          style={{
            backgroundColor: "#0b141a",
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        >
          <div className="flex justify-center mb-3">
            <span className="rounded-md bg-[#182229] px-2.5 py-0.5 text-[10px] text-[#8696a0] shadow-sm">Hoje</span>
          </div>

          <p className="mx-1 mb-3 rounded-lg border border-[#ffbc38]/35 bg-[#182229]/90 px-2 py-1.5 text-[9px] leading-snug text-center text-[#ffbc38]">
            As mensagens e ligações são protegidas com criptografia de ponta a ponta.
          </p>

          <div className="flex justify-start mb-2">
            <div className="max-w-[92%] rounded-lg rounded-tl-none bg-[#202c33] px-2 py-1.5 shadow-sm">
              <p className="text-[13px] text-[#e9edef] whitespace-pre-wrap break-words leading-[1.35]">
                {previewMessage}
              </p>
              <p className="text-[9px] text-[#8696a0] text-right mt-0.5">18:56</p>
            </div>
          </div>

          {quickReplyLabels.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-2 items-stretch max-w-[92%]">
              {quickReplyLabels.map((label) => (
                <div
                  key={label}
                  className="rounded-full border border-[#00a884]/60 bg-[#0b141a]/80 py-1.5 text-center text-[12px] font-medium text-[#00a884]"
                >
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* input inferior (decorativo) */}
        <div className="flex items-end gap-2 px-2 py-2 bg-[#1f2c34]">
          <div className="flex-1 flex items-center gap-2 rounded-full bg-[#2a3942] px-3 py-2 min-h-[36px]">
            <Smile className="h-[22px] w-[22px] text-[#8696a0] shrink-0" strokeWidth={1.5} />
            <span className="flex-1 text-[14px] text-[#8696a0] truncate">Mensagem</span>
            <Paperclip className="h-[20px] w-[20px] text-[#8696a0] shrink-0" strokeWidth={1.5} />
            <Camera className="h-[20px] w-[20px] text-[#8696a0] shrink-0" strokeWidth={1.5} />
          </div>
          <div className="h-10 w-10 rounded-full bg-[#00a884] flex items-center justify-center shrink-0 mb-0.5">
            <Mic className="h-[22px] w-[22px] text-[#111b21]" strokeWidth={2} />
          </div>
        </div>

        <div className="h-1 bg-[#0b141a]" />
      </div>
    </div>
  );
}
