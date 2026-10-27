using System.Runtime.InteropServices;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Memory;
using CounterStrikeSharp.API.Modules.Memory.DynamicFunctions;
using CounterStrikeSharp.API.Modules.Utils;
using Microsoft.Extensions.Logging;

namespace BaseComp;

// Skins no painel de equipamento do jogo (o que o espectador vê ao observar um jogador, e a inspeção com F).
// Esse painel monta a lista de armas pelo INVENTÁRIO do jogador que o servidor conhece (CCSPlayerInventory), e não pelas armas da mão. Por isso, só
// pintar a arma (Skins.cs) não aparece nele. Aqui o plugin responde por conta própria à pergunta "qual item o jogador tem neste espaço do loadout?"
// (CCSPlayerInventory::GetItemInLoadout) com um item econômico montado com a skin, os adesivos, o chaveiro e o StatTrak escolhidos no site, e avisa
// os clientes que o inventário mudou (SendInventoryUpdateEvent). A técnica (e as assinaturas do jogo, em gamedata/basecomp.json) vêm do plugin
// Inventory Simulator (Ian Lucas, MIT). Se a Valve atualizar o jogo e as assinaturas quebrarem, o plugin só registra o aviso e segue sem o painel.
// Desligue com Skins.PainelDoEspectador = false no BaseComp.json. Não use junto com o plugin InventorySimulator (os dois responderiam à mesma pergunta).
public partial class BaseComp
{
    private MemoryFunctionWithReturn<nint, int, int, nint>? _getItemNoLoadout;
    private MemoryFunctionWithReturn<nint, nint>? _enviarAtualizacaoInventario;
    private MemoryFunctionWithReturn<nint, nint>? _econItemConstrutor;
    private MemoryFunctionWithReturn<nint, nint, nint>? _econItemCopiar;
    private int _offSoCache;
    private int _offDonoDoCache;
    private int _offInventarioDoServico;
    private bool _painelInventarioOk;

    // (SteamID, time, espaço do loadout) -> item econômico que o plugin montou (e a "impressão" do que ele tinha, para só refazer se mudou)
    private readonly Dictionary<(ulong Steam, int Time, int Slot), (nint Ptr, ushort Def, string Revisao)> _itensDoPainel = [];
    private readonly MemoriaPainelSkins _memoriaPainel = new();
    private ulong _proximoIdDoPainel = 65155030971;

    private void InstalarPainelInventario()
    {
        if (!Config.Skins.PainelDoEspectador)
        {
            Logger.LogInformation("Skins: painel do espectador desligado (Skins.PainelDoEspectador = false).");
            return;
        }

        try
        {
            _getItemNoLoadout = new(GameData.GetSignature("BaseComp_CCSPlayerInventory_GetItemInLoadout"));
            _enviarAtualizacaoInventario = new(GameData.GetSignature("BaseComp_CCSPlayerInventory_SendInventoryUpdateEvent"));
            _econItemConstrutor = new(GameData.GetSignature("BaseComp_CEconItemView_Constructor"));
            _econItemCopiar = new(GameData.GetSignature("BaseComp_CEconItemView_OperatorEquals"));
            _offSoCache = GameData.GetOffset("BaseComp_CCSPlayerInventory_m_pSOCache");
            _offDonoDoCache = GameData.GetOffset("BaseComp_CGCClientSharedObjectCache_m_Owner");
            _offInventarioDoServico = GameData.GetOffset("BaseComp_CCSPlayerController_InventoryServices_m_pInventory");
            _getItemNoLoadout.Hook(AoPerguntarItemDoLoadout, HookMode.Post);
            _painelInventarioOk = true;
            Logger.LogInformation("Skins: painel de equipamento do espectador ligado (assinaturas ok).");
        }
        catch (Exception e)
        {
            _painelInventarioOk = false;
            Logger.LogError("Skins: assinaturas do painel do espectador não encontradas ({Erro}). Atualize gamedata/basecomp.json. As skins nas armas continuam funcionando.", e.Message);
        }
    }

    // Chamado pelo Unload (Demo.cs): solta o hook, senão recarregar o plugin deixaria o jogo chamando código que já não existe
    private void DesinstalarPainelInventario()
    {
        var hookRemovido = !_painelInventarioOk;
        try
        {
            if (_painelInventarioOk)
                _getItemNoLoadout?.Unhook(AoPerguntarItemDoLoadout, HookMode.Post);
            hookRemovido = true;
        }
        catch (Exception e)
        {
            Logger.LogError("Skins: não foi possível remover o hook do inventário; memória preservada por segurança: {Erro}", e.Message);
        }
        _painelInventarioOk = false;
        _skinsEncerradas = true;
        _cancelarSkins.Cancel();
        _filaSkins.Limpar();
        if (hookRemovido) LimparMemoriaDoPainel();
    }

    // Mesmo ciclo usado pelo Inventory Simulator (fonte de referência):
    // https://github.com/ianlucas/cs2-css-inventory-simulator/blob/main/source/InventorySimulator/Models/CCSPlayerControllerState.cs
    private void LimparMemoriaDoPainel(ulong? steam = null)
    {
        foreach (var chave in _itensDoPainel.Keys.Where(k => steam is null || k.Steam == steam.Value).ToArray())
            if (_itensDoPainel.Remove(chave, out var item)) _memoriaPainel.Liberar(item.Ptr);
        if (steam is null) _memoriaPainel.LiberarTodos();
    }

    private HookResult AoPerguntarItemDoLoadout(DynamicHook hook)
    {
        try
        {
            if (!_painelInventarioOk || _skins.Count == 0)
                return HookResult.Continue;

            var inventario = hook.GetParam<nint>(0);
            var time = hook.GetParam<int>(1);
            var slot = hook.GetParam<int>(2);
            var lado = time == (int)CsTeam.CounterTerrorist ? "ct" : time == (int)CsTeam.Terrorist ? "tr" : null;
            if (inventario == nint.Zero || lado is null)
                return HookResult.Continue;

            var ehFaca = slot == (int)loadout_slot_t.LOADOUT_SLOT_MELEE;
            var ehLuva = slot == (int)loadout_slot_t.LOADOUT_SLOT_CLOTHING_HANDS;
            var ehArma = slot >= (int)loadout_slot_t.LOADOUT_SLOT_FIRST_WHEEL_WEAPON && slot <= (int)loadout_slot_t.LOADOUT_SLOT_LAST_WHEEL_WEAPON;
            if (!ehFaca && !ehLuva && !ehArma)
                return HookResult.Continue;

            var steam = SteamDoInventario(inventario);
            if (steam == 0 || !_skins.TryGetValue(steam, out var inv))
                return HookResult.Continue;

            var padrao = hook.GetReturn<nint>(); // o item "de fábrica" que o jogo devolveria para este espaço
            SkinArma? skin;
            ushort def;
            if (ehFaca)
            {
                if (!inv.Facas.TryGetValue(lado, out skin) || skin.D == 0)
                    return HookResult.Continue;
                def = (ushort)skin.D;
            }
            else if (ehLuva)
            {
                if (!inv.Luvas.TryGetValue(lado, out skin) || skin.D == 0 || skin.P <= 0)
                    return HookResult.Continue;
                def = (ushort)skin.D;
            }
            else
            {
                if (padrao == nint.Zero)
                    return HookResult.Continue;
                def = new CEconItemView(padrao).ItemDefinitionIndex;
                if (!inv.Armas.TryGetValue(lado, out var doTime) || !doTime.TryGetValue(def.ToString(), out skin) || skin.P <= 0)
                    return HookResult.Continue;
            }

            var item = ItemDoPainel(steam, time, slot, skin, ehFaca, ehLuva, def, padrao);
            if (item == nint.Zero)
                return HookResult.Continue;
            hook.SetReturn(item);
            return HookResult.Changed;
        }
        catch (Exception e)
        {
            Logger.LogWarning("Skins: erro no painel do espectador ({Erro}).", e.Message);
            return HookResult.Continue;
        }
    }

    private ulong SteamDoInventario(nint inventario)
    {
        var cache = Marshal.ReadIntPtr(inventario + _offSoCache);
        return cache == nint.Zero ? 0 : (ulong)Marshal.ReadInt64(cache + _offDonoDoCache);
    }

    private nint ItemDoPainel(ulong steam, int time, int slot, SkinArma skin, bool ehFaca, bool ehLuva, ushort def, nint padrao)
    {
        if (_econItemConstrutor is null || _econItemCopiar is null)
            return nint.Zero;

        var chave = (steam, time, slot);
        // Reutiliza a referencia do JSON; nao concatena o inventario em cada consulta nativa.
        var revisao = Revisao(_skins.GetValueOrDefault(steam), $"{(time == (int)CsTeam.CounterTerrorist ? "ct" : "tr")}:{(ehFaca ? "faca" : ehLuva ? "luva" : $"arma:{def}")}");
        var existe = _itensDoPainel.TryGetValue(chave, out var guardado);
        if (existe && guardado.Def == def && guardado.Revisao == revisao)
            return guardado.Ptr;

        var ptr = guardado.Ptr;
        if (!existe)
        {
            ptr = Marshal.AllocHGlobal(Schema.GetClassSize("CEconItemView"));
            _memoriaPainel.Registrar(ptr);
            try
            {
                _econItemConstrutor.Invoke(ptr);
                if (padrao != nint.Zero) _econItemCopiar.Invoke(ptr, padrao);
            }
            catch { _memoriaPainel.Liberar(ptr); throw; }
            _itensDoPainel[chave] = (ptr, def, "!incompleto");
        }

        var item = new CEconItemView(ptr);
        item.Initialized = true;
        item.ItemDefinitionIndex = def;
        var id = _proximoIdDoPainel++;
        item.ItemID = id;
        item.ItemIDLow = (uint)(id & 0xFFFFFFFF);
        item.ItemIDHigh = (uint)(id >> 32);
        item.AccountID = (uint)(steam & 0xFFFFFFFF);
        item.EntityQuality = ehFaca ? 3 : skin.St == 1 ? 9 : 4;
        item.CustomName = ehLuva ? "" : skin.N ?? "";
        item.NetworkedDynamicAttributes.Attributes.RemoveAll();
        item.AttributeList.Attributes.RemoveAll();

        if (skin.P > 0)
        {
            DefinirNasListas(item, "set item texture prefab", skin.P);
            DefinirNasListas(item, "set item texture seed", skin is { P: 38, S: 0 } ? 0 : skin.S);
            DefinirNasListas(item, "set item texture wear", Math.Clamp(skin.F, 0.0001f, 1f));
        }

        if (!ehLuva && skin.St == 1)
        {
            DefinirNasListas(item, "kill eater", ComoFloat(0));
            DefinirNasListas(item, "kill eater score type", 0);
        }

        if (!ehFaca && !ehLuva && skin.K is { I: > 0 } ch)
        {
            DefinirNasListas(item, "keychain slot 0 id", ComoFloat((uint)ch.I));
            if (ch.X is { } kx) DefinirNasListas(item, "keychain slot 0 offset x", kx);
            if (ch.Y is { } ky) DefinirNasListas(item, "keychain slot 0 offset y", ky);
            if (ch.Z is { } kz) DefinirNasListas(item, "keychain slot 0 offset z", kz);
            DefinirNasListas(item, "keychain slot 0 seed", ComoFloat((uint)ch.S));
        }

        if (!ehFaca && !ehLuva)
            for (var i = 0; i < Math.Min(5, skin.A.Count); i++)
            {
                if (skin.A[i] is not { I: > 0 } ad)
                    continue;
                DefinirNasListas(item, $"sticker slot {i} id", ComoFloat((uint)ad.I));
                DefinirNasListas(item, $"sticker slot {i} wear", Math.Clamp(ad.W, 0f, 1f));
                DefinirNasListas(item, $"sticker slot {i} scale", 1);
                DefinirNasListas(item, $"sticker slot {i} rotation", ad.R);
                DefinirNasListas(item, $"sticker slot {i} schema", ComoFloat((uint)ad.S));
                if (ad.X is { } ox) DefinirNasListas(item, $"sticker slot {i} offset x", ox);
                if (ad.Y is { } oy) DefinirNasListas(item, $"sticker slot {i} offset y", oy);
            }

        _itensDoPainel[chave] = (ptr, def, revisao);
        return ptr;
    }

    // Avisa os clientes (incluindo quem está observando) que o inventário do jogador mudou: o painel refaz a lista
    private void AtualizarPainelDoJogador(CCSPlayerController player)
    {
        if (!_painelInventarioOk || _enviarAtualizacaoInventario is null || player is not { IsValid: true, IsBot: false })
            return;
        try
        {
            if (player.InventoryServices is not { } servico)
                return;
            var inventario = servico.Handle + _offInventarioDoServico;
            if (Marshal.ReadIntPtr(inventario + _offSoCache) == nint.Zero)
                return;
            _enviarAtualizacaoInventario.Invoke(inventario);
        }
        catch (Exception e)
        {
            Logger.LogWarning("Skins: não consegui atualizar o painel de {Nome} ({Erro}).", player.PlayerName, e.Message);
        }
    }
}
