// Ferramenta de teste LOCAL do lobby / fila / aceite / Pick & Ban (nada disso toca a produção).
// Uso (dentro de site/):  npm run teste:local -- <comando>
//   preparar   cria o .dev.vars (segredo de teste), cadastra os 10 jogadores de teste como amigos e mostra os links de login
//   bots       os 8 bots entram nos lobbies dos 2 jogadores reais (J1 e J2) -> 5 em cada, prontos para buscar partida
//   aceitar    os bots aceitam a partida encontrada (você aceita pelo navegador)
//   auto       fica rodando e os bots aceitam toda partida assim que ela aparece
//   buscar2   o Jogador 2 busca partida (assim você testa com uma janela só, como Jogador 1)
//   veto2      o Jogador 2 joga a vez dele no veto (mapa livre qualquer; lado CT)
//   limpar     apaga os dados locais (lobbies, partidas, amigos)
// Jogadores: J1 = ...0001 e J2 = ...0002 (navegador); B1..B8 = ...0011 a ...0018 (bots).
import { createHmac, randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const worker = path.resolve(aqui, '..')
const VARS = path.join(worker, '.dev.vars')
const API = process.env.WORKER_LOCAL || 'http://localhost:8787'
const SITES = ['http://localhost:5173', 'http://127.0.0.1:5173'] // dois endereços = dois "navegadores" separados (cada um guarda o seu login)

const gente = [
  ['76561198000000001', 'Jogador 1'],
  ['76561198000000002', 'Jogador 2'],
  ...Array.from({ length: 8 }, (_, i) => [`765611980000000${String(11 + i)}`, `Bot ${i + 1}`]),
]
const bots = gente.slice(2)
const [J1, J2] = gente

const b64 = (b) => Buffer.from(b).toString('base64url')
const segredo = () => /^SEGREDO="?([^"\r\n]+)"?/m.exec(fs.readFileSync(VARS, 'utf8'))?.[1]
function token([id, nome]) {
  const corpo = b64(JSON.stringify({ id, nome, avatar: '', exp: Math.floor(Date.now() / 1000) + 7 * 86400 }))
  return `${corpo}.${createHmac('sha256', segredo()).update(corpo).digest('base64url')}`
}

async function lobby(jogador, acao, id, valor) {
  const r = await fetch(`${API}/lobby`, {
    method: acao ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token(jogador)}`, 'Content-Type': 'application/json', Origin: SITES[0] },
    body: acao ? JSON.stringify({ acao, id, valor }) : undefined,
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) console.log(`  ! ${jogador[1]} ${acao || 'ler'}: ${d.erro || r.status}`)
  return d
}

const comandos = {
  async preparar() {
    if (!fs.existsSync(VARS)) {
      fs.writeFileSync(VARS, `SEGREDO="${randomBytes(24).toString('hex')}"\nORIGENS_EXTRAS="${SITES.join(',')}"\n`)
      console.log('Criei', VARS)
    }
    // Todo mundo é amigo de todo mundo; nomes para aparecerem no lugar do SteamID
    const amigos = Object.fromEntries(gente.map(([id]) => [id, { amigos: gente.map(([x]) => x).filter((x) => x !== id), recebidos: [], enviados: [] }]))
    const usuarios = Object.fromEntries(gente.map(([id, nome]) => [id, { nome, avatar: '' }]))
    const tmp = fs.mkdtempSync(path.join(process.env.TEMP || '.', 'np-dev-'))
    for (const [chave, dados] of [['amigos', amigos], ['usuarios', usuarios]]) {
      const arq = path.join(tmp, `${chave}.json`)
      fs.writeFileSync(arq, JSON.stringify(dados))
      execFileSync('npx', ['wrangler', 'kv', 'key', 'put', chave, '--path', arq, '--binding', 'MOLDURAS', '--local'], { cwd: worker, stdio: 'inherit', shell: true })
    }
    fs.rmSync(tmp, { recursive: true, force: true })
    console.log('\nPronto. Com o worker (npm run worker:local) e o site (npm run dev:local) rodando, entre assim:\n')
    console.log(`  ${J1[1]}  (navegador normal):\n  ${SITES[0]}/lobby/#steam=${token(J1)}\n`)
    console.log(`  ${J2[1]}  (janela anônima ou outro navegador):\n  ${SITES[1]}/lobby/#steam=${token(J2)}\n`)
    console.log('Depois rode:  npm run teste:local -- bots')
  },

  async bots() {
    // Os líderes abrem o lobby ao público; cada bot entra no seu
    for (const [lider, grupo] of [[J1, bots.slice(0, 4)], [J2, bots.slice(4)]]) {
      await lobby(lider, 'publico', undefined, true)
      for (const b of grupo) await lobby(b, 'entrar', lider[0])
      const v = await lobby(lider)
      console.log(`${lider[1]}: ${v.membros?.length}/5 no lobby`)
    }
    console.log('Agora clique em BUSCAR PARTIDA nas duas janelas.')
  },

  async aceitar() {
    for (const b of bots) await lobby(b, 'aceitar')
    const v = await lobby(J1)
    console.log(v.partida ? `Partida: ${v.partida.fase}, ${v.partida.aceitos.length}/10 aceitaram` : 'Nenhuma partida em andamento.')
  },

  // Fica rodando: os bots aceitam qualquer partida assim que ela aparece (Ctrl+C para parar)
  async auto() {
    console.log('Bots no automático: aceitam toda partida encontrada.')
    for (;;) {
      const v = await lobby(J1)
      if (v.partida?.fase === 'aceitar') for (const b of [...bots, J2]) if (!v.partida.aceitos.includes(b[0])) await lobby(b, 'aceitar')
      await new Promise((r) => setTimeout(r, 1000))
    }
  },

  async buscar2() {
    const formato = process.argv[3] === 'bo1' ? 'bo1' : 'bo3'
    await lobby(J2, 'cancelar-busca') // recomeça a busca no formato pedido
    const v = await lobby(J2, 'buscar', undefined, { formato })
    console.log(v.busca ? `Jogador 2 está buscando ${formato === 'bo1' ? 'MD1' : 'MD3'}.` : 'Não buscou (lobby completo?).')
  },

  async veto2() {
    const v = await lobby(J2)
    const p = v.partida
    if (p?.fase !== 'veto') return console.log('Sem veto em andamento.')
    const livres = p.pool.filter((m) => !p.historico.some((h) => h.map === m))
    const r = await lobby(J2, 'veto', undefined, { mapa: livres[0], lado: 'ct' })
    console.log(r.partida ? `Jogou. Etapas feitas: ${r.partida.historico.length}` : 'Não é a vez do Jogador 2.')
  },

  limpar() {
    fs.rmSync(path.join(worker, '.wrangler', 'state'), { recursive: true, force: true })
    console.log('Dados locais apagados. Reinicie o worker local e rode "preparar" de novo.')
  },
}

const cmd = process.argv[2]
if (!comandos[cmd]) {
  console.log('Comandos:', Object.keys(comandos).join(' | '))
  process.exit(1)
}
await comandos[cmd]()
