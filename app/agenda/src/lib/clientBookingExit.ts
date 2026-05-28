/** Tenta encerrar a sessão de agendamento do cliente (aba, PWA ou janela). */
export function exitClientBookingFlow(): boolean {
  const tryClose = () => {
    try {
      window.close();
    } catch {
      /* navegador bloqueou */
    }
  };

  if (window.opener) {
    tryClose();
    return true;
  }

  tryClose();

  const referrer = document.referrer;
  if (referrer && !referrer.startsWith(window.location.origin)) {
    window.location.replace(referrer);
    return true;
  }

  if (window.history.length > 1) {
    window.history.back();
    window.setTimeout(tryClose, 120);
    return true;
  }

  return false;
}
