using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using BaseComp;

var testes = 0;
void Verificar(bool condicao, string mensagem) { if (!condicao) throw new Exception(mensagem); testes++; }

// O lote de dez jogadores não executa dez operações no mesmo frame.
var fila = new FilaSkinsPorFrame(); var aplicadas = new List<int>();
for (var i = 0; i < 10; i++) { var n=i; fila.Agendar($"{i}:arma",()=>aplicadas.Add(n)); }
for (var i=0;i<10;i++) { var antes=aplicadas.Count; Verificar(fila.ExecutarUma(),"Fila não executou"); Verificar(aplicadas.Count==antes+1,"Mais de uma operação por frame"); }
Verificar(!fila.ExecutarUma()&&fila.Pendentes==0,"Fila não esvaziou");
fila.Agendar("1:luva",()=>throw new Exception("Revisão obsoleta executada"));
fila.Agendar("1:luva",()=>aplicadas.Add(99));
Verificar(fila.Pendentes==1,"Revisões acumularam"); fila.ExecutarUma();
Verificar(aplicadas[^1]==99,"Não usou revisão mais nova");
fila.Agendar("1:arma",()=>throw new Exception("Trabalho de mapa anterior executado")); fila.Limpar();
Verificar(!fila.ExecutarUma(),"Limpeza não cancelou trabalho pendente");

// Ponteiros falsos com destruidor injetado: nunca tocar no heap do jogo no teste.
var liberados=new List<nint>();var memoria=new MemoriaPainelSkins(liberados.Add);
memoria.Registrar((nint)101);memoria.Registrar((nint)102);
Verificar(!memoria.Liberar((nint)999),"Tentou liberar ponteiro que não possui");
Verificar(memoria.Liberar((nint)101),"Não liberou bloco do jogador");
Verificar(!memoria.Liberar((nint)101),"Double free");
memoria.LiberarTodos();memoria.LiberarTodos();
Verificar(liberados.Count==2&&memoria.Quantidade==0,"Vazamento/double free no descarregamento");
for(var ciclo=0;ciclo<1000;ciclo++){memoria.Registrar((nint)(ciclo+1000));memoria.Liberar((nint)(ciclo+1000));}
Verificar(memoria.Quantidade==0,"Conectar/desconectar acumula memória");

// Executa os métodos reais do DLL, sem criar plugin nem chamar natives do CS2.
var plugin=typeof(BaseComp.BaseComp);
var tipo=plugin.GetNestedType("SkinsJogador",BindingFlags.NonPublic)!;
var preparar=plugin.GetMethod("PrepararRevisoes",BindingFlags.NonPublic|BindingFlags.Static)!;
var mudou=plugin.GetMethod("Mudou",BindingFlags.NonPublic|BindingFlags.Static)!;
object Inv(string json){var inv=JsonSerializer.Deserialize(json,tipo)!;preparar.Invoke(null,[inv]);return inv;}
bool Mudou(object? a,object? b,string chave)=>(bool)mudou.Invoke(null,[a,b,chave])!;
var a=Inv("""{"armas":{"ct":{"7":{"p":1,"f":0.1,"a":[{"i":22}]},"9":{"p":3}}},"luvas":{"ct":{"d":5030,"p":100}},"agentes":{"ct":{"m":"modelo"}},"facas":{"ct":{"d":515,"p":7}}}""");
var b=Inv("""{"facas":{"ct":{"p":7,"d":515}},"agentes":{"ct":{"m":"modelo"}},"luvas":{"ct":{"p":100,"d":5030}},"armas":{"ct":{"9":{"p":3},"7":{"a":[{"i":22}],"f":0.1,"p":1}}}}""");
foreach(var chave in new[]{"ct:arma:7","ct:arma:9","ct:luva","ct:agente","ct:faca"})Verificar(!Mudou(a,b,chave),"Ordem JSON causou reaplicação: "+chave);
var c=Inv("""{"armas":{"ct":{"7":{"p":1,"f":0.1,"a":[{"i":23}]},"9":{"p":3}}},"luvas":{"ct":{"d":5030,"p":100}},"agentes":{"ct":{"m":"modelo"}},"facas":{"ct":{"d":515,"p":7}}}""");
Verificar(Mudou(a,c,"ct:arma:7"),"Adesivo alterado não foi detectado");
foreach(var chave in new[]{"ct:arma:9","ct:luva","ct:agente","ct:faca"})Verificar(!Mudou(a,c,chave),"Reaplica parte que não mudou: "+chave);
Verificar(Mudou(null,a,"ct:luva"),"Primeiro inventário não aplica luva");
Verificar(Mudou(a,null,"ct:arma:7"),"Remoção não é detectada");
var baseJson=JsonSerializer.Serialize(a,tipo);
var casos=new (string Alvo,Action<JsonNode> Alterar)[]{
    ("ct:arma:7",j=>j["armas"]!["ct"]!["7"]!["f"]=0.9),
    ("ct:arma:7",j=>j["armas"]!["ct"]!["7"]!["st"]=1),
    ("ct:arma:7",j=>j["armas"]!["ct"]!["7"]!["n"]="Nova etiqueta"),
    ("ct:arma:7",j=>j["armas"]!["ct"]!["7"]!["k"]=JsonNode.Parse("""{"i":12,"x":0.2,"s":33}""")),
    ("ct:faca",j=>j["facas"]!["ct"]!["d"]=507),
    ("ct:luva",j=>j["luvas"]!["ct"]!["p"]=101),
    ("ct:agente",j=>j["agentes"]!["ct"]!["m"]="Outro modelo"),
};
foreach(var (alvo,alterar) in casos){
    var j=JsonNode.Parse(baseJson)!;alterar(j);var alterado=Inv(j.ToJsonString());
    foreach(var chave in new[]{"ct:arma:7","ct:arma:9","ct:luva","ct:agente","ct:faca"})Verificar(Mudou(a,alterado,chave)==(chave==alvo),$"Alteração de {alvo} afetou {chave}");
}
Console.WriteLine($"OK: {testes} verificações de fila, memória e revisões reais do DLL.");
