/*
 * Ranking dos jogadores: soma as estatísticas de TODAS as partidas registradas e gera ranking.json.
 * Roda no deploy (depois de copiar partidas/ para _site/), então cada partida nova que o plugin envia
 * já atualiza o ranking. Lê a tabela "Estatísticas dos jogadores" da página de cada partida.
 *
 * Uso: node .github/scripts/ranking.js <pasta das partidas> <arquivo de saída>
 */
const fs = require("fs");
const path = require("path");

const [pasta = "partidas", saida = "ranking/ranking.json"] = process.argv.slice(2);
const ULTIMOS = 5; // forma recente: últimos mapas de cada jogador

const decodificar = (s) => String(s)
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const texto = (html) => decodificar(html.replace(/<[^>]*>/g, "")).trim();
const num = (s) => parseFloat(String(s).replace(",", ".")) || 0;

const arquivoLista = path.join(pasta, "partidas.json");
const lista = fs.existsSync(arquivoLista) ? JSON.parse(fs.readFileSync(arquivoLista, "utf8")) : [];
const jogadores = new Map();
let mapasLidos = 0;

// Mais antiga primeiro: nome, avatar e time de cada jogador ficam os da partida mais recente
for (const p of [...lista].sort((a, b) => String(a.data).localeCompare(String(b.data)))) {
  const arquivo = path.join(pasta, p.caminho || p.nome, "index.html");
  if (!fs.existsSync(arquivo)) continue;
  const html = fs.readFileSync(arquivo, "utf8");
  const rounds = Math.max(1, (Number(p.placarA) || 0) + (Number(p.placarB) || 0));
  let leu = false;

  // Um bloco por time: <div class="team-card team-A"> ... <tbody> linhas </tbody>
  const times = html.matchAll(/<div class="team-card team-([AB])">([\s\S]*?)<\/tbody>/g);
  for (const [, letra, bloco] of times) {
    const venceu = /class="team-score win"/.test(bloco);
    const nomeTime = texto((/<span class="team-name[^"]*">([\s\S]*?)<\/span>/.exec(bloco) || [])[1] || (letra === "A" ? p.timeA : p.timeB));
    const logoTime = nomeTime === p.timeA ? p.logoA : nomeTime === p.timeB ? p.logoB : letra === "A" ? p.logoA : p.logoB;

    for (const [, linha] of bloco.matchAll(/<tr style="[^"]*">([\s\S]*?)<\/tr>/g)) {
      const celulas = [...linha.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      if (celulas.length < 18) continue;
      const steamId = (/profiles\/(\d+)/.exec(celulas[0]) || [])[1];
      if (!steamId || steamId === "0") continue; // bots não entram no ranking
      const nome = texto((/<span>([\s\S]*?)<\/span><\/a>/.exec(celulas[0]) || [])[1] || "");
      const avatar = (/<img[^>]*src="([^"]+)"/.exec(celulas[0]) || [])[1] || "";
      const [fk, fd] = texto(celulas[12]).split("-").map(num);
      const rating = num(texto(celulas[1]));

      const j = jogadores.get(steamId) || {
        steamId, nome: "", avatar: "", time: "", logoTime: "",
        mapas: 0, vitorias: 0, rounds: 0, kills: 0, mortes: 0, assist: 0, hs: 0, dano: 0, kastRounds: 0,
        fk: 0, fd: 0, k5: 0, k4: 0, k3: 0, k2: 0, mvps: 0, mvpPartida: 0, ratingSoma: 0, melhorRating: 0, ultimos: [],
      };
      j.nome = nome || j.nome;
      j.avatar = avatar || j.avatar;
      j.time = nomeTime || j.time;
      j.logoTime = logoTime || "";
      j.mapas++;
      j.vitorias += venceu ? 1 : 0;
      j.rounds += rounds;
      j.kills += num(texto(celulas[2]));
      j.mortes += num(texto(celulas[3]));
      j.assist += num(texto(celulas[4]));
      j.dano += num(texto(celulas[6])) * rounds; // ADR da página = dano / rounds do mapa
      j.hs += num(texto(celulas[9]));
      j.kastRounds += (num(texto(celulas[11])) / 100) * rounds;
      j.fk += fk || 0;
      j.fd += fd || 0;
      j.k5 += num(texto(celulas[13]));
      j.k4 += num(texto(celulas[14]));
      j.k3 += num(texto(celulas[15]));
      j.k2 += num(texto(celulas[16]));
      j.mvps += num(texto(celulas[17]));
      j.mvpPartida += /class="estrela"/.test(celulas[1]) ? 1 : 0;
      j.ratingSoma += rating * rounds;
      j.melhorRating = Math.max(j.melhorRating, rating);
      j.ultimos.push({ rating, venceu, mapa: String(p.mapa || "").replace(/^de_/, ""), data: p.data, caminho: p.caminho || p.nome });
      if (j.ultimos.length > ULTIMOS) j.ultimos.shift();
      jogadores.set(steamId, j);
      leu = true;
    }
  }
  if (leu) mapasLidos++;
}

const arred = (v, casas = 2) => Math.round(v * 10 ** casas) / 10 ** casas;
const ranking = [...jogadores.values()].map((j) => ({
  steamId: j.steamId,
  nome: j.nome,
  avatar: j.avatar,
  time: j.time,
  logoTime: j.logoTime,
  mapas: j.mapas,
  vitorias: j.vitorias,
  rounds: j.rounds,
  kills: j.kills,
  mortes: j.mortes,
  assist: j.assist,
  fk: j.fk,
  fd: j.fd,
  multi: { k5: j.k5, k4: j.k4, k3: j.k3, k2: j.k2 },
  mvps: j.mvps,
  mvpPartida: j.mvpPartida,
  rating: arred(j.ratingSoma / j.rounds),
  melhorRating: arred(j.melhorRating),
  adr: arred(j.dano / j.rounds, 1),
  kast: arred((100 * j.kastRounds) / j.rounds, 1),
  hsPct: arred(j.kills ? (100 * j.hs) / j.kills : 0, 1),
  kd: arred(j.mortes ? j.kills / j.mortes : j.kills),
  kr: arred(j.kills / j.rounds),
  winRate: arred((100 * j.vitorias) / j.mapas, 1),
  ultimos: j.ultimos.reverse(), // mais recente primeiro
})).sort((a, b) => b.rating - a.rating || b.kills - a.kills);

fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, JSON.stringify({
  atualizado: new Date().toISOString(),
  partidas: mapasLidos,
  jogadores: ranking,
}, null, 2));
console.log(`Ranking: ${ranking.length} jogador(es) em ${mapasLidos} mapa(s) -> ${saida}`);
