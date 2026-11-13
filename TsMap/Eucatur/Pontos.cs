using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using TsMap.Common;
using TsMap.Helpers.Logger;

namespace TsMap.Eucatur
{
    /// <summary>
    /// Eucatur: guarda, durante a leitura do mapa, os "pontos de interesse" (regras de transito,
    /// gatilhos, placas e objetos) com o nome interno de cada um. Na exportacao gera:
    ///  - pontos-resumo.txt: quantos de cada nome existem (pra descobrir como o mapa chama radar/lombada);
    ///  - pontos.json: posicoes so dos nomes que parecem radar, lombada, policia, pedagio etc.
    /// </summary>
    public static class Pontos
    {
        private struct P { public byte Tipo; public ulong Token; public ulong NodeUid; }
        private static readonly string[] Tipos = { "regra", "gatilho", "placa", "objeto" };
        private static readonly List<P> Lista = new List<P>();
        private static readonly object Trava = new object();

        private static readonly string[] Palavras =
        {
            "radar", "camer", "speed", "lomb", "bump", "quebra", "ondul", "redut", "tachao", "tacha",
            "polic", "prf", "fiscal", "pedag", "toll", "balanc", "weigh", "fotos", "control", "semaf", "farol",
            "offence", "offense", "fine"
        };

        public static void Add(string tipo, ulong token, ulong nodeUid)
        {
            if (token == 0 || nodeUid == 0) return;
            var t = (byte)Array.IndexOf(Tipos, tipo);
            lock (Trava) Lista.Add(new P { Tipo = t, Token = token, NodeUid = nodeUid });
        }

        private static bool Interessa(string nome)
        {
            var n = nome.ToLowerInvariant();
            return Palavras.Any(p => n.Contains(p));
        }

        public static int Escrever(TsMapper m, string dir)
        {
            var inv = CultureInfo.InvariantCulture;
            var contagem = new Dictionary<string, int>();
            var posicoes = new Dictionary<string, List<float>>();
            var total = 0;
            List<P> copia;
            lock (Trava) copia = new List<P>(Lista);
            foreach (var p in copia)
            {
                var nome = ScsToken.TokenToString(p.Token);
                var chave = Tipos[p.Tipo] + "|" + nome;
                int c;
                contagem.TryGetValue(chave, out c);
                contagem[chave] = c + 1;
                if (!Interessa(nome)) continue;
                var n = m.GetNodeByUid(p.NodeUid);
                if (n == null) continue;
                List<float> l;
                if (!posicoes.TryGetValue(chave, out l)) posicoes[chave] = l = new List<float>();
                l.Add(n.X); l.Add(n.Z);
                total++;
            }

            // Eucatur v7: icones do proprio mapa do jogo (posto, oficina, estacionamento/descanso,
            // balanca, pedagio, garagem) -> o GPS mostra postos e paradas no caminho.
            var overlaysQueInteressam = new HashSet<string> { "gas_ico", "service_ico", "parking_ico", "weigh_station_ico", "toll_ico", "garage_large_ico" };
            try
            {
                foreach (var ov in m.OverlayManager.GetOverlays())
                {
                    if (ov == null || ov.OverlayName == null || !overlaysQueInteressam.Contains(ov.OverlayName)) continue;
                    var chave = "overlay|" + ov.OverlayName;
                    int c;
                    contagem.TryGetValue(chave, out c);
                    contagem[chave] = c + 1;
                    List<float> l;
                    if (!posicoes.TryGetValue(chave, out l)) posicoes[chave] = l = new List<float>();
                    l.Add(ov.Position.X); l.Add(ov.Position.Y);
                    total++;
                }
            }
            catch (Exception ex) { Logger.Instance.Warning($"[pontos] icones do mapa falharam: {ex.Message}"); }

            // Eucatur v7: identificacao do mapa (o painel usa pra mostrar o nome e saber de onde veio).
            try
            {
                var mods = string.Join(",", m.ModsCarregados().Select(x => "\"" + x.Replace("\\", "/").Replace("\"", "'") + "\""));
                File.WriteAllText(Path.Combine(dir, "mapa-info.json"),
                    "{\"gerado\":\"" + DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ", inv) + "\",\"mods\":[" + mods + "],\"versaoExportador\":7}",
                    new UTF8Encoding(false));
            }
            catch (Exception ex) { Logger.Instance.Warning($"[pontos] mapa-info falhou: {ex.Message}"); }

            var sb = new StringBuilder();
            sb.AppendLine("tipo\tnome\tquantidade\tparece_radar_lombada_etc");
            foreach (var kv in contagem.OrderBy(k => k.Key.Split('|')[0]).ThenByDescending(k => k.Value))
            {
                var partes = kv.Key.Split('|');
                sb.Append(partes[0]).Append('\t').Append(partes[1]).Append('\t').Append(kv.Value)
                  .Append('\t').AppendLine(Interessa(partes[1]) || partes[0] == "overlay" ? "SIM" : "");
            }
            File.WriteAllText(Path.Combine(dir, "pontos-resumo.txt"), sb.ToString(), new UTF8Encoding(false));

            var js = new StringBuilder("{");
            var primeiro = true;
            foreach (var kv in posicoes.OrderByDescending(k => k.Value.Count))
            {
                if (!primeiro) js.Append(',');
                primeiro = false;
                js.Append('"').Append(kv.Key.Replace("\\", "\\\\").Replace("\"", "\\\"")).Append("\":[");
                js.Append(string.Join(",", kv.Value.Select(v => Math.Round(v, 1).ToString("0.#", inv))));
                js.Append(']');
            }
            js.Append('}');
            File.WriteAllText(Path.Combine(dir, "pontos.json"), js.ToString(), new UTF8Encoding(false));
            return total;
        }
    }
}
