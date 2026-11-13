using System;
using System.Collections.Generic;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using TsMap.Common;
using TsMap.Helpers.Logger;
using TsMap.TsItem;

namespace TsMap.Eucatur
{
    /// <summary>
    /// Eucatur: exporta o grafo de navegacao (navegacao.json) e os pontos de interesse
    /// (pontos.json + pontos-resumo.txt) do mapa carregado (jogo + mods, ex.: RBR).
    ///   nodes:     [[x, z, itemTras, itemFrente], ...]
    ///   edges:     [[deNo, paraNo, item, comprimento, tipo(0 estrada / 1 cruzamento), [x1,z1,...]], ...]
    ///   companies: [[empresa, cidade, x, z, itemDoPrefab, [nosDeEntrada]], ...]
    ///   cities:    [[token, nome, x, z], ...]
    /// </summary>
    public static class NavExporter
    {
        private static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        public static string Export(TsMapper m, string dir)
        {
            var nodeIdx = new Dictionary<ulong, int>();
            var nodes = new List<TsNode>();
            var itemIdx = new Dictionary<ulong, int>();
            var edges = new List<string>();
            int roadEdges = 0, prefabEdges = 0, prefabsSemCurva = 0, prefabsSemLigacao = 0;

            Func<ulong, int> NodeIndex = uid =>
            {
                int i;
                if (nodeIdx.TryGetValue(uid, out i)) return i;
                var n = m.GetNodeByUid(uid);
                if (n == null) return -1;
                i = nodes.Count;
                nodes.Add(n);
                nodeIdx[uid] = i;
                return i;
            };

            foreach (var r in m.Roads) if (!itemIdx.ContainsKey(r.Uid)) itemIdx[r.Uid] = itemIdx.Count;
            foreach (var p in m.Prefabs) if (!itemIdx.ContainsKey(p.Uid)) itemIdx[p.Uid] = itemIdx.Count;

            foreach (var road in m.Roads)
            {
                try
                {
                    var s = road.GetStartNode();
                    var e = road.GetEndNode();
                    if (s == null || e == null) continue;
                    var si = NodeIndex(s.Uid);
                    var ei = NodeIndex(e.Uid);
                    if (si < 0 || ei < 0 || si == ei) continue;
                    var pts = RoadPoints(s, e);
                    var len = PolyLength(pts);
                    var lanesR = road.RoadLook?.LanesRight?.Count ?? 0;
                    var lanesL = road.RoadLook?.LanesLeft?.Count ?? 0;
                    var both = lanesR == 0 && lanesL == 0;
                    var item = itemIdx[road.Uid];
                    if (lanesR > 0 || both) { edges.Add(EdgeJson(si, ei, item, len, 0, pts)); roadEdges++; }
                    if (lanesL > 0 || both)
                    {
                        var rev = new List<PointF>(pts);
                        rev.Reverse();
                        edges.Add(EdgeJson(ei, si, item, len, 0, rev));
                        roadEdges++;
                    }
                }
                catch (Exception ex) { Logger.Instance.Warning($"[navegacao] estrada 0x{road.Uid:X} ignorada: {ex.Message}"); }
            }

            foreach (var p in m.Prefabs)
            {
                try
                {
                    var pf = p.Prefab;
                    if (pf?.PrefabNodes == null || pf.NavCurves == null || pf.NavCurves.Count == 0 || p.Nodes == null) { prefabsSemCurva++; continue; }
                    var n = pf.PrefabNodes.Count;
                    if (n == 0 || p.Nodes.Count < n || p.Origin >= n) continue;
                    var originNode = m.GetNodeByUid(p.Nodes[0]);
                    if (originNode == null) continue;
                    var o = pf.PrefabNodes[p.Origin];
                    var rot = (float)(originNode.Rotation - Math.PI - Math.Atan2(o.RotZ, o.RotX) + Math.PI / 2);
                    var startX = originNode.X - o.X;
                    var startZ = originNode.Z - o.Z;
                    var item = itemIdx[p.Uid];

                    var best = new Dictionary<long, Tuple<float, List<int>>>();
                    for (var i = 0; i < n; i++)
                        foreach (var lane in pf.PrefabNodes[i].InputLanes)
                        {
                            if (lane < 0 || lane >= pf.NavCurves.Count) continue;
                            Walk(pf, i, new List<int> { lane }, pf.NavCurves[lane].Length, best);
                        }
                    if (best.Count == 0) prefabsSemLigacao++;

                    foreach (var kv in best)
                    {
                        var i = (int)(kv.Key >> 16);
                        var j = (int)(kv.Key & 0xFFFF);
                        var fi = NodeIndex(p.Nodes[((i - p.Origin) % n + n) % n]);
                        var ti = NodeIndex(p.Nodes[((j - p.Origin) % n + n) % n]);
                        if (fi < 0 || ti < 0) continue;
                        var pts = new List<PointF>();
                        foreach (var ci in kv.Value.Item2)
                            foreach (var lp in CurvePoints(pf.NavCurves[ci]))
                            {
                                var w = RenderHelper.RotatePoint(startX + lp.X, startZ + lp.Y, rot, originNode.X, originNode.Z);
                                if (pts.Count == 0 || Dist(pts[pts.Count - 1], w) > 0.5f) pts.Add(w);
                            }
                        if (pts.Count < 2) continue;
                        edges.Add(EdgeJson(fi, ti, item, Math.Max(kv.Value.Item1, PolyLength(pts)), 1, pts));
                        prefabEdges++;
                    }
                }
                catch (Exception ex) { Logger.Instance.Warning($"[navegacao] prefab 0x{p.Uid:X} ignorado: {ex.Message}"); }
            }

            // Empresas (antes de escrever os nos: os nos de entrada delas entram na lista)
            var companyJson = new List<string>();
            var prefabByUid = new Dictionary<ulong, TsPrefabItem>();
            foreach (var p in m.Prefabs) prefabByUid[p.Uid] = p;
            foreach (var c in m.MapItems.OfType<TsCompanyItem>())
            {
                if (c.Position.IsEmpty) continue;
                var entry = new List<int>();
                TsPrefabItem cp;
                if (prefabByUid.TryGetValue(c.PrefabUid, out cp) && cp.Nodes != null)
                    foreach (var nu in cp.Nodes) { var ni = NodeIndex(nu); if (ni >= 0) entry.Add(ni); }
                var sbc = new StringBuilder();
                sbc.Append("[\"").Append(ScsToken.TokenToString(c.CompanyToken)).Append("\",\"")
                   .Append(ScsToken.TokenToString(c.CityToken)).Append("\",")
                   .Append(F(c.Position.X)).Append(',').Append(F(c.Position.Y)).Append(',')
                   .Append(ItemOf(itemIdx, c.PrefabUid).ToString(Inv)).Append(",[")
                   .Append(string.Join(",", entry.Select(x => x.ToString(Inv)))).Append("]]");
                companyJson.Add(sbc.ToString());
            }

            Directory.CreateDirectory(dir);
            var path = Path.Combine(dir, "navegacao.json");
            var cityCount = 0;
            using (var w = new StreamWriter(path, false, new UTF8Encoding(false), 1 << 20))
            {
                w.Write("{\"versao\":2,\"gerado\":\"");
                w.Write(DateTime.UtcNow.ToString("o", Inv));
                w.Write("\",\"items\":");
                w.Write(itemIdx.Count.ToString(Inv));
                w.Write(",\"nodes\":[");
                for (var i = 0; i < nodes.Count; i++)
                {
                    var nd = nodes[i];
                    if (i > 0) w.Write(',');
                    w.Write('['); w.Write(F(nd.X)); w.Write(','); w.Write(F(nd.Z)); w.Write(',');
                    w.Write(ItemOf(itemIdx, nd.BackwardItemUid).ToString(Inv)); w.Write(',');
                    w.Write(ItemOf(itemIdx, nd.ForwardItemUid).ToString(Inv)); w.Write(']');
                }
                w.Write("],\"edges\":[");
                for (var i = 0; i < edges.Count; i++) { if (i > 0) w.Write(','); w.Write(edges[i]); }
                w.Write("],\"companies\":[");
                w.Write(string.Join(",", companyJson));
                w.Write("],\"cities\":[");
                var first = true;
                foreach (var city in m.Cities)
                {
                    if (city.City == null) continue;
                    if (!first) w.Write(',');
                    first = false;
                    w.Write("[\""); w.Write(ScsToken.TokenToString(city.City.Token)); w.Write("\",\"");
                    w.Write((city.City.Name ?? "").Replace("\\", "\\\\").Replace("\"", "\\\""));
                    w.Write("\","); w.Write(F(city.X)); w.Write(','); w.Write(F(city.Z)); w.Write(']');
                    cityCount++;
                }
                w.Write("]}");
            }

            var pontos = 0;
            try { pontos = Pontos.Escrever(m, dir); }
            catch (Exception ex) { Logger.Instance.Warning($"[navegacao] pontos falhou: {ex.Message}"); }

            var size = new FileInfo(path).Length / (1024.0 * 1024.0);
            var resumo = $"Navegacao exportada: {nodes.Count} nos, {roadEdges} trechos de estrada, {prefabEdges} conversoes em cruzamentos, " +
                         $"{companyJson.Count} empresas, {cityCount} cidades ({size:0.0} MB). Prefabs sem curvas: {prefabsSemCurva}, sem ligacao: {prefabsSemLigacao}.\n" +
                         $"Pontos parecidos com radar/lombada/etc.: {pontos} (veja pontos-resumo.txt).";
            Logger.Instance.Info(resumo);
            return resumo;
        }

        private static void Walk(TsPrefab pf, int startNode, List<int> path, float len, Dictionary<long, Tuple<float, List<int>>> best)
        {
            var last = path[path.Count - 1];
            var curve = pf.NavCurves[last];
            if (IsOutputLane(pf, last) || curve.NextLines.Count == 0 || path.Count > 24)
            {
                var end = EndNodeOf(pf, last, curve);
                if (end < 0) return;
                var key = ((long)startNode << 16) | (uint)end;
                Tuple<float, List<int>> cur;
                if (!best.TryGetValue(key, out cur) || len < cur.Item1) best[key] = Tuple.Create(len, new List<int>(path));
                return;
            }
            foreach (var next in curve.NextLines)
            {
                if (next < 0 || next >= pf.NavCurves.Count || path.Contains(next)) continue;
                path.Add(next);
                Walk(pf, startNode, path, len + pf.NavCurves[next].Length, best);
                path.RemoveAt(path.Count - 1);
            }
        }

        private static bool IsOutputLane(TsPrefab pf, int curveIndex)
        {
            for (var j = 0; j < pf.PrefabNodes.Count; j++)
                if (pf.PrefabNodes[j].OutputLanes.Contains(curveIndex)) return true;
            return false;
        }

        private static int EndNodeOf(TsPrefab pf, int curveIndex, TsPrefabCurve curve)
        {
            for (var j = 0; j < pf.PrefabNodes.Count; j++)
                if (pf.PrefabNodes[j].OutputLanes.Contains(curveIndex)) return j;
            var bestJ = -1;
            var bestD = 2f;
            for (var j = 0; j < pf.PrefabNodes.Count; j++)
            {
                var d = (float)Math.Sqrt(Math.Pow(pf.PrefabNodes[j].X - curve.EndX, 2) + Math.Pow(pf.PrefabNodes[j].Z - curve.EndZ, 2));
                if (d < bestD) { bestD = d; bestJ = j; }
            }
            return bestJ;
        }

        private static List<PointF> CurvePoints(TsPrefabCurve c)
        {
            var dx = c.EndX - c.StartX;
            var dz = c.EndZ - c.StartZ;
            var chord = (float)Math.Sqrt(dx * dx + dz * dz);
            var pts = new List<PointF>();
            if (chord < 0.01f) { pts.Add(new PointF(c.StartX, c.StartZ)); return pts; }
            var t0 = Forward(c.StartRotW, c.StartRotX, c.StartRotY, c.StartRotZ, dx, dz);
            var t1 = Forward(c.EndRotW, c.EndRotX, c.EndRotY, c.EndRotZ, dx, dz);
            var steps = Math.Max(2, Math.Min(10, (int)(chord / 8f) + 2));
            for (var i = 0; i <= steps; i++)
            {
                var s = i / (float)steps;
                pts.Add(new PointF((float)TsRoadLook.Hermite(s, c.StartX, c.EndX, t0.X * chord, t1.X * chord),
                                   (float)TsRoadLook.Hermite(s, c.StartZ, c.EndZ, t0.Y * chord, t1.Y * chord)));
            }
            return pts;
        }

        private static PointF Forward(float w, float x, float y, float z, float chordX, float chordZ)
        {
            double vx = 0, vy = 0, vz = -1;
            double tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
            double rx = vx + w * tx + (y * tz - z * ty);
            double rz = vz + w * tz + (x * ty - y * tx);
            var len = Math.Sqrt(rx * rx + rz * rz);
            if (len < 1e-6) return new PointF(chordX, chordZ);
            rx /= len; rz /= len;
            if (rx * chordX + rz * chordZ < 0) { rx = -rx; rz = -rz; }
            return new PointF((float)rx, (float)rz);
        }

        private static List<PointF> RoadPoints(TsNode s, TsNode e)
        {
            var sx = s.X; var sz = s.Z; var ex = e.X; var ez = e.Z;
            var radius = Math.Sqrt(Math.Pow(sx - ex, 2) + Math.Pow(sz - ez, 2));
            var tanSx = Math.Cos(-(Math.PI * 0.5f - s.Rotation)) * radius;
            var tanEx = Math.Cos(-(Math.PI * 0.5f - e.Rotation)) * radius;
            var tanSz = Math.Sin(-(Math.PI * 0.5f - s.Rotation)) * radius;
            var tanEz = Math.Sin(-(Math.PI * 0.5f - e.Rotation)) * radius;
            var steps = Math.Max(2, Math.Min(16, (int)(radius / 20) + 2));
            var pts = new List<PointF>();
            for (var i = 0; i <= steps; i++)
            {
                var t = i / (float)steps;
                pts.Add(new PointF((float)TsRoadLook.Hermite(t, sx, ex, tanSx, tanEx), (float)TsRoadLook.Hermite(t, sz, ez, tanSz, tanEz)));
            }
            return pts;
        }

        private static float Dist(PointF a, PointF b) { return (float)Math.Sqrt((a.X - b.X) * (a.X - b.X) + (a.Y - b.Y) * (a.Y - b.Y)); }

        private static float PolyLength(List<PointF> pts)
        {
            float l = 0;
            for (var i = 1; i < pts.Count; i++) l += Dist(pts[i - 1], pts[i]);
            return l;
        }

        private static int ItemOf(Dictionary<ulong, int> itemIdx, ulong uid)
        {
            int i;
            return uid != 0 && itemIdx.TryGetValue(uid, out i) ? i : -1;
        }

        private static string F(float v) { return Math.Round(v, 1).ToString("0.#", Inv); }

        private static string EdgeJson(int from, int to, int item, float len, int kind, List<PointF> pts)
        {
            var sb = new StringBuilder(32 + pts.Count * 16);
            sb.Append('[').Append(from.ToString(Inv)).Append(',').Append(to.ToString(Inv)).Append(',')
              .Append(item.ToString(Inv)).Append(',').Append(F(len)).Append(',').Append(kind).Append(",[");
            for (var i = 0; i < pts.Count; i++)
            {
                if (i > 0) sb.Append(',');
                sb.Append(F(pts[i].X)).Append(',').Append(F(pts[i].Y));
            }
            sb.Append("]]");
            return sb.ToString();
        }
    }
}
