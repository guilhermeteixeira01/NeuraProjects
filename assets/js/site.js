/*
 * Menu (topo) e rodapé de TODAS as páginas do site: início, launcher, NeuraPick e partidas.
 * Cada página só tem os lugares vazios <header data-site-nav></header> e <footer data-site-footer></footer>;
 * este arquivo preenche os dois. Mudou aqui, muda no site inteiro.
 *
 * ┌──────────────────────────── CONFIGURAÇÃO ────────────────────────────┐
 * │ launcherAtivo: true = download liberado | false = "Em breve"          │
 * └───────────────────────────────────────────────────────────────────────┘
 */
(function () {
  var CONFIG = {
    launcherAtivo: false,

    // Download e informações da versão (tamanho/versão aparecem sozinhos na página do launcher)
    launcherDownload: 'https://webhook.neuraproject.com.br/download/latest',
    launcherInfo: 'https://webhook.neuraproject.com.br/download/latest/info',

    // Jogos do launcher (aparecem na página do launcher)
    launcherJogos: [
      { nome: 'Counter-Strike 1.6', status: 'Suportado' },
      { nome: 'Mais jogos', status: 'Em breve' },
    ],

    // Lista de times (nome + logo) usada pelo Pick & Ban; editada na página /times/
    repositorio: 'guilhermeteixeira01/NeuraProjects',
    branch: 'main',
    arquivoTimes: 'assets/data/times.json',

    // Redes sociais (deixe '' para esconder)
    discord: 'https://discord.gg/GJSMDJEQsn',
    youtube: '',
    instagram: '',
    twitch: '',
  };

  // No próprio site os links são relativos; fora dele (ex.: página de partida aberta no servidor) apontam pro site
  var SITE = /(^|\.)neuraproject\.com\.br$/.test(location.hostname) ? '' : 'https://neuraproject.com.br';
  var url = function (caminho) { return SITE + caminho; };

  var MENU = [
    { id: 'inicio', rotulo: 'Início', href: '/' },
    { id: 'launcher', rotulo: 'Launcher', href: '/launcher/', selo: CONFIG.launcherAtivo ? '' : 'EM BREVE' },
    { id: 'pick', rotulo: 'Pick & Ban', href: '/neurapick/' },
    { id: 'partidas', rotulo: 'Partidas', href: '/partidas/' },
  ];

  function paginaAtual() {
    var p = location.pathname;
    if (/^\/launcher/.test(p)) return 'launcher';
    if (/^\/neurapick/.test(p)) return 'pick';
    if (/\/partidas(\/|$)/.test(p)) return 'partidas';
    if (p === '/' || p === '/index.html') return 'inicio';
    return '';
  }

  var ICONE_DISCORD =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.7-3.6-13.7ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>';

  function montarMenu(el) {
    var atual = paginaAtual();
    var links = MENU.map(function (m) {
      return '<a class="nx-link' + (m.id === atual ? ' is-active' : '') + '" href="' + url(m.href) + '"' +
        (m.id === atual ? ' aria-current="page"' : '') + '>' + m.rotulo +
        (m.selo ? '<span class="nx-selo">' + m.selo + '</span>' : '') + '</a>';
    }).join('');

    el.classList.add('nx-nav');
    el.innerHTML =
      '<div class="nx-nav-inner">' +
        '<a class="nx-brand" href="' + url('/') + '">' +
          '<img src="' + url('/assets/logos/logoNP.ico') + '" alt="" width="30" height="30">' +
          '<span>NEURA <span class="nx-outline">PROJECT</span><span class="nx-sub">GAME STUDIO</span></span>' +
        '</a>' +
        '<nav class="nx-links" aria-label="Menu principal">' + links + '</nav>' +
        '<div class="nx-acoes">' +
          (CONFIG.discord ? '<a class="nx-btn nx-btn-ghost nx-discord" href="' + CONFIG.discord + '" target="_blank" rel="noopener">' + ICONE_DISCORD + '<span>Comunidade</span></a>' : '') +
          '<button class="nx-burger" type="button" aria-label="Abrir menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
        '</div>' +
      '</div>' +
      '<div class="nx-gaveta" hidden>' + links +
        (CONFIG.discord ? '<a class="nx-link" href="' + CONFIG.discord + '" target="_blank" rel="noopener">' + ICONE_DISCORD + ' Comunidade no Discord</a>' : '') +
      '</div>';

    var burger = el.querySelector('.nx-burger');
    var gaveta = el.querySelector('.nx-gaveta');
    burger.addEventListener('click', function () {
      var aberto = gaveta.hidden;
      gaveta.hidden = !aberto;
      el.classList.toggle('is-open', aberto);
      burger.setAttribute('aria-expanded', String(aberto));
      burger.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !gaveta.hidden) burger.click();
    });
  }

  function montarRodape(el) {
    var redes = [
      ['Discord', CONFIG.discord, 'discord'],
      ['YouTube', CONFIG.youtube, 'youtube'],
      ['Instagram', CONFIG.instagram, 'instagram'],
      ['Twitch', CONFIG.twitch, 'twitch'],
    ].filter(function (r) { return r[1]; });

    el.classList.add('nx-footer');
    el.innerHTML =
      '<div class="nx-wrap">' +
        '<div class="nx-footer-top">' +
          '<div class="nx-footer-marca">' +
            '<div class="nx-brand"><img src="' + url('/assets/logos/logoNP.ico') + '" alt="" width="28" height="28"><span>NEURA <span class="nx-outline">PROJECT</span></span></div>' +
            '<p>Estúdio independente de jogos e ferramentas para a comunidade competitiva. Feito no Brasil.</p>' +
            '<div class="nx-redes">' + redes.map(function (r) {
              return '<a href="' + r[1] + '" target="_blank" rel="noopener" title="' + r[0] + '" aria-label="' + r[0] + '">' +
                '<img src="' + url('/assets/redes%20social/' + r[2] + '.png') + '" alt=""></a>';
            }).join('') + '</div>' +
          '</div>' +
          '<div class="nx-footer-col"><span class="nx-mono">PROJETOS</span>' +
            MENU.slice(1).map(function (m) { return '<a href="' + url(m.href) + '">' + m.rotulo + '</a>'; }).join('') +
          '</div>' +
          '<div class="nx-footer-col"><span class="nx-mono">NEURA</span>' +
            '<a href="' + url('/#sobre') + '">Sobre</a>' +
            '<a href="' + url('/#projetos') + '">O que fazemos</a>' +
            '<a href="' + url('/times/') + '">Lista de times</a>' +
            (CONFIG.discord ? '<a href="' + CONFIG.discord + '" target="_blank" rel="noopener">Comunidade</a>' : '') +
          '</div>' +
        '</div>' +
        '<div class="nx-footer-legal">' +
          '<span>© ' + new Date().getFullYear() + ' Neura Project. Todos os direitos reservados.</span>' +
          '<span>Não afiliado à Valve Corporation. Counter-Strike é marca da Valve.</span>' +
        '</div>' +
      '</div>';
  }

  // Preenche os lugares que ainda estão vazios (pode ser chamado de novo: o NeuraPick chama depois de montar o React)
  function montar() {
    document.querySelectorAll('[data-site-nav]:not([data-montado])').forEach(function (el) {
      el.setAttribute('data-montado', '');
      montarMenu(el);
    });
    document.querySelectorAll('[data-site-footer]:not([data-montado])').forEach(function (el) {
      el.setAttribute('data-montado', '');
      montarRodape(el);
    });

    // Elementos com class="reveal" entram suavemente quando aparecem na tela
    var revelar = document.querySelectorAll('.reveal:not(.is-visible)');
    if (!('IntersectionObserver' in window)) {
      revelar.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          obs.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revelar.forEach(function (el) { obs.observe(el); });
  }

  // Lista de times: lê direto do GitHub (atualiza em minutos, sem esperar o deploy do site);
  // se não der, usa a cópia publicada no site. Sempre devolve uma lista (vazia se nada funcionar).
  var timesCache = null;
  function carregarTimes() {
    if (timesCache) return timesCache;
    var bruto = 'https://raw.githubusercontent.com/' + CONFIG.repositorio + '/' + CONFIG.branch + '/' + CONFIG.arquivoTimes;
    var ler = function (endereco) {
      return fetch(endereco + '?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      });
    };
    timesCache = ler(bruto)
      .catch(function () { return ler(url('/' + CONFIG.arquivoTimes)); })
      .then(function (dados) { return Array.isArray(dados && dados.times) ? dados.times : []; })
      .catch(function () { return []; });
    return timesCache;
  }

  window.NEURA = { config: CONFIG, url: url, montar: montar, carregarTimes: carregarTimes };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
