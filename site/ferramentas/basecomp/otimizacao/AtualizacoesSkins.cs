using System.Runtime.InteropServices;

namespace BaseComp;

// Uma operação por chamada (tick). Uma nova revisão substitui o trabalho antigo
// da mesma chave, em vez de acumular aplicações que já ficaram obsoletas.
public sealed class FilaSkinsPorFrame
{
    private readonly Queue<string> _ordem = new();
    private readonly Dictionary<string, Action> _pendentes = new();
    public int Pendentes => _pendentes.Count;
    public void Agendar(string chave, Action acao)
    {
        if (!_pendentes.ContainsKey(chave)) _ordem.Enqueue(chave);
        _pendentes[chave] = acao;
    }
    public bool ExecutarUma()
    {
        while (_ordem.TryDequeue(out var chave))
            if (_pendentes.Remove(chave, out var acao)) { acao(); return true; }
        return false;
    }
    public void Limpar() { _pendentes.Clear(); _ordem.Clear(); }
}

// Só possui blocos alocados pelo próprio plugin. Nunca libera o retorno original
// do jogo. O hook é removido antes da limpeza global; na desconexão, o jogador
// já saiu do cache de skins antes de remover os blocos dele.
public sealed class MemoriaPainelSkins(Action<nint>? liberar = null)
{
    private readonly HashSet<nint> _blocos = new();
    private readonly Action<nint> _liberar = liberar ?? Marshal.FreeHGlobal;
    public int Quantidade => _blocos.Count;
    public void Registrar(nint ponteiro)
    {
        if (ponteiro == nint.Zero || !_blocos.Add(ponteiro))
            throw new InvalidOperationException("Bloco de memória inválido ou já registrado.");
    }
    public bool Liberar(nint ponteiro)
    {
        if (!_blocos.Remove(ponteiro)) return false;
        _liberar(ponteiro); return true;
    }
    public void LiberarTodos() { foreach (var p in _blocos.ToArray()) Liberar(p); }
}
