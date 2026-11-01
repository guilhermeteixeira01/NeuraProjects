// Cenários do modo demo (npm run dev:demo). O modo só existe no servidor de desenvolvimento, em localhost, com --mode demo:
// `import.meta.env.DEV` é falso em qualquer build (o bloco inteiro some do pacote) e o hostname é conferido de novo aqui.
export const CENARIOS = [
  ['cheio', 'Preenchido'],
  ['vazio', 'Vazio'],
  ['carregando', 'Carregando'],
  ['erro', 'Erro'],
  ['sem-login', 'Sem login'],
  ['sem-permissao', 'Sem permissão'],
]
export const LOBBIES = [
  ['cinco', '5 jogadores'],
  ['vagas', 'Com vagas'],
]
const CHAVE = 'np-demo-cenario'
const CHAVE_LOBBY = 'np-demo-lobby'

export const demoPermitido = () =>
  import.meta.env.DEV && import.meta.env.MODE === 'demo' && typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)

const ler = (chave, validos, padrao) => {
  try {
    const v = new URLSearchParams(location.search).get(chave === CHAVE ? 'demo' : 'demoLobby') || localStorage.getItem(chave)
    return validos.some(([id]) => id === v) ? v : padrao
  } catch {
    return padrao
  }
}
export const cenarioAtual = () => ler(CHAVE, CENARIOS, 'cheio') // o cenário inicial é sempre o preenchido
export const lobbyAtual = () => ler(CHAVE_LOBBY, LOBBIES, 'cinco')
export function gravar(chave, valor) {
  try {
    localStorage.setItem(chave === 'cenario' ? CHAVE : CHAVE_LOBBY, valor)
  } catch {
    /* sem armazenamento: vale só até recarregar */
  }
}
