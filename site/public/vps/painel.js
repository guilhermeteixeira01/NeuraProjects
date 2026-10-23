// Agente do servidor de CS2 (API para o painel do site; sem página própria)
// Não precisa de npm install: usa só módulos nativos do Node (versão 18+).
//
// Todas as chamadas exigem o header  Authorization: Bearer <PAINEL_TOKEN>
// Gere o token com:  openssl rand -hex 32
//
// Exemplo de unit do systemd (/etc/systemd/system/painel-cs2.service):
//
//   [Unit]
//   Description=Agente do servidor CS2
//   After=network-online.target
//   Wants=network-online.target
//
//   [Service]
//   User=steam
//   WorkingDirectory=/home/steam/painel
//   ExecStart=/usr/bin/node /home/steam/painel/painel.js
//   Environment=PAINEL_TOKEN=COLE_O_TOKEN_AQUI
//   Environment=PAINEL_HOST=127.0.0.1
//   Environment=PAINEL_PORTA=8080
//   Environment=STEAMCMD=/home/steam/steamcmd/steamcmd.sh
//   Environment=CS2_DIR=/home/steam/cs2-server
//   Environment=SV_PASSWORD=
//   Environment=AUTO_REINICIAR=1
//   Environment=INICIAR_AO_LIGAR=0
//   Restart=always
//   RestartSec=5
//   TimeoutStopSec=40
//
//   [Install]
//   WantedBy=multi-user.target
//
// Endpoints:
//   GET  /api/status[?desde=N]  -> { estado, total, desde, logs }  (só as linhas de índice >= N)
//   POST /api/iniciar    { validar, plugins }   POST /api/parar    POST /api/reiniciar { validar, plugins }
//   POST /api/comando    { cmd }
//   POST /api/plugins    baixa e instala o Metamod e o CounterStrikeSharp mais novos (com o servidor parado; backup dos addons antes)
//   POST /api/gameinfo   confere o gameinfo.gi e recoloca a linha do Metamod se a atualização do CS2 a apagou
//                        (isso também roda sozinho antes de cada início; a cópia original da Valve fica em gameinfo.gi.original-valve)

const http = require('http');
const { spawn, spawnSync, execFile } = require('child_process');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ===== Configuração (via variáveis de ambiente) =====
const CFG = {
  porta: Number(process.env.PAINEL_PORTA || 8080),
  host: process.env.PAINEL_HOST || '0.0.0.0', // atrás de Caddy/Nginx/Tunnel use 127.0.0.1
  token: process.env.PAINEL_TOKEN,
  steamcmd: process.env.STEAMCMD || '/home/steam/steamcmd/steamcmd.sh',
  cs2Dir: process.env.CS2_DIR || '/home/steam/cs2-server',
  svPassword: process.env.SV_PASSWORD || '',
  autoReiniciar: process.env.AUTO_REINICIAR !== '0',   // reinicia se o servidor cair
  iniciarAoLigar: process.env.INICIAR_AO_LIGAR === '1', // sobe o CS2 junto com o painel
  pty: process.env.CS2_PTY !== '0', // roda o CS2 num terminal de mentira (veja abaixo); CS2_PTY=0 desliga
};

if (!CFG.token) {
  console.error('Defina a variável PAINEL_TOKEN antes de iniciar o agente (openssl rand -hex 32).');
  process.exit(1);
}

const CS2_SH = path.join(CFG.cs2Dir, 'game', 'cs2.sh');
const GAMEINFO = path.join(CFG.cs2Dir, 'game', 'csgo', 'gameinfo.gi');
const PASTA_METAMOD = path.join(CFG.cs2Dir, 'game', 'csgo', 'addons', 'metamod');
const CS2_ARGS = [
  '-dedicated', '-usercon', '-port', '27015',
  '+game_type', '0', '+game_mode', '1', '+map', 'de_dust2',
];
if (CFG.svPassword) CS2_ARGS.push('+sv_password', CFG.svPassword);

// ===== Estado =====
let estado = 'parado'; // parado | atualizando | rodando | parando
let proc = null;
let pararSolicitado = false;
const logs = [];
let descartadas = 0; // linhas que já saíram do buffer: o índice global de logs[0] é "descartadas"

// O console do CS2 e o SteamCMD mandam códigos de terminal. As cores (ESC[...m) ficam, porque o painel do site as desenha;
// o resto (mover o cursor, apagar a linha, título da janela, controles soltos) é tirado, senão aparece como "�[0m" e quadradinhos.
function limparTerminal(s) {
  return s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-ln-~]/g, '')
    .replace(/\x1b[()][0-9A-Za-z]/g, '')
    .replace(/\x1b(?!\[[0-9;:]*m)/g, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f]/g, '');
}

function log(texto) {
  const hora = new Date().toLocaleTimeString('pt-BR');
  for (let linha of String(texto).split(/\r?\n/)) {
    // "\r": o programa reescreveu a mesma linha (barra de progresso do SteamCMD): vale só o último trecho
    if (linha.includes('\r')) linha = linha.split('\r').filter(Boolean).pop() || '';
    linha = limparTerminal(linha);
    if (linha.replace(/\x1b\[[0-9;:]*m/g, '').trim()) logs.push(`[${hora}] ${linha}`);
  }
  if (logs.length > 1000) {
    descartadas += logs.length - 1000;
    logs.splice(0, logs.length - 1000);
  }
}

// ===== SteamCMD =====
function rodarSteamcmd(validar) {
  return new Promise((resolve, reject) => {
    const args = ['+force_install_dir', CFG.cs2Dir, '+login', 'anonymous', '+app_update', '730'];
    if (validar) args.push('validate');
    args.push('+quit');

    log(`>> SteamCMD: ${validar ? 'atualizando e validando arquivos' : 'atualizando'}...`);
    let sucesso = false;
    const p = spawn(CFG.steamcmd, args);
    const ler = d => {
      const s = String(d);
      if (/Success! App '730'/.test(s)) sucesso = true;
      log(s);
    };
    p.stdout.on('data', ler);
    p.stderr.on('data', ler);
    p.on('error', reject);
    // O SteamCMD às vezes sai com código diferente de 0 mesmo tendo dado certo,
    // então também confiamos na mensagem "Success!".
    p.on('close', code => (sucesso || code === 0)
      ? resolve()
      : reject(new Error(`SteamCMD falhou (código ${code})`)));
  });
}

// ===== Metamod no gameinfo.gi =====
// Toda atualização do CS2 (SteamCMD) devolve o gameinfo.gi original da Valve, sem a linha que carrega o Metamod (e com ele o
// CounterStrikeSharp e os plugins). Esta função confere o arquivo e, se faltar, põe a linha "Game csgo/addons/metamod" logo acima
// de "Game csgo" (dentro de SearchPaths). É seguro rodar quantas vezes quiser: se a linha já está lá, não mexe em nada.
function garantirMetamod() {
  if (!fs.existsSync(GAMEINFO)) return { ok: false, alterado: false, mensagem: 'gameinfo.gi não encontrado em ' + GAMEINFO };
  if (!fs.existsSync(PASTA_METAMOD)) return { ok: false, alterado: false, mensagem: 'Pasta do Metamod não encontrada (' + PASTA_METAMOD + '): instale o Metamod primeiro' };
  const original = fs.readFileSync(GAMEINFO, 'utf8');
  if (/^\s*Game\s+csgo\/addons\/metamod\s*$/m.test(original)) return { ok: true, alterado: false, mensagem: 'gameinfo.gi já carrega o Metamod' };
  const m = /^([ \t]*)Game[ \t]+csgo[ \t]*$/m.exec(original);
  if (!m) return { ok: false, alterado: false, mensagem: 'Não achei a linha "Game csgo" no gameinfo.gi (formato novo?): não mexi no arquivo' };
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  const novo = original.slice(0, m.index) + m[1] + 'Game\tcsgo/addons/metamod' + eol + original.slice(m.index);
  const copia = GAMEINFO + '.original-valve'; // a primeira cópia (sem o Metamod) fica guardada, para voltar atrás se precisar
  if (!fs.existsSync(copia)) fs.copyFileSync(GAMEINFO, copia);
  fs.writeFileSync(GAMEINFO + '.tmp', novo);
  fs.renameSync(GAMEINFO + '.tmp', GAMEINFO);
  return { ok: true, alterado: true, mensagem: 'Linha do Metamod colocada no gameinfo.gi' };
}
function verificarMetamod() {
  try {
    const r = garantirMetamod();
    log((r.ok ? '>> ' : '!! ') + r.mensagem);
    return r;
  } catch (e) {
    log('!! gameinfo.gi: ' + e.message);
    return { ok: false, alterado: false, mensagem: e.message };
  }
}

// ===== Atualizar Metamod e CounterStrikeSharp =====
// Mesmo que o atualizar-cs2.sh: baixa o Metamod:Source mais novo (série 2.0) e a última release do CounterStrikeSharp no GitHub
// (versão com runtime), guarda um backup da pasta addons e troca só o que é dos dois (bin, api, dotnet, gamedata do CounterStrikeSharp
// e os arquivos do Metamod). Plugins, configs e gamedata próprio (ex.: basecomp.json) não são tocados. Só roda com o servidor parado.
const MM_BASE = 'https://mms.alliedmods.net/mmsdrop/2.0';
const URL_CSS = 'https://api.github.com/repos/roflmuffin/CounterStrikeSharp/releases/latest';
const PASTA_CSGO = path.join(CFG.cs2Dir, 'game', 'csgo');
const PASTA_ADDONS = path.join(PASTA_CSGO, 'addons');

const TAR = process.env.TAR || 'tar';

function rodar(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (erro, saida, err) => (erro ? reject(new Error(`${cmd}: ${String(err || erro.message).trim().slice(0, 300)}`)) : resolve(saida)));
  });
}

async function baixar(url, destino) {
  const r = await fetch(url, { headers: { 'User-Agent': 'neura-painel-cs2' }, redirect: 'follow', signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`Download falhou (${r.status}) em ${url}`);
  fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
}

async function atualizarPlugins(dentroDoInicio = false) {
  // dentroDoInicio: já está na fila de um início (estado "atualizando"); sozinho, só roda com o servidor parado
  if (!dentroDoInicio && estado !== 'parado') throw new Error(`O servidor está ${estado}: pare o servidor antes de atualizar os plugins`);
  if (!dentroDoInicio) estado = 'atualizando';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'np-plugins-'));
  try {
    log('>> Plugins: procurando as versões mais novas...');
    const mmArq = (await (await fetch(`${MM_BASE}/mmsource-latest-linux`, { signal: AbortSignal.timeout(30000) })).text()).trim();
    if (!/^mmsource-[\w.\-]+\.tar\.gz$/.test(mmArq)) throw new Error('Não consegui descobrir a versão do Metamod');
    const rel = await (await fetch(URL_CSS, { headers: { 'User-Agent': 'neura-painel-cs2', Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(30000) })).json();
    const ativo = (rel.assets || []).find((a) => /with-runtime.*linux/i.test(a.name));
    if (!ativo) throw new Error('Não achei o download do CounterStrikeSharp (limite da API do GitHub? tente mais tarde)');
    log(`>> Plugins: Metamod ${mmArq} e CounterStrikeSharp ${rel.tag_name}`);

    // baixa os dois antes de mexer em qualquer arquivo: se um download falhar, nada fica pela metade
    await baixar(`${MM_BASE}/${mmArq}`, path.join(tmp, 'metamod.tar.gz'));
    await baixar(ativo.browser_download_url, path.join(tmp, 'css.zip'));

    // backup dos addons (guarda os 5 últimos)
    if (fs.existsSync(PASTA_ADDONS)) {
      const pastaBk = path.join(os.homedir(), 'backups-cs2');
      fs.mkdirSync(pastaBk, { recursive: true });
      const nome = `addons-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.tar.gz`;
      await rodar(TAR, ['-czf', path.join(pastaBk, nome), '-C', PASTA_CSGO, 'addons']);
      const antigos = fs.readdirSync(pastaBk).filter((f) => /^addons-.*\.tar\.gz$/.test(f)).sort().reverse().slice(5);
      for (const f of antigos) fs.rmSync(path.join(pastaBk, f), { force: true });
      log(`>> Plugins: backup dos addons em ~/backups-cs2/${nome}`);
    }

    // Metamod (o metaplugins.ini, se você mexeu nele, é devolvido depois: o pacote traz um de exemplo)
    const iniMm = path.join(PASTA_ADDONS, 'metamod', 'metaplugins.ini');
    const iniAntigo = fs.existsSync(iniMm) ? fs.readFileSync(iniMm) : null;
    await rodar(TAR, ['-xzf', path.join(tmp, 'metamod.tar.gz'), '-C', PASTA_CSGO]);
    if (iniAntigo) fs.writeFileSync(iniMm, iniAntigo);
    verificarMetamod(); // põe a linha no gameinfo.gi, se faltar

    // CounterStrikeSharp: unzip, ou o python3 (que já vem na maioria das VPS)
    const pastaCss = path.join(tmp, 'css');
    fs.mkdirSync(pastaCss);
    try {
      await rodar('unzip', ['-q', path.join(tmp, 'css.zip'), '-d', pastaCss]);
    } catch (e) {
      if (!/ENOENT/.test(e.message)) throw e;
      await rodar('python3', ['-m', 'zipfile', '-e', path.join(tmp, 'css.zip'), pastaCss]);
    }
    const origem = path.join(pastaCss, 'addons', 'counterstrikesharp');
    const destino = path.join(PASTA_ADDONS, 'counterstrikesharp');
    fs.mkdirSync(destino, { recursive: true });
    for (const d of ['bin', 'api', 'dotnet', 'gamedata']) {
      if (fs.existsSync(path.join(origem, d))) fs.cpSync(path.join(origem, d), path.join(destino, d), { recursive: true, force: true });
    }
    // config nova só se ainda não existir (não sobrescreve a sua)
    if (fs.existsSync(path.join(origem, 'configs'))) fs.cpSync(path.join(origem, 'configs'), path.join(destino, 'configs'), { recursive: true, force: false, errorOnExist: false });
    // o arquivo que liga o CounterStrikeSharp ao Metamod
    const vdf = path.join(pastaCss, 'addons', 'metamod', 'counterstrikesharp.vdf');
    if (fs.existsSync(vdf)) {
      fs.mkdirSync(path.join(PASTA_ADDONS, 'metamod'), { recursive: true });
      fs.copyFileSync(vdf, path.join(PASTA_ADDONS, 'metamod', 'counterstrikesharp.vdf'));
    }
    log(`>> Plugins atualizados: Metamod ${mmArq} e CounterStrikeSharp ${rel.tag_name}. Os seus plugins e configs não foram tocados.`);
    return { ok: true, metamod: mmArq, counterstrikesharp: rel.tag_name };
  } catch (e) {
    log(`!! Plugins: ${e.message}`);
    throw e;
  } finally {
    if (!dentroDoInicio) estado = 'parado';
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ===== Console do CS2 em tempo real =====
// Com a saída ligada num "pipe" o CS2 junta as mensagens num bloco grande e só entrega quando enche ou quando fecha: o console do painel
// ficava parado e as respostas dos comandos (css_plugins list, status...) só apareciam no fim, todas juntas. Dentro de um terminal de
// mentira (pty, pelo programa "script" do Linux) o CS2 escreve linha por linha, na hora. Sem o "script" instalado, cai no modo antigo.
const temPty = process.platform === 'linux' && CFG.pty && !spawnSync('script', ['--version'], { stdio: 'ignore' }).error;
let usandoPty = false;
const aspas = (a) => "'" + String(a).replace(/'/g, "'\\''") + "'"; // aspas simples do shell; uma aspa simples dentro vira '\''

function lancarCs2() {
  usandoPty = temPty;
  const opcoes = { cwd: path.dirname(CS2_SH), detached: true };
  if (!temPty) return spawn(CS2_SH, CS2_ARGS, opcoes);
  log('>> Console em tempo real (terminal de mentira ligado)');
  const linha = [CS2_SH, ...CS2_ARGS].map(aspas).join(' ');
  // -q sem avisos, -e devolve o código de saída do CS2, -f grava a cada escrita; stty -echo para não repetir o que você digita
  return spawn('script', ['-qefc', 'stty -echo 2>/dev/null; exec ' + linha, '/dev/null'], opcoes);
}

// ===== Controle do servidor =====
async function iniciar(validar, plugins) {
  if (estado !== 'parado') throw new Error(`O servidor está ${estado}`);
  estado = 'atualizando';
  try {
    await rodarSteamcmd(validar);
  } catch (e) {
    log(`!! ${e.message}`);
    estado = 'parado';
    throw e;
  }
  if (plugins) {
    try {
      await atualizarPlugins(true);
    } catch {
      // o motivo já está no console; o servidor sobe com os plugins que já estavam instalados
    }
  }

  verificarMetamod(); // a atualização pode ter apagado a linha do Metamod
  log('>> Iniciando CS2...');
  pararSolicitado = false;
  proc = lancarCs2();
  estado = 'rodando';

  proc.stdout.on('data', log);
  proc.stderr.on('data', log);
  proc.on('error', e => log(`!! ${e.message}`));
  proc.on('close', code => {
    log(`>> CS2 encerrou (código ${code})`);
    proc = null;
    estado = 'parado';
    if (!pararSolicitado && CFG.autoReiniciar) {
      log('>> Queda inesperada. Reiniciando em 10s...');
      setTimeout(() => iniciar(false).catch(() => {}), 10000);
    }
  });
}

function parar() {
  return new Promise(resolve => {
    if (!proc) return resolve();
    pararSolicitado = true;
    estado = 'parando';
    const p = proc;
    const matar = sinal => {
      try { process.kill(-p.pid, sinal); } catch {}
      // no terminal de mentira o CS2 fica numa sessão própria, fora do grupo do "script": encerra ele também
      if (usandoPty) execFile('pkill', ['-' + sinal.replace('SIG', ''), '-f', path.join(CFG.cs2Dir, 'game', 'bin', 'linuxsteamrt64', 'cs2')], () => {});
    };

    const t1 = setTimeout(() => { log('>> Enviando SIGTERM...'); matar('SIGTERM'); }, 15000);
    const t2 = setTimeout(() => { log('>> Forçando encerramento...'); matar('SIGKILL'); }, 25000);
    p.once('close', () => { clearTimeout(t1); clearTimeout(t2); resolve(); });

    log('>> Enviando "quit" ao servidor...');
    try { p.stdin.write('quit\n'); } catch {}
  });
}

function enviarComando(cmd) {
  if (!proc || estado !== 'rodando') throw new Error('Servidor não está rodando');
  log(`> ${cmd}`);
  proc.stdin.write(cmd + '\n');
}

// ===== HTTP =====
function autorizado(req) {
  const [tipo, valor] = (req.headers.authorization || '').split(' ');
  if (tipo !== 'Bearer' || !valor) return false;
  const esperado = Buffer.from(CFG.token);
  const recebido = Buffer.from(valor);
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}

function lerJson(req) {
  return new Promise(resolve => {
    let corpo = '';
    req.on('data', c => { corpo += c; if (corpo.length > 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(corpo || '{}')); } catch { resolve({}); } });
  });
}

function json(res, status, dados) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(dados));
}

const servidor = http.createServer(async (req, res) => {
  if (!autorizado(req)) {
    return json(res, 401, { erro: 'Não autorizado' });
  }

  const [url, consulta = ''] = req.url.split('?');

  if (req.method === 'GET' && url === '/api/status') {
    // ?desde=N: só as linhas de índice global >= N (o índice continua certo mesmo quando o buffer descarta as antigas)
    const total = descartadas + logs.length;
    const pedido = Number.parseInt(new URLSearchParams(consulta).get('desde'), 10);
    const desde = Number.isFinite(pedido) && pedido >= 0 ? Math.min(Math.max(pedido, descartadas), total) : descartadas;
    return json(res, 200, { estado, total, desde, logs: logs.slice(desde - descartadas) });
  }

  if (req.method !== 'POST') return json(res, 404, { erro: 'Não encontrado' });
  const body = await lerJson(req);

  switch (url) {
    case '/api/iniciar':
      if (estado !== 'parado') return json(res, 409, { erro: `O servidor está ${estado}` });
      iniciar(!!body.validar, !!body.plugins).catch(() => {});
      return json(res, 202, { ok: true });

    case '/api/parar':
      if (estado !== 'rodando') return json(res, 409, { erro: `O servidor está ${estado}` });
      parar();
      return json(res, 202, { ok: true });

    case '/api/reiniciar':
      if (estado === 'atualizando' || estado === 'parando')
        return json(res, 409, { erro: `O servidor está ${estado}` });
      (async () => { await parar(); await iniciar(!!body.validar, !!body.plugins); })().catch(() => {});
      return json(res, 202, { ok: true });

    case '/api/plugins':
      if (estado !== 'parado') return json(res, 409, { erro: estado === 'rodando' ? 'Pare o servidor antes de atualizar os plugins' : `O servidor está ${estado}` });
      atualizarPlugins().catch(() => {});
      return json(res, 202, { ok: true });

    case '/api/gameinfo': {
      if (estado === 'atualizando') return json(res, 409, { erro: 'O servidor está atualizando' });
      const r = verificarMetamod();
      return json(res, r.ok ? 200 : 409, r.ok ? r : { erro: r.mensagem });
    }

    case '/api/comando':
      try {
        const cmd = String(body.cmd || '').trim();
        if (!cmd) return json(res, 400, { erro: 'Comando vazio' });
        enviarComando(cmd);
        return json(res, 200, { ok: true });
      } catch (e) {
        return json(res, 409, { erro: e.message });
      }

    default:
      return json(res, 404, { erro: 'Não encontrado' });
  }
});

servidor.listen(CFG.porta, CFG.host, () => {
  console.log(`Agente rodando em ${CFG.host}:${CFG.porta}`);
  if (CFG.iniciarAoLigar) iniciar(false).catch(() => {});
});

// Ao desligar o painel (ex.: systemctl stop), fecha o CS2 direitinho
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, async () => { await parar(); process.exit(0); });
}
