namespace TsMap.Helpers
{
    /// <summary>Eucatur: manipulacao de caminho sem validacao (mods tem nomes que o Windows recusa).</summary>
    internal static class SafePath
    {
        private static int LastSep(string p) { return System.Math.Max(p.LastIndexOf('/'), p.LastIndexOf('\\')); }
        public static string GetFileName(string p) { return p == null ? null : p.Substring(LastSep(p) + 1); }
        public static string GetExtension(string p)
        {
            if (p == null) return null;
            var n = GetFileName(p); var d = n.LastIndexOf('.');
            return d >= 0 ? n.Substring(d) : "";
        }
        public static string GetFileNameWithoutExtension(string p)
        {
            if (p == null) return null;
            var n = GetFileName(p); var d = n.LastIndexOf('.');
            return d >= 0 ? n.Substring(0, d) : n;
        }
        public static string GetDirectoryName(string p)
        {
            if (p == null) return null;
            var i = LastSep(p); return i >= 0 ? p.Substring(0, i) : "";
        }
        public static string Combine(string a, string b)
        {
            if (string.IsNullOrEmpty(a)) return b ?? "";
            if (string.IsNullOrEmpty(b)) return a;
            if (b.StartsWith("/") || b.StartsWith("\\")) return b;
            return a.EndsWith("/") || a.EndsWith("\\") ? a + b : a + "/" + b;
        }
    }
}
