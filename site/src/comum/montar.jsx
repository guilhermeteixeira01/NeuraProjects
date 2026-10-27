import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
// Base visual de todas as páginas (cores, barras, rodapé, efeitos): no pedaço de CSS compartilhado, que o navegador guarda e reaproveita
// de uma página para outra. Carrega antes do CSS da página (src/entradas/<página>.css), que vem depois e ganha dele.
import './site.css'
import { capturarIndicacao } from './indicacao.js'

// Liga a página no navegador.
// No site publicado o HTML já vem pronto (gerado no deploy, bom para o Google) e o React só "assume" ele;
// os dados usados para gerar vêm junto, em <script id="dados-pagina">. No `npm run dev` a página vem vazia
// e o próprio componente busca os dados.
export async function montar(Pagina) {
  capturarIndicacao()
  if (import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    const { ativarPreviewLocal } = await import('./previewLocal.js')
    ativarPreviewLocal()
  }
  const raiz = document.getElementById('root')
  const el = document.getElementById('dados-pagina')
  const dados = el ? JSON.parse(el.textContent) : undefined
  const app = (
    <StrictMode>
      <Pagina dados={dados} />
    </StrictMode>
  )
  if (raiz.firstElementChild) hydrateRoot(raiz, app)
  else createRoot(raiz).render(app)
}
