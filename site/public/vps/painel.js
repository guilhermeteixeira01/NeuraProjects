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
//   POST /api/iniciar    { validar }   POST /api/parar    POST /api/reiniciar { validar }
//   POST /api/comando    { cmd }

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const crypto = require('crypto');

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
};

if (!CFG.token) {
  console.error('Defina a variável PAINEL_TOKEN antes de iniciar o agente (openssl rand -hex 32).');
  process.exit(1);
}

const CS2_SH = path.join(CFG.cs2Dir, 'game', 'cs2.sh');
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

function log(texto) {
  const hora = new Date().toLocaleTimeString('pt-BR');
  for (const linha of String(texto).split(/\r?\n/)) {
    if (linha.trim()) logs.push(`[${hora}] ${linha}`);
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

// ===== Controle do servidor =====
async function iniciar(validar) {
  if (estado !== 'parado') throw new Error(`O servidor está ${estado}`);
  estado = 'atualizando';
  try {
    await rodarSteamcmd(validar);
  } catch (e) {
    log(`!! ${e.message}`);
    estado = 'parado';
    throw e;
  }

  log('>> Iniciando CS2...');
  pararSolicitado = false;
  proc = spawn(CS2_SH, CS2_ARGS, { cwd: path.dirname(CS2_SH), detached: true });
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
    const matar = sinal => { try { process.kill(-p.pid, sinal); } catch {} };

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
      iniciar(!!body.validar).catch(() => {});
      return json(res, 202, { ok: true });

    case '/api/parar':
      if (estado !== 'rodando') return json(res, 409, { erro: `O servidor está ${estado}` });
      parar();
      return json(res, 202, { ok: true });

    case '/api/reiniciar':
      if (estado === 'atualizando' || estado === 'parando')
        return json(res, 409, { erro: `O servidor está ${estado}` });
      (async () => { await parar(); await iniciar(!!body.validar); })().catch(() => {});
      return json(res, 202, { ok: true });

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
