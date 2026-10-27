"""Integra o coletor sem substituir outros sistemas ou configurações do BaseComp.
Uso: python integrar-missoes.py CAMINHO_DO_BASECOMP PASTA_DE_BACKUP
"""
from pathlib import Path
import sys
import zipfile
from datetime import datetime

origem = Path(sys.argv[1]).resolve()
backup = Path(sys.argv[2]).resolve()
backup.mkdir(parents=True, exist_ok=True)
alterados = {}

def editar(nome, mudancas):
    p = origem / nome
    texto = p.read_text(encoding='utf-8-sig')
    for antes, depois, marcador in mudancas:
        if marcador in texto:
            continue
        if texto.count(antes) != 1:
            raise RuntimeError(f'{nome}: âncora ambígua ou ausente: {antes[:70]}')
        texto = texto.replace(antes, depois, 1)
    alterados[nome] = texto

editar('BaseComp.cs', [('ModuleVersion => "1.8.2"','ModuleVersion => "1.9.0"','ModuleVersion => "1.9.0"')])
editar('BaseCompConfig.cs', [('public class BaseCompConfig : BasePluginConfig\n{', 'public class BaseCompConfig : BasePluginConfig\n{\n    [JsonPropertyName("MissoesModo")] public string MissoesModo { get; set; } = "auto";\n    [JsonPropertyName("MissoesTreino")] public bool MissoesTreino { get; set; } = false;', 'public string MissoesModo')])
editar('Relatorio.cs', [
    ('    }\n\n    private HookResult OnRoundStartRelatorio', '        CarregarMissoes();\n    }\n\n    private HookResult OnRoundStartRelatorio', '        CarregarMissoes();'),
    ('        _estat.Clear();', '        _estat.Clear();\n        ZerarMissoes();', '        ZerarMissoes();'),
])
editar('RelatorioPagina.cs', [
    ('return new PartidaDados\n        {', 'return new PartidaDados\n        {\n            Missoes = DadosDeMissoes(),', 'Missoes = DadosDeMissoes(),'),
    ('                    SteamId = e.SteamId.ToString(),', '                    SteamId = e.SteamId.ToString(),\n                    Missoes = DadosDeMissoes(e.SteamId),', 'Missoes = DadosDeMissoes(e.SteamId),'),
    ('public class PartidaDados\n{', 'public class PartidaDados\n{\n    [JsonPropertyName("missoes")] public DadosMissoesPartida? Missoes { get; set; }', 'public DadosMissoesPartida? Missoes'),
    ('public class JogadorDados\n{', 'public class JogadorDados\n{\n    [JsonPropertyName("missoes")] public DadosMissoesJogador? Missoes { get; set; }', 'public DadosMissoesJogador? Missoes'),
])
alterados['Missoes.cs'] = Path(__file__).with_name('Missoes.cs').read_text(encoding='utf-8-sig')
pacote = backup / ('BaseComp-antes-missoes-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.zip')
with zipfile.ZipFile(pacote, 'w', zipfile.ZIP_DEFLATED) as z:
    for nome in alterados:
        p = origem / nome
        if p.exists():
            z.write(p, nome)
for nome, texto in alterados.items():
    (origem / nome).write_text(texto, encoding='utf-8', newline='\r\n')
print(f'Integração concluída: {len(alterados)} arquivos. Backup: {pacote}')
