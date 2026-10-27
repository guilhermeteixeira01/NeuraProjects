using System.Text.Json.Serialization;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Modules.Cvars;
using CounterStrikeSharp.API.Modules.Utils;

namespace BaseComp;

// Contadores próprios: não reutiliza estatísticas antigas que podem conter bots ou aquecimento.
public partial class BaseComp
{
    private readonly Dictionary<ulong, DadosMissoesJogador> _missoes = new();
    private readonly Dictionary<ulong, DadosMissoesJogador> _missoesRound = new();
    private readonly HashSet<ulong> _missoesMortos = new(), _missoesClutch = new(), _missoesParticipantes = new();
    private readonly Dictionary<ulong, HashSet<ulong>> _missoesVitimas = new();
    private readonly HashSet<int> _missoesRounds = new();
    private bool _missoesRoundValido, _missoesFechou;
    private string _missoesModo = "";
    private int _missoesNumero;

    private string ModoMissoes()
    {
        if (Config.MissoesTreino) return "";
        if (Config.MissoesModo is "wingman" or "corrida-armada" or "rush") return Config.MissoesModo;
        var tipo = ConVar.Find("game_type")?.GetPrimitiveValue<int>() ?? -1;
        var modo = ConVar.Find("game_mode")?.GetPrimitiveValue<int>() ?? -1;
        if (tipo == 0 && modo == 2) return "wingman";
        if (tipo == 1 && modo == 0) return "corrida-armada";
        if (tipo == 0 && modo == 1 && (_serie is not null && MapaDaSerie is not null)) return "5v5";
        return ""; // treino/casual/deathmatch e competitivo sem série validada não contam
    }

    private void ZerarMissoes()
    {
        _missoes.Clear(); _missoesRound.Clear(); _missoesMortos.Clear(); _missoesClutch.Clear();
        _missoesVitimas.Clear(); _missoesParticipantes.Clear(); _missoesRounds.Clear();
        _missoesModo = ""; _missoesRoundValido = false; _missoesFechou = true;
    }
    private DadosMissoesJogador NoRound(ulong id)
    {
        if (!_missoesRound.TryGetValue(id, out var d)) _missoesRound[id] = d = new();
        return d;
    }
    private bool RoundDeCombate() => _contando && PartidaValendo() && _missoesRoundValido && !_missoesFechou && _missoesModo == "5v5";

    private void CarregarMissoes()
    {
        RegisterListener<Listeners.OnMapStart>(_ => ZerarMissoes());
        RegisterEventHandler<EventRoundStart>((_, _) =>
        {
            _missoesRound.Clear(); _missoesMortos.Clear(); _missoesClutch.Clear(); _missoesVitimas.Clear();
            _missoesFechou = false;
            _missoesNumero = Regras()?.TotalRoundsPlayed ?? -1;
            _missoesModo = ModoMissoes();
            _missoesRoundValido = _contando && PartidaValendo() && _missoesModo.Length > 0;
            return HookResult.Continue;
        });
        RegisterEventHandler<EventRoundFreezeEnd>((_, _) =>
        {
            if (!_missoesRoundValido) return HookResult.Continue;
            var campo = ObterJogadores().Where(p => p.Team is CsTeam.CounterTerrorist or CsTeam.Terrorist).ToList();
            if (_missoesModo == "5v5")
                _missoesRoundValido = campo.Count == 10 && campo.All(p => !p.IsBot) && campo.Count(p => p.Team == CsTeam.CounterTerrorist) == 5;
            foreach (var p in campo.Where(p => !p.IsBot))
            {
                _missoesParticipantes.Add(p.SteamID);
                NoRound(p.SteamID).Participou = true;
            }
            return HookResult.Continue;
        });
        RegisterEventHandler<EventPlayerDeath>((e, _) =>
        {
            if (!RoundDeCombate() || e.Userid is not { IsValid: true } vitima || !_missoesMortos.Add(vitima.SteamID)) return HookResult.Continue;
            if (!vitima.IsBot && e.Attacker is { IsValid: true, IsBot: false } atacante && atacante.SteamID != vitima.SteamID && atacante.Team != vitima.Team && atacante.Team is CsTeam.CounterTerrorist or CsTeam.Terrorist)
            {
                var d = NoRound(atacante.SteamID); d.Kills++;
                if (e.Headshot) d.Headshots++;
                var arma = (e.Weapon ?? "").Replace("weapon_", "");
                d.Armas[arma] = d.Armas.GetValueOrDefault(arma) + 1;
                if (!_missoesVitimas.TryGetValue(atacante.SteamID, out var v)) _missoesVitimas[atacante.SteamID] = v = new();
                v.Add(vitima.SteamID);
                if (e.Assister is { IsValid: true, IsBot: false } assist && assist.SteamID != atacante.SteamID && assist.SteamID != vitima.SteamID && assist.Team == atacante.Team)
                    NoRound(assist.SteamID).Assistencias++;
            }
            var vivos = ObterJogadores().Where(p => !p.IsBot && p.PawnIsAlive && !_missoesMortos.Contains(p.SteamID) && p.Team is CsTeam.CounterTerrorist or CsTeam.Terrorist).ToList();
            foreach (var lado in new[] { CsTeam.CounterTerrorist, CsTeam.Terrorist })
            {
                var time = vivos.Where(p => p.Team == lado).ToList();
                if (time.Count == 1 && vivos.Count(p => p.Team != lado) >= 2) _missoesClutch.Add(time[0].SteamID);
            }
            return HookResult.Continue;
        });
        RegisterEventHandler<EventBombPlanted>((e, _) =>
        {
            if (RoundDeCombate() && e.Userid is { IsValid: true, IsBot: false } p) NoRound(p.SteamID).Plantios = 1;
            return HookResult.Continue;
        });
        RegisterEventHandler<EventBombDefused>((e, _) =>
        {
            if (RoundDeCombate() && e.Userid is { IsValid: true, IsBot: false } p) NoRound(p.SteamID).Desarmes = 1;
            return HookResult.Continue;
        });
        RegisterEventHandler<EventRoundEnd>((e, _) =>
        {
            if (!_missoesRoundValido || _missoesFechou || !_contando || !PartidaValendo()) return HookResult.Continue;
            _missoesFechou = true;
            if (!_missoesRounds.Add(_missoesNumero)) return HookResult.Continue;
            foreach (var (id, d) in _missoesRound)
            {
                var p = ObterJogadores().FirstOrDefault(p => p.SteamID == id);
                if (_missoesClutch.Contains(id) && p is { PawnIsAlive: true } && !_missoesMortos.Contains(id) && (int)p.Team == e.Winner) d.Clutches = 1;
                d.MelhorRound = _missoesVitimas.GetValueOrDefault(id)?.Count ?? 0;
                d.RoundsValidos = 1;
                if (!_missoes.TryGetValue(id, out var total)) _missoes[id] = total = new();
                total.Somar(d);
            }
            return HookResult.Continue;
        });
    }

    private DadosMissoesPartida DadosDeMissoes()
    {
        var finais = ObterJogadores().Where(p => !p.IsBot && p.Team is CsTeam.CounterTerrorist or CsTeam.Terrorist).ToList();
        return new()
        {
            Modo = _missoesModo,
            Validada = _missoesModo.Length > 0 && (_missoesRounds.Count > 0 || (_missoesModo != "5v5" && _missoesParticipantes.Count > 0)),
            ElencoFinal = finais.Select(p => p.SteamID.ToString()).Distinct().ToList(),
            TimesFinais = finais.ToDictionary(p => p.SteamID.ToString(), p => TimeDoLado(p.Team) ?? "")
        };
    }
    private DadosMissoesJogador DadosDeMissoes(ulong id)
    {
        var d = _missoes.GetValueOrDefault(id) ?? new();
        d.Participou = _missoesParticipantes.Contains(id);
        return d;
    }
}

public class DadosMissoesPartida
{
    [JsonPropertyName("versao")] public int Versao { get; set; } = 1;
    [JsonPropertyName("validada")] public bool Validada { get; set; }
    [JsonPropertyName("concluida")] public bool Concluida { get; set; } = true;
    [JsonPropertyName("modo")] public string Modo { get; set; } = "";
    [JsonPropertyName("elencoFinal")] public List<string> ElencoFinal { get; set; } = new();
    [JsonPropertyName("timesFinais")] public Dictionary<string,string> TimesFinais { get; set; } = new();
}
public class DadosMissoesJogador
{
    [JsonPropertyName("participou")] public bool Participou { get; set; }
    [JsonPropertyName("roundsValidos")] public int RoundsValidos { get; set; }
    [JsonPropertyName("kills")] public int Kills { get; set; }
    [JsonPropertyName("headshots")] public int Headshots { get; set; }
    [JsonPropertyName("assistencias")] public int Assistencias { get; set; }
    [JsonPropertyName("clutches")] public int Clutches { get; set; }
    [JsonPropertyName("plantios")] public int Plantios { get; set; }
    [JsonPropertyName("desarmes")] public int Desarmes { get; set; }
    [JsonPropertyName("melhorRound")] public int MelhorRound { get; set; }
    [JsonPropertyName("armas")] public Dictionary<string,int> Armas { get; set; } = new();
    public void Somar(DadosMissoesJogador d)
    {
        Participou |= d.Participou; RoundsValidos += d.RoundsValidos; Kills += d.Kills; Headshots += d.Headshots;
        Assistencias += d.Assistencias; Clutches += d.Clutches; Plantios += d.Plantios; Desarmes += d.Desarmes;
        MelhorRound = Math.Max(MelhorRound, d.MelhorRound);
        foreach (var (arma, n) in d.Armas) Armas[arma] = Armas.GetValueOrDefault(arma) + n;
    }
}
