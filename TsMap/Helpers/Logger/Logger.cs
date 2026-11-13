using System;
using System.Collections.Concurrent;
using System.IO;
using System.Runtime.CompilerServices;
using System.Threading.Tasks;
using TsMap.Common;

namespace TsMap.Helpers.Logger
{
    /// <summary>
    /// Logger class, logs data to file located in "%localappdata%/ts/TsMap.log"
    /// </summary>
    public class Logger
    {
        private readonly BlockingCollection<LogLine> _bc = new BlockingCollection<LogLine>();

        private static readonly Lazy<Logger> _instance = new Lazy<Logger>(() => new Logger());
        private readonly FileStream _fs;
        private readonly StreamWriter _sw;

        public static Logger Instance => _instance.Value;

        public Logger()
        {
            var logDirPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ts-map");
            if (!Directory.Exists(logDirPath)) Directory.CreateDirectory(logDirPath);

            // Eucatur: se outra janela do ts-map estiver com o log aberto, usa outro arquivo em vez de travar.
            try
            {
                _fs = new FileStream(Path.Combine(logDirPath, "TsMap.log"), FileMode.Create, FileAccess.Write, FileShare.ReadWrite);
            }
            catch (IOException)
            {
                _fs = new FileStream(Path.Combine(logDirPath, $"TsMap-{System.Diagnostics.Process.GetCurrentProcess().Id}.log"), FileMode.Create, FileAccess.Write, FileShare.ReadWrite);
            }
            _sw = new StreamWriter(_fs);
            Task.Run(() =>
            {
                foreach (var logLine in _bc.GetConsumingEnumerable())
                {
                    var text = $"[{logLine.Time}|{logLine.Type,7}] [{logLine.CallerPath}::{logLine.Caller}] {logLine.Msg}";

                    _sw.WriteLine(text);
                    _sw.Flush();
                    Console.WriteLine(text);
                }
            });
        }

        public void Debug(string msg, [CallerMemberName] string callerName = "", [CallerFilePath] string callerPath = "")
        {
            if (Consts.MinimumLogLevel <= LogLevel.Debug)
            {
                _bc.Add(new LogLine(LogLevel.Debug, msg, callerName, callerPath));
            }
        }

        public void Info(string msg, [CallerMemberName] string callerName = "", [CallerFilePath] string callerPath = "")
        {
            if (Consts.MinimumLogLevel <= LogLevel.Info)
            {
                _bc.Add(new LogLine(LogLevel.Info, msg, callerName, callerPath));
            }
        }

        public void Warning(string msg, [CallerMemberName] string callerName = "", [CallerFilePath] string callerPath = "")
        {
            if (Consts.MinimumLogLevel <= LogLevel.Warning)
            {
                _bc.Add(new LogLine(LogLevel.Warning, msg, callerName, callerPath));
            }
        }

        public void Error(string msg, [CallerMemberName] string callerName = "", [CallerFilePath] string callerPath = "")
        {
            if (Consts.MinimumLogLevel <= LogLevel.Error)
            {
                _bc.Add(new LogLine(LogLevel.Error, msg, callerName, callerPath));
            }
        }
    }
}
