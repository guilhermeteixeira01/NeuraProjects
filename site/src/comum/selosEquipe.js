// Imagens dos selos de dono/admin: ficam em public/assets/selos-equipe/ (a lista vem do vite.config.js, módulo virtual).
// Para ter uma imagem nova, é só colocar o arquivo nessa pasta e recarregar o painel (aba Cargos → Selos da equipe).
import arquivos from 'virtual:selos-equipe'

export const IMAGENS_SELO = arquivos
export const IMAGEM_SELO_PADRAO = 'verified.png'
export const urlSelo = (nome) => `/assets/selos-equipe/${encodeURIComponent(nome || IMAGEM_SELO_PADRAO)}`
