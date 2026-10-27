"""Uso: python aplicar.py CAMINHO_BASECOMP PASTA_BACKUP. Valida tudo antes de gravar."""
from pathlib import Path
import sys
import json
import hashlib
import zipfile
from datetime import datetime

fonte = Path(__file__).resolve().parent
destino = Path(sys.argv[1]).resolve()
backup = Path(sys.argv[2]).resolve()
manifesto = json.loads((fonte / 'manifesto.json').read_text(encoding='utf-8'))
hash_texto = lambda texto: hashlib.sha256(texto.encode('utf-8')).hexdigest()
mudancas = {}
for nome, hashes in manifesto.items():
    arquivo = destino / nome
    atual = arquivo.read_text(encoding='utf-8-sig') if arquivo.exists() else None
    hash_atual = hash_texto(atual) if atual is not None else None
    if hash_atual == hashes['depois']:
        continue
    if hash_atual != hashes['antes']:
        raise RuntimeError(f'{nome}: há mudanças locais diferentes da versão revisada; nenhuma alteração foi gravada.')
    novo = (atual.replace('ModuleVersion => "1.9.0"', 'ModuleVersion => "1.9.1"') if nome == 'BaseComp.cs'
            else (fonte / nome).read_text(encoding='utf-8-sig'))
    if hash_texto(novo) != hashes['depois']:
        raise RuntimeError(f'{nome}: fonte não corresponde ao manifesto; nenhuma alteração foi gravada.')
    mudancas[nome] = novo
if not mudancas:
    print('BaseComp 1.9.1 já integrado. Nenhum arquivo foi alterado.')
    sys.exit(0)
backup.mkdir(parents=True, exist_ok=True)
pacote = backup / ('BaseComp-antes-skins-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.zip')
with zipfile.ZipFile(pacote, 'w', zipfile.ZIP_DEFLATED) as z:
    for nome in mudancas:
        p = destino / nome
        if p.exists(): z.write(p, nome)
for nome, texto in mudancas.items():
    (destino / nome).write_text(texto, encoding='utf-8', newline='\r\n')
print(f'BaseComp 1.9.1: {len(mudancas)} arquivos integrados. Backup: {pacote}')
