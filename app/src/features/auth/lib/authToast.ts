import { toast } from "@/hooks/use-toast";

const whiteToastClass =
  "border-gray-200 bg-white text-gray-900 shadow-lg [&_[data-radix-toast-description]]:text-gray-800";

/** Pop-up branco para avisos de autenticação. */
export function authInfoToast(message: string) {
  toast({
    description: message,
    className: whiteToastClass,
  });
}
