// Lê um JSON do site sem cache; devolve null se não existir ou der erro
export function lerJson(caminho) {
  return fetch(caminho, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
}

// Escapa texto para HTML (só para os poucos lugares que montam HTML como texto, ex.: título da aba)
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// Link só se for http(s) (logo de time, avatar...)
export const urlOk = (u) => typeof u === 'string' && /^https?:\/\//i.test(u)
