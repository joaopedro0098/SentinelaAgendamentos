self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Sentinela Agendamentos";
  const options = {
    body: data.body || "Você tem uma atualização de agendamento.",
    icon: "/icon-192.png",
    badge: "/favicon-48.png",
    data: {
      url: data.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && client.url === url) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
      return undefined;
    }),
  );
});
