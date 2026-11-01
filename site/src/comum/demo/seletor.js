// Seletor discreto do modo demo (só em desenvolvimento): troca o cenário e recarrega a página. Também avisa que os dados são demonstrativos.
// Montado direto no DOM (fora do React), então não participa da hidratação nem aparece em nenhuma página publicada.
import { CENARIOS, LOBBIES, gravar } from './cenarios.js'

const CSS = `
.np-demo{position:fixed;left:calc(var(--nx-lateral,0px) + 14px);bottom:14px;z-index:9999;font:600 12px/1.2 'Segoe UI',system-ui,sans-serif;color:#d3dbe6}
.np-demo *{box-sizing:border-box}
.np-demo-bt{display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 12px;border:1px solid rgba(83,136,180,.4);border-radius:999px;background:rgba(6,16,26,.92);color:#d3dbe6;cursor:pointer;font:inherit;backdrop-filter:blur(8px)}
.np-demo-bt:hover{border-color:#6bd4ff;color:#fff}
.np-demo-bt i{width:8px;height:8px;border-radius:50%;background:#e9b94c;box-shadow:0 0 8px #e9b94c}
.np-demo-pn{position:absolute;left:0;bottom:38px;width:236px;padding:12px;border:1px solid rgba(83,136,180,.4);border-radius:12px;background:rgba(6,16,26,.97);box-shadow:0 18px 40px -16px #000}
.np-demo-pn[hidden]{display:none}
.np-demo-pn h3{margin:0 0 4px;font:700 11px/1.2 inherit;letter-spacing:.14em;text-transform:uppercase;color:#6bd4ff}
.np-demo-pn p{margin:0 0 10px;color:#a8b5c7;font-weight:500}
.np-demo-pn label{display:block;margin:10px 0 5px;color:#7d8aa0;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
.np-demo-g{display:flex;flex-wrap:wrap;gap:5px}
.np-demo-g button{height:28px;padding:0 10px;border:1px solid rgba(83,136,180,.28);border-radius:7px;background:#081421;color:#d3dbe6;cursor:pointer;font:inherit}
.np-demo-g button:hover{border-color:#6bd4ff}
.np-demo-g button[aria-pressed=true]{background:#3478f6;border-color:#5b9bff;color:#fff}
.np-demo :focus-visible{outline:2px solid #6bd4ff;outline-offset:2px}
@media (max-width:1024px){.np-demo{bottom:78px;left:14px}}
`

export function montarSeletor(cenario, lobby) {
  if (document.querySelector('.np-demo')) return
  const estilo = document.createElement('style')
  estilo.textContent = CSS
  document.head.append(estilo)
  const raiz = document.createElement('div')
  raiz.className = 'np-demo'
  const rotulo = CENARIOS.find(([id]) => id === cenario)?.[1] || ''
  raiz.innerHTML = `<button type="button" class="np-demo-bt" aria-expanded="false" aria-controls="np-demo-pn"><i></i>Dados demonstrativos · ${rotulo}</button>
<div class="np-demo-pn" id="np-demo-pn" hidden><h3>Modo demo</h3><p>Dados inventados, só neste navegador. Nada chega a serviços reais.</p>
<label>Cenário</label><div class="np-demo-g" data-g="cenario"></div><label>Lobby</label><div class="np-demo-g" data-g="lobby"></div></div>`
  const botao = raiz.querySelector('.np-demo-bt')
  const painel = raiz.querySelector('.np-demo-pn')
  botao.addEventListener('click', () => {
    painel.hidden = !painel.hidden
    botao.setAttribute('aria-expanded', String(!painel.hidden))
  })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !painel.hidden) { painel.hidden = true; botao.setAttribute('aria-expanded', 'false'); botao.focus() } })
  const grupo = (nome, lista, atual) => {
    const alvo = raiz.querySelector(`[data-g=${nome}]`)
    for (const [id, texto] of lista) {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = texto
      b.setAttribute('aria-pressed', String(id === atual))
      b.addEventListener('click', () => {
        gravar(nome, id)
        const u = new URL(location.href)
        u.searchParams.delete('demo'); u.searchParams.delete('demoLobby')
        if (nome === 'cenario') { sessionStorage.removeItem('np-preview-saiu') }
        location.replace(u.toString())
      })
      alvo.append(b)
    }
  }
  grupo('cenario', CENARIOS, cenario)
  grupo('lobby', LOBBIES, lobby)
  const reiniciar = document.createElement('button')
  reiniciar.type = 'button'
  reiniciar.className = 'np-demo-bt'
  reiniciar.textContent = 'Reiniciar partida de teste'
  reiniciar.addEventListener('click', () => {
    try {
      const chave = `np-demo-dados-${cenario}`
      const estado = JSON.parse(sessionStorage.getItem(chave) || '{}')
      delete estado.lobbyPartidaDemo
      sessionStorage.setItem(chave, JSON.stringify(estado))
    } catch { /* Sem armazenamento: recarrega a demonstração. */ }
    location.assign('/lobby/?demo=cheio&demoLobby=cinco')
  })
  painel.append(reiniciar)
  document.body.append(raiz)
}
