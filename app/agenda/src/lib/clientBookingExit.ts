/** Tenta encerrar a sessão de agendamento do cliente (aba, PWA ou janela). */
export function exitClientBookingFlow() {
  const tryClose = () => {
    window.open("", "_self");
    window.close();
  };

  tryClose();

  if (window.history.length > 1) {
    window.history.go(-(window.history.length - 1));
    window.setTimeout(tryClose, 120);
  }

  window.setTimeout(() => {
    window.location.replace("about:blank");
  }, 280);
}
