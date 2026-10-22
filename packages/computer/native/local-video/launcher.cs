// Compiled during explicit Local Computer setup with Windows' built-in .NET
// compiler. Native lifetime code executes only in this isolated launcher.
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

internal static class LocalVideoLauncher
{
    private const uint KillOnJobClose = 0x2000;
    private const uint Suspended = 0x4;
    private const uint NoWindow = 0x08000000;
    private const uint ExtendedStartup = 0x80000;
    private const uint Synchronize = 0x00100000;
    private const uint WaitObject = 0;
    private const uint WaitTimeout = 258;
    private const int MaxLine = 128 * 1024;
    private static readonly object OutputLock = new object();
    private static readonly ManualResetEvent Stop = new ManualResetEvent(false);

    [StructLayout(LayoutKind.Sequential)]
    private struct SecurityAttributes { public int Length; public IntPtr Descriptor; public int Inherit; }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct StartupInfo
    {
        public int Size; public string Reserved; public string Desktop; public string Title;
        public uint X, Y, XSize, YSize, XCountChars, YCountChars, FillAttribute, Flags;
        public short ShowWindow, ReservedBytes; public IntPtr ReservedPointer, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct StartupInfoEx { public StartupInfo Startup; public IntPtr Attributes; }
    [StructLayout(LayoutKind.Sequential)]
    private struct ProcessInfo { public IntPtr Process, Thread; public uint ProcessId, ThreadId; }
    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimits
    {
        public long ProcessTime, JobTime; public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet; public uint ActiveProcessLimit;
        public UIntPtr Affinity; public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters { public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimits
    {
        public BasicLimits Basic; public IoCounters Io;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Accounting
    {
        public long User, Kernel, PeriodUser, PeriodKernel;
        public uint Faults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateJobObjectW(IntPtr security, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits info, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting info, uint length, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool CreatePipe(out IntPtr read, out IntPtr write, ref SecurityAttributes security, uint size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetHandleInformation(IntPtr handle, uint mask, uint flags);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, int flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returned);
    [DllImport("kernel32.dll")]
    private static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processSecurity,
        IntPtr threadSecurity, bool inherit, uint flags, IntPtr environment, string directory,
        ref StartupInfoEx startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    private static void Require(bool ok) { if (!ok) throw new InvalidOperationException("Native lifecycle operation failed"); }
    private static void Close(ref IntPtr handle) { if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; } }
    private static Thread Background(ThreadStart action)
    {
        var thread = new Thread(action); thread.IsBackground = true; thread.Start(); return thread;
    }
    private static string Quote(string value)
    {
        var result = new StringBuilder("\""); int slashes = 0;
        foreach (char character in value)
        {
            if (character == '\\') { slashes++; continue; }
            if (character == '"') { result.Append('\\', slashes * 2 + 1); result.Append('"'); }
            else { result.Append('\\', slashes); result.Append(character); }
            slashes = 0;
        }
        result.Append('\\', slashes * 2); return result.Append('"').ToString();
    }
    private static string JsonString(string value)
    {
        var output = new StringBuilder("\"");
        foreach (char character in value)
        {
            if (character == '"' || character == '\\') output.Append('\\').Append(character);
            else if (character < 32) output.Append("\\u").Append(((int)character).ToString("x4"));
            else output.Append(character);
        }
        return output.Append('"').ToString();
    }
    private static void Write(string json)
    {
        lock (OutputLock) { Console.Out.WriteLine(json); Console.Out.Flush(); }
    }
    private static bool WriteBounded(string json)
    {
        bool written = false;
        var thread = Background(delegate { try { Write(json); written = true; } catch { Stop.Set(); } });
        return thread.Join(150) && written;
    }
    private static bool DrainJob(IntPtr job)
    {
        // Keep the only job handle open while querying. Root death does not
        // destroy this authority, and no process can break away from this job.
        TerminateJobObject(job, 1);
        var deadline = Environment.TickCount + 1800;
        do
        {
            Accounting accounting;
            if (!QueryInformationJobObject(job, 1, out accounting, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero)) return false;
            if (accounting.ActiveProcesses == 0) return true;
            Thread.Sleep(20);
        } while (unchecked(Environment.TickCount - deadline) < 0);
        return false;
    }

    public static int Main(string[] args)
    {
        Guid launchGuid;
        if (args.Length != 4 || IntPtr.Size != 8 || !Guid.TryParse(args[3], out launchGuid)) return 2;
        string launchField = "\"launchId\":" + JsonString(args[3]);
        IntPtr job = IntPtr.Zero, host = IntPtr.Zero, childInput = IntPtr.Zero, parentInput = IntPtr.Zero;
        IntPtr childOutput = IntPtr.Zero, parentOutput = IntPtr.Zero, childError = IntPtr.Zero, parentError = IntPtr.Zero;
        IntPtr attributes = IntPtr.Zero, handles = IntPtr.Zero;
        bool attributesInitialized = false, assigned = false, ownershipAdvertised = false;
        ProcessInfo process = new ProcessInfo();
        int result = 1;
        try
        {
            uint hostId;
            Require(uint.TryParse(args[2], out hostId));
            // Hold the actual Host process object, not a repeatedly looked-up PID.
            host = OpenProcess(Synchronize, false, hostId);
            Require(host != IntPtr.Zero && WaitForSingleObject(host, 0) == WaitTimeout);
            job = CreateJobObjectW(IntPtr.Zero, null); // unnamed and non-inheritable
            Require(job != IntPtr.Zero);
            var limits = new ExtendedLimits(); limits.Basic.Flags = KillOnJobClose;
            Require(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(typeof(ExtendedLimits))));
            var security = new SecurityAttributes { Length = Marshal.SizeOf(typeof(SecurityAttributes)), Inherit = 1 };
            Require(CreatePipe(out childInput, out parentInput, ref security, 4096));
            Require(CreatePipe(out parentOutput, out childOutput, ref security, 4096));
            Require(CreatePipe(out parentError, out childError, ref security, 4096));
            Require(SetHandleInformation(parentInput, 1, 0));
            Require(SetHandleInformation(parentOutput, 1, 0));
            Require(SetHandleInformation(parentError, 1, 0));
            IntPtr bytes = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 1, 0, ref bytes);
            Require(bytes.ToInt64() > 0 && bytes.ToInt64() < 65536);
            attributes = Marshal.AllocHGlobal(bytes);
            Require(InitializeProcThreadAttributeList(attributes, 1, 0, ref bytes));
            attributesInitialized = true;
            handles = Marshal.AllocHGlobal(IntPtr.Size * 3);
            Marshal.WriteIntPtr(handles, 0, childInput);
            Marshal.WriteIntPtr(handles, IntPtr.Size, childOutput);
            Marshal.WriteIntPtr(handles, IntPtr.Size * 2, childError);
            Require(UpdateProcThreadAttribute(attributes, 0, new IntPtr(0x20002), handles, new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero));
            var startup = new StartupInfoEx();
            startup.Startup.Size = Marshal.SizeOf(typeof(StartupInfoEx));
            startup.Startup.Flags = 0x100 | 0x1; // only the three explicit std handles, hidden window
            startup.Startup.Input = childInput; startup.Startup.Output = childOutput; startup.Startup.Error = childError;
            startup.Attributes = attributes;
            Require(CreateProcessW(args[0], new StringBuilder(Quote(args[0]) + " " + Quote(args[1])),
                IntPtr.Zero, IntPtr.Zero, true, Suspended | NoWindow | ExtendedStartup, IntPtr.Zero,
                Path.GetDirectoryName(args[1]), ref startup, out process));
            // Electron cannot run a single instruction or create descendants
            // before this succeeds. Do not use Process.Start followed by assign.
            Require(AssignProcessToJobObject(job, process.Process)); assigned = true;
            ownershipAdvertised = WriteBounded("{" + launchField + ",\"event\":\"tree-owned\",\"version\":1,\"rootPid\":" + process.ProcessId + "}");
            Require(ownershipAdvertised && WaitForSingleObject(host, 0) == WaitTimeout);
            Require(ResumeThread(process.Thread) != UInt32.MaxValue);
            Close(ref childInput); Close(ref childOutput); Close(ref childError);

            var inputPipe = new FileStream(new SafeFileHandle(parentInput, false), FileAccess.Write, 4096, false);
            var outputPipe = new FileStream(new SafeFileHandle(parentOutput, false), FileAccess.Read, 4096, false);
            var errorPipe = new FileStream(new SafeFileHandle(parentError, false), FileAccess.Read, 4096, false);
            Background(delegate
            {
                try
                {
                    var input = Console.OpenStandardInput(); var buffer = new byte[4096]; int count;
                    while ((count = input.Read(buffer, 0, buffer.Length)) > 0) { inputPipe.Write(buffer, 0, count); inputPipe.Flush(); }
                }
                catch { }
                finally { Stop.Set(); }
            });
            Background(delegate
            {
                try
                {
                    var reader = new StreamReader(outputPipe, new UTF8Encoding(false, true), false, 4096);
                    var line = new StringBuilder(); int next;
                    while ((next = reader.Read()) != -1)
                    {
                        if (next == '\n')
                        {
                            // Child text is always escaped data in a helper envelope;
                            // it can never manufacture launcher tree-closed evidence.
                            Write("{" + launchField + ",\"event\":\"helper-message\",\"json\":" + JsonString(line.ToString()) + "}");
                            line.Clear();
                        }
                        else { line.Append((char)next); if (line.Length > MaxLine) throw new IOException("Protocol bound"); }
                    }
                }
                catch { Stop.Set(); }
            });
            Background(delegate
            {
                try { var buffer = new byte[4096]; while (errorPipe.Read(buffer, 0, buffer.Length) > 0) { } }
                catch { }
            });
            while (!Stop.WaitOne(50) && WaitForSingleObject(host, 0) == WaitTimeout &&
                WaitForSingleObject(process.Process, 0) == WaitTimeout) { }
            result = 0;
        }
        catch { result = 1; } // no source paths, native diagnostics or addresses on stdout
        finally
        {
            Stop.Set();
            bool stopped = false;
            if (assigned) stopped = DrainJob(job);
            else if (process.Process != IntPtr.Zero)
            {
                // Assignment/resume/setup failure must not leak a suspended process.
                TerminateProcess(process.Process, 1);
                stopped = WaitForSingleObject(process.Process, 1800) == WaitObject;
            }
            if (ownershipAdvertised && stopped)
            {
                if (!WriteBounded("{" + launchField + ",\"event\":\"tree-closed\",\"version\":1,\"activeProcesses\":0}")) result = 1;
            }
            else if (assigned || process.Process != IntPtr.Zero) result = 1;
            // Last-handle close also kills the job after launcher crash/forced exit.
            Close(ref job); Close(ref host); Close(ref process.Thread); Close(ref process.Process);
            Close(ref childInput); Close(ref childOutput); Close(ref childError);
            Close(ref parentInput); Close(ref parentOutput); Close(ref parentError);
            if (attributesInitialized) DeleteProcThreadAttributeList(attributes);
            if (attributes != IntPtr.Zero) Marshal.FreeHGlobal(attributes);
            if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles);
        }
        return result;
    }
}
