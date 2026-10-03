/*
 * Push das partidas novas pelo OneSignal (chega mesmo com o site fechado, para quem permitiu as notificações).
 *
 * No deploy (.github/workflows/deploy.yml):
 *   1. build:  node scripts/notificar.mjs preparar <partidas.json no ar antes> <partidas.json novo> <saida.json>
 *      compara o histórico que estava publicado com o novo e grava os avisos (mesmo texto do card do site)
 *   2. depois de publicar: node scripts/notificar.mjs enviar <saida.json>
 *      manda cada aviso pela API do OneSignal (chave em ONESIGNAL_API_KEY, nos Secrets do GitHub)
 * Comparar com o que estava no ar (e não com o commit anterior) garante que nenhuma partida fica sem aviso
 * quando dois commits chegam juntos e o deploy do primeiro é cancelado.
 */
import fs from 'node:fs'
import { novidadesEntre } from '../src/comum/novidades.js'

const SITE = 'https://neuraproject.com.br'
const APP_ID = 'e2d061b1-3a8e-41fb-9b5c-6e0e8751ab96'
const ICONE = `${SITE}/assets/logos/android-chrome-192x192.png`

const lerLista = (arq) => {
  try {
    const l = JSON.parse(fs.readFileSync(arq, 'utf8'))
    return Array.isArray(l) ? l : null
  } catch {
    return null
  }
}

const [acao, ...args] = process.argv.slice(2)

if (acao === 'preparar') {
  const [arqAntes, arqDepois, saida] = args
  const antes = lerLista(arqAntes)
  const depois = lerLista(arqDepois) || []
  // Sem o histórico de antes (primeiro deploy, site fora do ar...): não avisa nada, para não mandar o histórico inteiro
  const avisos = antes ? novidadesEntre(antes, depois) : []
  fs.writeFileSync(saida, JSON.stringify(avisos, null, 2))
  console.log(antes ? `Avisos para mandar: ${avisos.length}` : 'Sem o histórico anterior: nenhum aviso.')
  for (const a of avisos) console.log(`  - ${a.titulo} | ${a.texto.replace('\n', ' | ')}`)
} else if (acao === 'enviar') {
  const avisos = JSON.parse(fs.readFileSync(args[0], 'utf8'))
  const chave = process.env.ONESIGNAL_API_KEY
  if (!avisos.length) {
    console.log('Nada para avisar.')
  } else if (!chave) {
    console.log('ONESIGNAL_API_KEY não configurada nos Secrets do GitHub: push não enviado.')
  } else {
    let falhas = 0
    for (const a of avisos) {
      const res = await fetch('https://api.onesignal.com/notifications?c=push', {
        method: 'POST',
        headers: { Authorization: `Key ${chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: APP_ID,
          included_segments: ['All'],
          isAnyWeb: true,
          headings: { en: a.titulo, pt: a.titulo },
          contents: { en: a.texto, pt: a.texto },
          url: `${SITE}${a.link}`,
          chrome_web_icon: ICONE,
          firefox_icon: ICONE,
        }),
      })
      const corpo = await res.text()
      if (res.ok) console.log(`Push enviado: ${a.titulo} — ${corpo}`)
      else {
        falhas++
        console.log(`Falhou (${res.status}): ${a.titulo} — ${corpo}`)
      }
    }
    // Falha de push não derruba o deploy (o site já está publicado)
    if (falhas) console.log(`${falhas} push(es) falharam.`)
  }
} else {
  console.log('Uso: node scripts/notificar.mjs preparar <antes.json> <depois.json> <saida.json> | enviar <saida.json>')
  process.exit(1)
}
