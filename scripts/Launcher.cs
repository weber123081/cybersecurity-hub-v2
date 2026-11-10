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

        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("==================================================================");
        Console.WriteLine("        生活資安觀測站 · 便攜獨立版 (Portable Edition)");
        Console.WriteLine("==================================================================");
        Console.ResetColor();

        // 檢查是否在 Temp 解壓目錄下執行
        if (baseDir.IndexOf("Temp", StringComparison.OrdinalIgnoreCase) >= 0 ||
            baseDir.IndexOf("Temporary", StringComparison.OrdinalIgnoreCase) >= 0)
        {
            Console.ForegroundColor = ConsoleColor.Yellow;
            Console.WriteLine("[提醒] 您似乎直接在 ZIP 壓縮檔內執行！");
            Console.WriteLine("請先將 ZIP 壓縮檔「解壓縮至此資料夾」後，再執行本程式。");
            Console.ResetColor();
            Console.WriteLine("\n請按任意鍵結束...");
            Console.ReadKey();
            return;
        }

        string nodeExe = Path.Combine(baseDir, "runtime", "node.exe");
        if (!File.Exists(nodeExe))
        {
            nodeExe = "node.exe"; // Fallback to system node if runtime not found
        }

        string serverScript = Path.Combine(baseDir, "backend", "server.js");
        if (!File.Exists(serverScript))
        {
            Console.ForegroundColor = ConsoleColor.Red;
            Console.WriteLine("[錯誤] 找不到後端核心檔案: " + serverScript);
            Console.ResetColor();
            Console.WriteLine("請按任意鍵結束...");
            Console.ReadKey();
            return;
        }

        Console.WriteLine("[狀態] 正在檢查本機連接埠 3000...");
        bool alreadyRunning = IsPortOpen("127.0.0.1", 3000);

        if (!alreadyRunning)
        {
            Console.WriteLine("[狀態] 正在載入內建模組並啟動資安觀測站服務...");
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
                        if (e.Data.Contains("[Gemini AI]") || e.Data.Contains("[CRON]") || e.Data.Contains("[MAIL-CRON]") || e.Data.Contains("[ACTIVITY]") || e.Data.Contains("[API]"))
                        {
                            Console.WriteLine(e.Data);
                        }
                    }
                };
                nodeProcess.ErrorDataReceived += (s, e) => {
                    if (!string.IsNullOrEmpty(e.Data))
                    {
                        // 忽略 TLS 相關警告，其餘顯示
                        if (!e.Data.Contains("NODE_TLS_REJECT_UNAUTHORIZED"))
                        {
                            Console.WriteLine("[系統訊息] " + e.Data);
                        }
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
                Console.WriteLine("\n請按任意鍵結束...");
                Console.ReadKey();
                return;
            }

            // 等待伺服器就緒 (最多等待 15 秒)
            int attempts = 0;
            while (!IsPortOpen("127.0.0.1", 3000) && attempts < 30)
            {
                if (nodeProcess != null && nodeProcess.HasExited)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("[錯誤] 伺服器進程異常退出 (結束碼: " + nodeProcess.ExitCode + ")");
                    Console.ResetColor();
                    Console.WriteLine("建議執行「啟動生活資安觀測站.bat」查看詳細資訊。");
                    Console.WriteLine("\n請按任意鍵結束...");
                    Console.ReadKey();
                    return;
                }
                Thread.Sleep(500);
                attempts++;
            }

            if (!IsPortOpen("127.0.0.1", 3000))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[逾時] 伺服器啟動超過 15 秒未就緒。");
                Console.ResetColor();
                Console.WriteLine("請檢查防火牆或防毒軟體是否阻擋了本機通訊。");
                Console.WriteLine("\n請按任意鍵結束...");
                Console.ReadKey();
                return;
            }
        }
        else
        {
            Console.WriteLine("[注意] 偵測到本機 3000 連接埠已在運作中，將直接開啟網頁介面。");
        }

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("\n[成功] 生活資安觀測站已成功運作中！");
        Console.ResetColor();
        Console.WriteLine("------------------------------------------------------------------");
        Console.WriteLine("  * 公開生活防護前台: http://localhost:3000/");
        Console.WriteLine("  * 資訊中心管理後台: http://localhost:3000/admin.html");
        Console.WriteLine("------------------------------------------------------------------");
        Console.WriteLine("[提示] 預設瀏覽器即將自動開啟，此視窗縮小即可在背景持續運行。");
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
