// Service worker só para as notificações de partida (o Chrome do Android não mostra notificação sem ele).
// Não guarda cache nem mexe nas páginas.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

// Clicar na notificação: abre (ou foca) a página da partida
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = new URL(e.notification.data?.url || '/partidas/', self.location.origin).href
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abas) => {
      const aba = abas.find((c) => c.url === url) || abas[0]
      if (aba) return aba.navigate(url).then((c) => (c || aba).focus())
      return self.clients.openWindow(url)
    }),
  )
})
