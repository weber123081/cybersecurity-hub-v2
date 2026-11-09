using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Threading;

class Launcher
{
    private static Process nodeProcess = null;

    [DllImport("Kernel32")]
    private static extern bool SetConsoleCtrlHandler(EventHandler handler, bool add);

    private delegate bool EventHandler(CtrlType sig);
    private static EventHandler handler;

    private enum CtrlType
    {
        CTRL_C_EVENT = 0,
        CTRL_BREAK_EVENT = 1,
        CTRL_CLOSE_EVENT = 2,
        CTRL_LOGOFF_EVENT = 5,
        CTRL_SHUTDOWN_EVENT = 6
    }

    private static bool Handler(CtrlType sig)
    {
        KillNode();
        return false;
    }

    private static void KillNode()
    {
        try
        {
            if (nodeProcess != null && !nodeProcess.HasExited)
            {
                nodeProcess.Kill();
                nodeProcess.Dispose();
            }
        }
        catch { }
    }

    private static bool IsPortOpen(string host, int port)
    {
        try
        {
            using (var client = new TcpClient())
            {
                var result = client.BeginConnect(host, port, null, null);
                var success = result.AsyncWaitHandle.WaitOne(TimeSpan.FromMilliseconds(500));
                if (!success) return false;
                client.EndConnect(result);
                return true;
            }
        }
        catch
        {
            return false;
        }
    }

    static void Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.Title = "生活資安觀測站 · 便攜獨立版";

        handler = new EventHandler(Handler);
        SetConsoleCtrlHandler(handler, true);
        AppDomain.CurrentDomain.ProcessExit += (s, e) => KillNode();

        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string nodeExe = Path.Combine(baseDir, "runtime", "node.exe");
        if (!File.Exists(nodeExe))
        {
            nodeExe = "node.exe"; // Fallback to system node if runtime not found
        }

        string serverScript = Path.Combine(baseDir, "backend", "server.js");
        if (!File.Exists(serverScript))
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("[錯誤] 找不到後端啟動檔案: " + serverScript);
            Console.ResetColor();
            Console.WriteLine("請按任意鍵結束...");
            Console.ReadKey();
            return;
        }

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("==================================================================");
        Console.WriteLine("        生活資安觀測站 · 便攜獨立版 (Portable Edition)");
        Console.WriteLine("==================================================================");
        Console.ResetColor();
        Console.WriteLine("[狀態] 正在檢查本機連接埠 3000...");

        bool alreadyRunning = IsPortOpen("127.0.0.1", 3000);
        if (!alreadyRunning)
        {
            Console.WriteLine("[狀態] 正在啟動內建模組與背景服務...");
            var psi = new ProcessStartInfo
            {
                FileName = nodeExe,
                Arguments = "\"" + serverScript + "\"",
                WorkingDirectory = baseDir,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };

            try
            {
                nodeProcess = new Process { StartInfo = psi };
                nodeProcess.OutputDataReceived += (s, e) => {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        if (e.Data.Contains("[Gemini AI]") || e.Data.Contains("[CRON]") || e.Data.Contains("[MAIL-CRON]"))
                        {
                            Console.WriteLine(e.Data);
                        }
                    }
                };
                nodeProcess.ErrorDataReceived += (s, e) => {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        Console.WriteLine("[伺服器訊息] " + e.Data);
                    }
                };
                nodeProcess.Start();
                nodeProcess.BeginOutputReadLine();
                nodeProcess.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[啟動失敗] " + ex.Message);
                Console.ResetColor();
                Console.ReadKey();
                return;
            }

            // 等待伺服器就緒 (最多等待 10 秒)
            int attempts = 0;
            while (!IsPortOpen("127.0.0.1", 3000) && attempts < 20)
            {
                Thread.Sleep(500);
                attempts++;
            }
        }
        else
        {
            Console.WriteLine("[注意] 偵測到本機 3000 埠已在運作中，將直接開啟前端介面。");
        }

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("\n[成功] 生活資安觀測站已成功就緒！");
        Console.ResetColor();
        Console.WriteLine("------------------------------------------------------------------");
        Console.WriteLine("  * 公開生活防護前台: http://localhost:3000/");
        Console.WriteLine("  * 資訊中心管理後台: http://localhost:3000/admin.html");
        Console.WriteLine("------------------------------------------------------------------");
        Console.WriteLine("[提示] 預設瀏覽器即將自動彈出，此視窗縮小即可在背景持續運行。");
        Console.WriteLine("[提示] 欲停止服務，請直接關閉此視窗或按下 Ctrl + C 鍵。");
        Console.WriteLine("==================================================================\n");

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "http://localhost:3000/",
                UseShellExecute = true
            });
        }
        catch { }

        if (nodeProcess != null)
        {
            nodeProcess.WaitForExit();
        }
        else
        {
            Console.WriteLine("按任意鍵關閉此視窗...");
            Console.ReadKey();
        }
    }
}
