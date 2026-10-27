using System.Text.Json;
using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Entities;
using CounterStrikeSharp.API.Modules.Memory;
using CounterStrikeSharp.API.Modules.Memory.DynamicFunctions;
using CounterStrikeSharp.API.Modules.Timers;
using CounterStrikeSharp.API.Modules.Utils;
using Microsoft.Extensions.Logging;

namespace BaseComp;

// Skins escolhidas no site (neuraproject.com.br/inventario/): armas, facas, luvas, agentes e adesivos.
// O plugin pergunta ao worker (POST /servidor/skins, mesmo Url/Token do FilaSite) o inventário de quem está no servidor
// e aplica nas armas (ao nascer / ao entrar), nas luvas e no agente. Mudança no site vale no próximo round.
// A técnica (atributos econômicos da arma + modelo/bodygroup) é a mesma dos plugins de skin do CS2. Ela precisa de uma
// assinatura do jogo (gamedata/basecomp.json em csgo/addons/counterstrikesharp/gamedata/): se a Valve atualizar o jogo e as skins
// pararem de aparecer, é essa assinatura que precisa ser atualizada (o log avisa "Skins: assinatura...").
public partial class BaseComp
{
    private sealed class SkinArma
    {
        [JsonPropertyName("p")] public int P { get; set; }
        [JsonPropertyName("f")] public float F { get; set; }
        [JsonPropertyName("s")] public int S { get; set; }
        [JsonPropertyName("st")] public int St { get; set; }
        [JsonPropertyName("a")] public List<SkinAdesivo?> A { get; set; } = [];
        [JsonPropertyName("n")] public string N { get; set; } = "";
        [JsonPropertyName("k")] public SkinChaveiro? K { get; set; }
        [JsonPropertyName("l")] public int L { get; set; }
        [JsonPropertyName("d")] public int D { get; set; } // só faca/luva: defIndex
    }

    // Adesivo num dos 5 espaços da arma: id, posição (-1..1), rotação (graus) e desgaste (0..1)
    private sealed class SkinAdesivo
    {
        [JsonPropertyName("i")] public int I { get; set; }
        [JsonPropertyName("s")] public int S { get; set; } // posição-modelo (schema) do adesivo na arma
        [JsonPropertyName("x")] public float? X { get; set; } // deslocamento: só vem se o jogador mexeu
        [JsonPropertyName("y")] public float? Y { get; set; }
        [JsonPropertyName("r")] public float R { get; set; }
        [JsonPropertyName("w")] public float W { get; set; }
    }

    // Chaveiro (charm) preso na arma
    private sealed class SkinChaveiro
    {
        [JsonPropertyName("i")] public int I { get; set; }
        [JsonPropertyName("x")] public float? X { get; set; } // posição: só vem se o jogador mexeu
        [JsonPropertyName("y")] public float? Y { get; set; }
        [JsonPropertyName("z")] public float? Z { get; set; }
        [JsonPropertyName("s")] public int S { get; set; }
    }

    private sealed class SkinAgente
    {
        [JsonPropertyName("d")] public int D { get; set; }
        [JsonPropertyName("m")] public string M { get; set; } = "";
    }

    private sealed class SkinsJogador
    {
        [JsonPropertyName("armas")] public Dictionary<string, Dictionary<string, SkinArma>> Armas { get; set; } = new(); // time (ct/tr) -> defIndex -> skin
        [JsonPropertyName("facas")] public Dictionary<string, SkinArma> Facas { get; set; } = new();
        [JsonPropertyName("luvas")] public Dictionary<string, SkinArma> Luvas { get; set; } = new();
        [JsonIgnore] public Dictionary<string, string> Revisoes { get; } = new();
        [JsonPropertyName("agentes")] public Dictionary<string, SkinAgente> Agentes { get; set; } = new();
    }

    // Calculado em segundo plano: a thread do jogo compara apenas strings prontas.
    private static void PrepararRevisoes(SkinsJogador inv)
    {
        foreach (var (lado, armas) in inv.Armas)
            foreach (var (def, skin) in armas) inv.Revisoes[$"{lado}:arma:{def}"] = JsonSerializer.Serialize(skin);
        foreach (var (lado, skin) in inv.Facas) inv.Revisoes[$"{lado}:faca"] = JsonSerializer.Serialize(skin);
        foreach (var (lado, skin) in inv.Luvas) inv.Revisoes[$"{lado}:luva"] = JsonSerializer.Serialize(skin);
        foreach (var (lado, agente) in inv.Agentes) inv.Revisoes[$"{lado}:agente"] = JsonSerializer.Serialize(agente);
    }
    private static string Revisao(SkinsJogador? inv, string chave) => inv?.Revisoes.GetValueOrDefault(chave, "") ?? "";
    private static bool Mudou(SkinsJogador? antes, SkinsJogador? depois, string chave) => Revisao(antes, chave) != Revisao(depois, chave);

    private readonly Dictionary<ulong, SkinsJogador> _skins = new();
    private readonly Dictionary<ulong, string> _skinsJson = new(); // o último texto recebido (só reaplica se mudou)
    private MemoryFunctionVoid<nint, string, float>? _definirAtributo;
    private bool _skinsAssinaturaOk;
    private ulong _proximoItemId = 65578;
    private int _fadeSeed;
    private bool _buscandoSkins;
    private bool _skinsEncerradas;
    private int _geracaoMapaSkins;
    private readonly CancellationTokenSource _cancelarSkins = new();
    private readonly HashSet<ulong> _skinsPendentes = new();
    private readonly Dictionary<ulong, int> _sessoesSkins = new();
    private readonly Dictionary<ulong, int> _vidasSkins = new();
    private readonly FilaSkinsPorFrame _filaSkins = new();
    private readonly Dictionary<(ulong Steam, string Tipo), (nint Pawn, string Revisao)> _cosmeticosAplicados = new();

    private void CarregarSkins()
    {
        if (!Config.FilaSite.Ativado || string.IsNullOrWhiteSpace(Config.FilaSite.Url) || string.IsNullOrWhiteSpace(Config.FilaSite.Token))
        {
            Logger.LogInformation("Skins desligadas: precisam do FilaSite configurado (Url e Token) para buscar o inventário no site.");
            return;
        }

        try
        {
            _definirAtributo = new MemoryFunctionVoid<nint, string, float>(GameData.GetSignature("BaseComp_CAttributeList_SetOrAddAttributeValueByName"));
            _skinsAssinaturaOk = true;
        }
        catch (Exception e)
        {
            Logger.LogError("Skins: assinatura do jogo não encontrada ({Erro}). Copie gamedata/basecomp.json para csgo/addons/counterstrikesharp/gamedata/. Só agentes e facas básicas funcionam sem ela.", e.Message);
        }

        RegisterListener<Listeners.OnMapStart>(_ =>
        {
            _geracaoMapaSkins++;
            _filaSkins.Limpar();
            _cosmeticosAplicados.Clear();
            _fadeSeed = 0;
            _proximoItemId = 65578;
        });
        RegisterListener<Listeners.OnTick>(() =>
        {
            try { if (!_skinsEncerradas) _filaSkins.ExecutarUma(); }
            catch (Exception e) { Logger.LogWarning("Skins: falha em atualização: {Erro}", e.Message); }
        });
        RegisterListener<Listeners.OnEntitySpawned>(AoCriarEntidadeParaSkins);
        RegisterEventHandler<EventPlayerConnectFull>((@event, _) =>
        {
            if (@event.Userid is { IsValid: true, IsBot: false } p)
            {
                _sessoesSkins[p.SteamID] = _sessoesSkins.GetValueOrDefault(p.SteamID) + 1;
                BuscarSkins([p.SteamID]);
            }
            return HookResult.Continue;
        });
        RegisterEventHandler<EventPlayerDisconnect>((@event, _) =>
        {
            // O controller pode já estar inválido no hook Post; o evento ainda
            // conserva o SteamID de quem desconectou.
            var id = @event.Xuid;
            if (id == 0 && @event.Userid is { IsValid: true, IsBot: false } p) id = p.SteamID;
            if (id > 0)
            {
                _sessoesSkins[id] = _sessoesSkins.GetValueOrDefault(id) + 1;
                _skinsPendentes.Remove(id);
                _skins.Remove(id);
                _skinsJson.Remove(id);
                _vidasSkins.Remove(id);
                foreach (var k in _cosmeticosAplicados.Keys.Where(k => k.Steam == id).ToArray()) _cosmeticosAplicados.Remove(k);
                LimparMemoriaDoPainel(id);
            }
            return HookResult.Continue;
        }, HookMode.Post);
        RegisterEventHandler<EventPlayerSpawn>((@event, _) =>
        {
            if (@event.Userid is { IsValid: true, IsBot: false } p)
            {
                _vidasSkins[p.SteamID] = _vidasSkins.GetValueOrDefault(p.SteamID) + 1;
                foreach (var k in _cosmeticosAplicados.Keys.Where(k => k.Steam == p.SteamID).ToArray()) _cosmeticosAplicados.Remove(k);
                AplicarSkinsNoJogador(p, comArmas: false);
            }
            return HookResult.Continue;
        });

        // Quem mexeu no inventário no site vale no próximo round; a cada ciclo lê de novo o de quem está no servidor
        AddTimer(Math.Max(15, Config.Skins.AtualizarACadaSegundos), () =>
            BuscarSkins(Utilities.GetPlayers().Where(p => p.IsValid && !p.IsBot && !p.IsHLTV).Select(p => p.SteamID).ToList()), TimerFlags.REPEAT);

        if (_skinsAssinaturaOk)
            InstalarPainelInventario(); // PainelInventario.cs: as skins também no painel de equipamento do espectador

        Logger.LogInformation("Skins: lendo o inventário do site a cada {S}s ({Assinatura}).", Math.Max(15, Config.Skins.AtualizarACadaSegundos),
            _skinsAssinaturaOk ? "assinatura ok" : "SEM assinatura");
    }

    // ── Busca no site ──
    private void BuscarSkins(List<ulong> ids)
    {
        if (_skinsEncerradas || ids.Count == 0) return;
        if (_buscandoSkins) { foreach (var id in ids) _skinsPendentes.Add(id); return; }
        _buscandoSkins = true;
        ids = ids.Distinct().ToList();
        var sessoes = ids.ToDictionary(id => id, id => _sessoesSkins.GetValueOrDefault(id));
        var mapa = _geracaoMapaSkins;
        var corpo = JsonSerializer.Serialize(new { ids = ids.Select(i => i.ToString()).ToList() });
        var token = _cancelarSkins.Token;
        _ = Task.Run(async () =>
        {
            var recebidos = new Dictionary<ulong, (SkinsJogador? Skins, string Texto)>();
            try
            {
                var json = await PostParaOSite("/servidor/skins", corpo, token);
                if (json is null) return;
                using var doc = JsonDocument.Parse(json);
                foreach (var id in ids)
                {
                    if (doc.RootElement.TryGetProperty(id.ToString(), out var e) && e.ValueKind == JsonValueKind.Object)
                    {
                        var skins = JsonSerializer.Deserialize<SkinsJogador>(e.GetRawText());
                        if (skins is not null) PrepararRevisoes(skins);
                        recebidos[id] = (skins, e.GetRawText());
                    }
                    else recebidos[id] = (null, "");
                }
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { }
            catch (Exception e) { Logger.LogWarning("Skins: não consegui ler o inventário do site ({Erro}).", e.Message); }
            finally
            {
                NaThreadDoJogo(() =>
                {
                    _buscandoSkins = false;
                    if (_skinsEncerradas) return;
                    if (mapa == _geracaoMapaSkins)
                        AtualizarSkinsRecebidas(recebidos, sessoes);
                    var pendentes = _skinsPendentes.Where(id => Utilities.GetPlayerFromSteamId(id) is { IsValid: true }).ToList();
                    _skinsPendentes.Clear();
                    if (pendentes.Count > 0) BuscarSkins(pendentes);
                });
            }
        });
    }

    private void AtualizarSkinsRecebidas(Dictionary<ulong, (SkinsJogador? Skins, string Texto)> recebidos, Dictionary<ulong, int> sessoes)
    {
        foreach (var (id, (skins, texto)) in recebidos)
        {
            // Uma resposta antiga não repõe o cache de quem já saiu/reconectou.
            if (_sessoesSkins.GetValueOrDefault(id) != sessoes[id] || Utilities.GetPlayerFromSteamId(id) is not { IsValid: true } dono) continue;
            if (_skinsJson.GetValueOrDefault(id, "") == texto) continue;
            _skins.TryGetValue(id, out var antes);
            _skinsJson[id] = texto;
            if (skins is null) _skins.Remove(id); else _skins[id] = skins;
            var sessao = sessoes[id];
            var mapa = _geracaoMapaSkins;
            _filaSkins.Agendar($"{id}:painel", () =>
            {
                if (SessaoSkinsValida(id, sessao, mapa) && Utilities.GetPlayerFromSteamId(id) is { IsValid: true } p) AtualizarPainelDoJogador(p);
            });
            if (dono.PawnIsAlive) AplicarSkinsNoJogador(dono, comArmas: true, antes: antes, soMudancas: true);
        }
    }
    private bool SessaoSkinsValida(ulong id, int sessao, int mapa) => !_skinsEncerradas && mapa == _geracaoMapaSkins && _sessoesSkins.GetValueOrDefault(id) == sessao;

    // ── Aplicação ──
    private static string LadoDe(CCSPlayerController p) => p.Team == CsTeam.CounterTerrorist ? "ct" : "tr";

    private void AplicarSkinsNoJogador(CCSPlayerController player, bool comArmas, SkinsJogador? antes = null, bool soMudancas = false)
    {
        if (!_skins.TryGetValue(player.SteamID, out var atual) || player.PlayerPawn.Value is not { IsValid: true } pawn) return;
        var id = player.SteamID;
        var lado = LadoDe(player);
        var sessao = _sessoesSkins.GetValueOrDefault(id);
        var mapa = _geracaoMapaSkins;
        var pawnHandle = pawn.Handle;
        var vida = _vidasSkins.GetValueOrDefault(id);
        void Agendar(string chave, Action acao) => _filaSkins.Agendar($"{id}:{chave}", () =>
        {
            if (!SessaoSkinsValida(id, sessao, mapa) || _vidasSkins.GetValueOrDefault(id) != vida || !player.IsValid || !player.PawnIsAlive || !pawn.IsValid || player.PlayerPawn.Value?.Handle != pawnHandle || LadoDe(player) != lado) return;
            acao();
        });
        foreach (var tipo in new[] { "agente", "luva" })
        {
            var chave = $"{lado}:{tipo}";
            if (soMudancas && !Mudou(antes, atual, chave)) continue;
            Agendar(tipo, () =>
            {
                if (!_skins.TryGetValue(id, out var inv)) return;
                var revisao = Revisao(inv, chave);
                if (_cosmeticosAplicados.TryGetValue((id, tipo), out var aplicado) && aplicado.Pawn == pawnHandle && aplicado.Revisao == revisao) return;
                if (tipo == "agente") AplicarAgente(player, pawn); else AplicarLuvas(player, pawn);
                _cosmeticosAplicados[(id, tipo)] = (pawnHandle, revisao);
            });
        }
        if (!comArmas || pawn.WeaponServices?.MyWeapons is not { } armas) return;
        foreach (var h in armas)
        {
            if (h.Value is not { IsValid: true } arma || arma.DesignerName?.Contains("weapon") != true) continue;
            var faca = arma.DesignerName.Contains("knife") || arma.DesignerName.Contains("bayonet");
            var chave = faca ? $"{lado}:faca" : $"{lado}:arma:{arma.AttributeManager.Item.ItemDefinitionIndex}";
            if (soMudancas && !Mudou(antes, atual, chave)) continue;
            var handle = arma.Handle;
            Agendar($"arma:{handle}", () =>
            {
                // Não toca em arma descartada/transferida enquanto aguardava na fila.
                if (!arma.IsValid || pawn.WeaponServices?.MyWeapons.Any(w => w.Value is { IsValid: true } v && v.Handle == handle) != true) return;
                AplicarSkinNaArma(player, arma);
            });
        }
    }

    private void AoCriarEntidadeParaSkins(CEntityInstance entidade)
    {
        if (_skins.Count == 0 || entidade.DesignerName is not { } nome || !nome.Contains("weapon"))
            return;

        Server.NextWorldUpdate(() =>
        {
            try
            {
                var arma = new CBasePlayerWeapon(entidade.Handle);
                if (!arma.IsValid)
                    return;

                CCSPlayerController? dono = null;
                if (arma.OriginalOwnerXuidLow > 0)
                    dono = Utilities.GetPlayers().FirstOrDefault(p => p.IsValid && p.SteamID == new SteamID(arma.OriginalOwnerXuidLow).SteamId64)
                           ?? Utilities.GetPlayerFromSteamId(arma.OriginalOwnerXuidLow);
                else if (arma.OwnerEntity.Value?.As<CCSPlayerPawn>() is { IsValid: true } pawn)
                    dono = pawn.Controller.Value?.As<CCSPlayerController>();

                if (dono is { IsValid: true, IsBot: false } && _skins.ContainsKey(dono.SteamID))
                {
                    var id = dono.SteamID; var sessao = _sessoesSkins.GetValueOrDefault(id); var mapa = _geracaoMapaSkins;
                    var pawnHandle = dono.PlayerPawn.Value?.Handle;
                    var vida = _vidasSkins.GetValueOrDefault(id);
                    _filaSkins.Agendar($"{id}:arma:{arma.Handle}", () =>
                    {
                        if (SessaoSkinsValida(id, sessao, mapa) && _vidasSkins.GetValueOrDefault(id) == vida && dono.IsValid && dono.PawnIsAlive && dono.PlayerPawn.Value?.Handle == pawnHandle && arma.IsValid && dono.PlayerPawn.Value?.WeaponServices?.MyWeapons.Any(w => w.Value is { IsValid: true } v && v.Handle == arma.Handle) == true) AplicarSkinNaArma(dono, arma);
                    });
                }
            }
            catch
            {
                // arma que sumiu no meio do caminho
            }
        });
    }

    private void DefinirAtributo(nint lista, string nome, float valor)
    {
        if (_definirAtributo is null)
            return;
        try
        {
            _definirAtributo.Invoke(lista, nome, valor);
        }
        catch (Exception e)
        {
            Logger.LogWarning("Skins: falha ao definir {Atributo}: {Erro}", nome, e.Message);
        }
    }

    // Pintura, adesivos e chaveiro vão nas DUAS listas de atributos da arma (a que vai para os clientes e a do servidor), como já era com as luvas.
    // O painel de espectador do CS2 (equipamento do jogador observado) monta o item por aqui: com tudo só na lista de rede, skins com adesivo/chaveiro
    // saíam sem a pintura nesse painel.
    private void DefinirNasListas(CEconItemView item, string nome, float valor)
    {
        DefinirAtributo(item.NetworkedDynamicAttributes.Handle, nome, valor);
        DefinirAtributo(item.AttributeList.Handle, nome, valor);
    }

    private static float ComoFloat(uint v) => BitConverter.Int32BitsToSingle((int)v);

    private void NovoIdDeItem(CEconItemView item)
    {
        var id = _proximoItemId++;
        item.ItemID = id;
        item.ItemIDLow = (uint)(id & 0xFFFFFFFF);
        item.ItemIDHigh = (uint)(id >> 32);
    }

    private void AplicarSkinNaArma(CCSPlayerController player, CBasePlayerWeapon arma)
    {
        if (!_skinsAssinaturaOk || !_skins.TryGetValue(player.SteamID, out var inv))
            return;

        var nome = arma.DesignerName ?? "";
        var item = arma.AttributeManager.Item;
        var faca = nome.Contains("knife") || nome.Contains("bayonet");
        SkinArma? skin;

        if (faca)
        {
            if (!inv.Facas.TryGetValue(LadoDe(player), out skin) || skin.D == 0)
                return;
            if (item.ItemDefinitionIndex != skin.D)
                arma.AcceptInput("ChangeSubclass", value: skin.D.ToString());
            item.ItemDefinitionIndex = (ushort)skin.D;
            item.EntityQuality = 3;
            item.AttributeList.Attributes.RemoveAll();
            item.NetworkedDynamicAttributes.Attributes.RemoveAll();
        }
        else
        {
            if (!inv.Armas.TryGetValue(LadoDe(player), out var doTime) || !doTime.TryGetValue(item.ItemDefinitionIndex.ToString(), out skin))
                return;
            item.EntityQuality = 0;
        }

        // Faca lisa (sem pintura): só o modelo da faca
        if (skin.P <= 0)
            return;

        NovoIdDeItem(item);
        item.AccountID = (uint)player.SteamID;
        item.AttributeList.Attributes.RemoveAll();
        item.NetworkedDynamicAttributes.Attributes.RemoveAll();

        var seed = skin is { P: 38, S: 0 } ? _fadeSeed++ % 1000 : skin.S; // Fade sem seed escolhido: cada arma sai com um padrão
        arma.FallbackPaintKit = skin.P;
        arma.FallbackSeed = seed;
        arma.FallbackWear = Math.Clamp(skin.F, 0.0001f, 1f);
        DefinirNasListas(item, "set item texture prefab", skin.P);
        DefinirNasListas(item, "set item texture seed", seed);
        DefinirNasListas(item, "set item texture wear", Math.Clamp(skin.F, 0.0001f, 1f));

        if (skin.St == 1)
        {
            item.EntityQuality = 9;
            DefinirAtributo(item.NetworkedDynamicAttributes.Handle, "kill eater", ComoFloat(0));
            DefinirAtributo(item.NetworkedDynamicAttributes.Handle, "kill eater score type", 0);
            DefinirAtributo(item.AttributeList.Handle, "kill eater", ComoFloat(0));
            DefinirAtributo(item.AttributeList.Handle, "kill eater score type", 0);
        }

        if (!string.IsNullOrEmpty(skin.N))
            item.CustomName = skin.N;

        if (!faca && skin.K is { I: > 0 } ch)
        {
            DefinirNasListas(item, "keychain slot 0 id", ComoFloat((uint)ch.I));
            if (ch.X is { } kx) DefinirNasListas(item, "keychain slot 0 offset x", kx);
            if (ch.Y is { } ky) DefinirNasListas(item, "keychain slot 0 offset y", ky);
            if (ch.Z is { } kz) DefinirNasListas(item, "keychain slot 0 offset z", kz);
            DefinirNasListas(item, "keychain slot 0 seed", ComoFloat((uint)ch.S));
        }

        if (!faca)
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

        // Modelo antigo x novo da pintura (sem isto a arma fica com a textura errada)
        if (arma.CBodyComponent?.SceneNode != null)
            arma.AcceptInput("SetBodygroup", value: $"body,{(skin.L == 1 ? 1 : 0)}");
    }

    private void AplicarLuvas(CCSPlayerController player, CCSPlayerPawn pawn)
    {
        if (!_skinsAssinaturaOk || !_skins.TryGetValue(player.SteamID, out var inv) ||
            !inv.Luvas.TryGetValue(LadoDe(player), out var luva) || luva.D == 0 || luva.P <= 0)
            return;

        var revisaoLuva = Revisao(inv, $"{LadoDe(player)}:luva");
        var idDono = player.SteamID; var sessaoDono = _sessoesSkins.GetValueOrDefault(idDono); var mapaDono = _geracaoMapaSkins;
        var pawnDono = pawn.Handle;
        var vidaDono = _vidasSkins.GetValueOrDefault(idDono);
        bool Atual() => SessaoSkinsValida(idDono, sessaoDono, mapaDono) && _vidasSkins.GetValueOrDefault(idDono) == vidaDono && player.IsValid && player.PawnIsAlive && pawn.IsValid && player.PlayerPawn.Value?.Handle == pawnDono && Revisao(_skins.GetValueOrDefault(idDono), $"{LadoDe(player)}:luva") == revisaoLuva;
        var item = pawn.EconGloves;
        item.NetworkedDynamicAttributes.Attributes.RemoveAll();
        item.AttributeList.Attributes.RemoveAll();

        // Troca de modelo da luva: o jogo só atualiza depois de um "lastinv" e de ligar/desligar o bodygroup das mãos
        player.ExecuteClientCommand("lastinv");
        AddTimer(0.08f, () =>
        {
            try
            {
                if (!Atual())
                    return;

                item.ItemDefinitionIndex = (ushort)luva.D;
                NovoIdDeItem(item);
                foreach (var lista in new[] { item.NetworkedDynamicAttributes.Handle, item.AttributeList.Handle })
                {
                    DefinirAtributo(lista, "set item texture prefab", luva.P);
                    DefinirAtributo(lista, "set item texture seed", luva.S);
                    DefinirAtributo(lista, "set item texture wear", Math.Clamp(luva.F, 0.0001f, 1f));
                }
                item.Initialized = true;

                player.ExecuteClientCommand("lastinv");
                pawn.AcceptInput("SetBodygroup", value: "first_or_third_person,0");
                AddTimer(0.2f, () =>
                {
                    if (Atual())
                        pawn.AcceptInput("SetBodygroup", value: "first_or_third_person,1");
                }, TimerFlags.STOP_ON_MAPCHANGE);
            }
            catch
            {
                // jogador saiu no meio
            }
        }, TimerFlags.STOP_ON_MAPCHANGE);
    }

    private void AplicarAgente(CCSPlayerController player, CCSPlayerPawn pawn)
    {
        if (!Config.Skins.AplicarAgentes)
            return; // agentes bloqueados no servidor (BaseComp.json: Skins.AplicarAgentes)
        if (!_skins.TryGetValue(player.SteamID, out var inv) || !inv.Agentes.TryGetValue(LadoDe(player), out var agente) ||
            string.IsNullOrEmpty(agente.M))
            return;
        try
        {
            pawn.SetModel(agente.M);
        }
        catch (Exception e)
        {
            Logger.LogWarning("Skins: não consegui trocar o agente de {Nome}: {Erro}", player.PlayerName, e.Message);
        }
    }
}

// Skins: onde fica o inventário (mesmo Url/Token do FilaSite) e de quanto em quanto tempo o plugin confere mudanças
public class SkinsConfig
{
    // Segundos entre uma conferência e outra do inventário de quem está no servidor (mínimo 15)
    [JsonPropertyName("PainelDoEspectador")]
    public bool PainelDoEspectador { get; set; } = true; // false = sem as skins no painel de equipamento do espectador (PainelInventario.cs)

    [JsonPropertyName("AtualizarACadaSegundos")]
    public int AtualizarACadaSegundos { get; set; } = 45;

    // false = agentes bloqueados: o plugin não troca o modelo de ninguém (o site também não manda agentes)
    [JsonPropertyName("AplicarAgentes")]
    public bool AplicarAgentes { get; set; } = false;
}
