import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'

// Liga a página no navegador.
// No site publicado o HTML já vem pronto (gerado no deploy, bom para o Google) e o React só "assume" ele;
// os dados usados para gerar vêm junto, em <script id="dados-pagina">. No `npm run dev` a página vem vazia
// e o próprio componente busca os dados.
export function montar(Pagina) {
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
