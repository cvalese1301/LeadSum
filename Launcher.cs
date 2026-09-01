using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;

namespace LeadSumLauncher
{
    class Program
    {
        static Process serverProcess = null;

        static void Main(string[] args)
        {
            Console.Title = "LeadSum - Meta Ads Intelligence Launcher";
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine("==================================================================");
            Console.WriteLine("          LEADSUM - META ADS INTELLIGENCE DASHBOARD               ");
            Console.WriteLine("==================================================================");
            Console.ResetColor();

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            string serverFile = Path.Combine(baseDir, "server.js");

            if (!File.Exists(serverFile))
            {
                string subDirFile = Path.Combine(baseDir, "SponsorAds-main", "server.js");
                if (File.Exists(subDirFile))
                {
                    baseDir = Path.Combine(baseDir, "SponsorAds-main");
                    serverFile = subDirFile;
                }
            }

            if (!File.Exists(serverFile))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("[!] Errore: file server.js non trovato in: " + baseDir);
                Console.ResetColor();
                Console.WriteLine("\nPremi un tasto per uscire...");
                Console.ReadKey();
                return;
            }

            // Find node executable
            string nodePath = "node";
            if (!IsCommandAvailable("node"))
            {
                string[] possiblePaths = new string[]
                {
                    @"C:\Program Files\nodejs\node.exe",
                    @"C:\Program Files (x86)\nodejs\node.exe",
                    @"E:\nodjes\node.exe",
                    Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"npm\node.exe")
                };

                foreach (string path in possiblePaths)
                {
                    if (File.Exists(path))
                    {
                        nodePath = path;
                        break;
                    }
                }
            }

            Console.WriteLine("[*] Directory progetto: " + baseDir);

            // Check if server is already running on port 4173
            bool isAlreadyRunning = IsPortInUse(4173);

            if (!isAlreadyRunning)
            {
                Console.ForegroundColor = ConsoleColor.Yellow;
                Console.WriteLine("[*] Avvio server Node.js in corso...");
                Console.ResetColor();

                try
                {
                    ProcessStartInfo psi = new ProcessStartInfo();
                    psi.FileName = nodePath;
                    psi.Arguments = "server.js";
                    psi.WorkingDirectory = baseDir;
                    psi.UseShellExecute = false;
                    psi.CreateNoWindow = false;

                    serverProcess = Process.Start(psi);
                    Thread.Sleep(1200);
                }
                catch (Exception ex)
                {
                    Console.ForegroundColor = ConsoleColor.Red;
                    Console.WriteLine("[!] Impossibile avviare Node.js: " + ex.Message);
                    Console.ResetColor();
                    Console.WriteLine("\nAssicurati che Node.js sia installato.");
                    Console.ReadKey();
                    return;
                }
            }
            else
            {
                Console.ForegroundColor = ConsoleColor.Green;
                Console.WriteLine("[*] Il server LeadSum è già in esecuzione.");
                Console.ResetColor();
            }

            string url = "http://localhost:4173";
            Console.ForegroundColor = ConsoleColor.Green;
            Console.WriteLine("[✓] Server attivo all'indirizzo: " + url);
            Console.WriteLine("[*] Apertura browser in corso...");
            Console.ResetColor();

            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                Console.WriteLine("[!] Impossibile aprire automaticamente il browser: " + ex.Message);
            }

            Console.WriteLine("\n------------------------------------------------------------------");
            Console.ForegroundColor = ConsoleColor.White;
            Console.WriteLine(" -> LeadSum è attivo e pronto.");
            Console.WriteLine(" -> Per fermare l'applicazione, chiudi semplicemente questa finestra.");
            Console.WriteLine("------------------------------------------------------------------");
            Console.ResetColor();

            AppDomain.CurrentDomain.ProcessExit += (s, e) => KillServer();
            Console.CancelKeyPress += (s, e) => KillServer();

            if (serverProcess != null && !serverProcess.HasExited)
            {
                serverProcess.WaitForExit();
            }
            else
            {
                Console.WriteLine("\nPremi INVIO per uscire...");
                Console.ReadLine();
            }
        }

        static void KillServer()
        {
            if (serverProcess != null && !serverProcess.HasExited)
            {
                try
                {
                    serverProcess.Kill();
                }
                catch { }
            }
        }

        static bool IsCommandAvailable(string cmd)
        {
            try
            {
                Process p = new Process();
                p.StartInfo.FileName = cmd;
                p.StartInfo.Arguments = "-v";
                p.StartInfo.UseShellExecute = false;
                p.StartInfo.CreateNoWindow = true;
                p.Start();
                p.WaitForExit(1000);
                return p.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        }

        static bool IsPortInUse(int port)
        {
            try
            {
                using (TcpClient client = new TcpClient())
                {
                    var result = client.BeginConnect("127.0.0.1", port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(400);
                    if (success && client.Connected)
                    {
                        client.EndConnect(result);
                        return true;
                    }
                    return false;
                }
            }
            catch
            {
                return false;
            }
        }
    }
}
