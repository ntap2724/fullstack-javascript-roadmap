using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

public static class WindowsJobHost
{
    private const uint CreateSuspended = 0x00000004;
    private const uint CreateBreakawayFromJob = 0x01000000;
    private const uint CreateUnicodeEnvironment = 0x00000400;
    private const uint CreateNoWindow = 0x08000000;
    private const uint GenericRead = 0x80000000;
    private const uint FileShareRead = 0x00000001;
    private const uint FileShareWrite = 0x00000002;
    private const uint OpenExisting = 3;
    private const uint FileAttributeNormal = 0x00000080;
    private const uint HandleFlagInherit = 0x00000001;
    private const uint StdOutputHandle = 0xFFFFFFF5;
    private const uint StdErrorHandle = 0xFFFFFFF4;
    private const uint JobObjectExtendedLimitInformation = 9;
    private const uint JobObjectBasicAccountingInformation = 1;
    private const uint JobObjectLimitKillOnJobClose = 0x00002000;
    private const uint StillActive = 259;
    private const uint WaitObject0 = 0x00000000;
    private const uint Infinite = 0xFFFFFFFF;
    private const uint TerminateExitCode = 0xC000013A;
    private const int InvalidHandleValue = -1;

    public static int Main(string[] args)
    {
        string statusPath = null;
        try
        {
            Payload payload = Payload.Load(args);
            statusPath = payload.StatusPath;
            HostResult result = Execute(payload);
            WriteStatus(statusPath, result);
            return result.Success ? 0 : 255;
        }
        catch
        {
            if (!String.IsNullOrEmpty(statusPath))
            {
                TryWriteFailure(statusPath, "PROTOCOL");
            }
            return 255;
        }
    }

    private static HostResult Execute(Payload payload)
    {
        IntPtr job = IntPtr.Zero;
        IntPtr stdoutHandle = IntPtr.Zero;
        IntPtr stderrHandle = IntPtr.Zero;
        IntPtr stdinHandle = IntPtr.Zero;
        PROCESS_INFORMATION process = new PROCESS_INFORMATION();
        bool processCreated = false;
        bool processWaitCompleted = false;

        try
        {
            job = CreateKillOnCloseJob();
            if (job == IntPtr.Zero)
            {
                return HostResult.Failure("SETUP");
            }

            stdoutHandle = GetStdHandle(StdOutputHandle);
            stderrHandle = GetStdHandle(StdErrorHandle);
            if (!IsUsableHandle(stdoutHandle) ||
                !IsUsableHandle(stderrHandle) ||
                !SetHandleInformation(stdoutHandle, HandleFlagInherit, HandleFlagInherit) ||
                !SetHandleInformation(stderrHandle, HandleFlagInherit, HandleFlagInherit))
            {
                return HostResult.Failure("SETUP");
            }

            SECURITY_ATTRIBUTES pipeAttributes = InheritableSecurityAttributes();
            stdinHandle = CreateFile(
                "NUL",
                GenericRead,
                FileShareRead | FileShareWrite,
                ref pipeAttributes,
                OpenExisting,
                FileAttributeNormal,
                IntPtr.Zero);
            if (!IsUsableHandle(stdinHandle))
            {
                return HostResult.Failure("SETUP");
            }

            LaunchInfo launch = ResolveLaunch(payload.Command, payload.Arguments, payload.Cwd);
            if (launch == null)
            {
                return HostResult.Failure("SETUP");
            }

            STARTUPINFO startup = new STARTUPINFO();
            startup.cb = Marshal.SizeOf(typeof(STARTUPINFO));
            startup.dwFlags = 0x00000100;
            startup.hStdInput = stdinHandle;
            startup.hStdOutput = stdoutHandle;
            startup.hStdError = stderrHandle;

            SECURITY_ATTRIBUTES processAttributes = InheritableSecurityAttributes();
            SECURITY_ATTRIBUTES threadAttributes = InheritableSecurityAttributes();
            if (!CreateProcess(
                launch.ApplicationName,
                new StringBuilder(launch.CommandLine),
                ref processAttributes,
                ref threadAttributes,
                true,
                CreateSuspended | CreateBreakawayFromJob | CreateUnicodeEnvironment | CreateNoWindow,
                IntPtr.Zero,
                payload.Cwd,
                ref startup,
                out process))
            {
                return HostResult.Failure("SETUP");
            }
            processCreated = true;

            CloseAndClear(ref stdinHandle);
            CloseAndClear(ref stdoutHandle);
            CloseAndClear(ref stderrHandle);

            if (!AssignProcessToJobObject(job, process.hProcess))
            {
                return HostResult.Failure("ASSIGN");
            }

            if (ResumeThread(process.hThread) == UInt32.MaxValue)
            {
                return HostResult.Failure("ASSIGN");
            }
            WriteReady(payload.ReadyPath);

            if (WaitForSingleObject(process.hProcess, Infinite) != WaitObject0)
            {
                return HostResult.Failure("CONTAINMENT");
            }
            processWaitCompleted = true;

            uint exitCode;
            if (!GetExitCodeProcess(process.hProcess, out exitCode))
            {
                return HostResult.Failure("CONTAINMENT");
            }

            string containmentFailurePhase;
            if (!TerminateAndConfirmJob(job, out containmentFailurePhase))
            {
                return HostResult.Failure(containmentFailurePhase);
            }

            return HostResult.Successful(exitCode);
        }
        catch
        {
            return HostResult.Failure("CONTAINMENT");
        }
        finally
        {
            if (processCreated && !processWaitCompleted && process.hProcess != IntPtr.Zero)
            {
                try
                {
                    TerminateProcess(process.hProcess, 1);
                    WaitForSingleObject(process.hProcess, 2000);
                }
                catch
                {
                    // The job close below is the final containment boundary.
                }
            }
            CloseAndClear(ref stdoutHandle);
            CloseAndClear(ref stderrHandle);
            CloseAndClear(ref stdinHandle);
            CloseAndClear(ref process.hThread);
            CloseAndClear(ref process.hProcess);
            CloseAndClear(ref job);
        }
    }

    private static IntPtr CreateKillOnCloseJob()
    {
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero)
        {
            return IntPtr.Zero;
        }

        JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        limits.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
        IntPtr buffer = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION)));
        try
        {
            Marshal.StructureToPtr(limits, buffer, false);
            if (!SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                buffer,
                (uint)Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION))))
            {
                CloseHandle(job);
                return IntPtr.Zero;
            }
            return job;
        }
        finally
        {
            Marshal.FreeHGlobal(buffer);
        }
    }

    private static bool TerminateAndConfirmJob(IntPtr job, out string failurePhase)
    {
        uint activeProcesses;
        if (!TryGetActiveProcessCount(job, out activeProcesses))
        {
            failurePhase = "CONTAINMENT_QUERY";
            return false;
        }
        if (activeProcesses > 0 && !TerminateJobObject(job, TerminateExitCode))
        {
            failurePhase = "CONTAINMENT_TERMINATE";
            return false;
        }

        if (WaitForSingleObject(job, 2000) != WaitObject0)
        {
            failurePhase = "CONTAINMENT_WAIT";
            return false;
        }
        failurePhase = String.Empty;
        return true;
    }

    private static bool TryGetActiveProcessCount(IntPtr job, out uint activeProcesses)
    {
        JOBOBJECT_BASIC_ACCOUNTING_INFORMATION information =
            new JOBOBJECT_BASIC_ACCOUNTING_INFORMATION();
        uint returned;
        if (!QueryInformationJobObject(
            job,
            JobObjectBasicAccountingInformation,
            out information,
            (uint)Marshal.SizeOf(typeof(JOBOBJECT_BASIC_ACCOUNTING_INFORMATION)),
            out returned))
        {
            activeProcesses = 0;
            return false;
        }
        activeProcesses = information.ActiveProcesses;
        return true;
    }

    private static LaunchInfo ResolveLaunch(string command, IList<string> arguments, string cwd)
    {
        string executable = FindExecutable(command, cwd);
        if (String.IsNullOrEmpty(executable))
        {
            return null;
        }
        string extension = Path.GetExtension(executable).ToLowerInvariant();
        if (extension == ".cmd" || extension == ".bat")
        {
            string comspec = Environment.GetEnvironmentVariable("ComSpec");
            if (String.IsNullOrEmpty(comspec))
            {
                comspec = "cmd.exe";
            }
            StringBuilder shellCommand = new StringBuilder();
            shellCommand.Append(EscapeCommand(executable));
            bool doubleEscape = executable.IndexOf("\\node_modules\\.bin\\", StringComparison.OrdinalIgnoreCase) >= 0;
            for (int index = 0; index < arguments.Count; index += 1)
            {
                shellCommand.Append(' ');
                shellCommand.Append(EscapeArgument(arguments[index], doubleEscape));
            }
            string commandLine = "/d /s /c \"" + shellCommand.ToString() + "\"";
            return new LaunchInfo(comspec, commandLine);
        }

        StringBuilder directCommandLine = new StringBuilder();
        directCommandLine.Append(QuoteWindowsArgument(executable));
        for (int index = 0; index < arguments.Count; index += 1)
        {
            directCommandLine.Append(' ');
            directCommandLine.Append(QuoteWindowsArgument(arguments[index]));
        }
        return new LaunchInfo(executable, directCommandLine.ToString());
    }

    private static string FindExecutable(string command, string cwd)
    {
        bool hasPath = command.IndexOf('\\') >= 0 || command.IndexOf('/') >= 0 || Path.IsPathRooted(command);
        if (hasPath)
        {
            string candidate = Path.IsPathRooted(command)
                ? command
                : Path.Combine(cwd, command);
            candidate = Path.GetFullPath(candidate);
            return ExistingExecutable(candidate);
        }

        string path = Environment.GetEnvironmentVariable("PATH") ?? String.Empty;
        string pathExt = Environment.GetEnvironmentVariable("PATHEXT") ?? ".COM;.EXE;.BAT;.CMD";
        string[] extensions = pathExt.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries);
        string[] directories = path.Split(new[] { ';' }, StringSplitOptions.None);
        for (int directoryIndex = 0; directoryIndex < directories.Length; directoryIndex += 1)
        {
            string directory = directories[directoryIndex];
            if (String.IsNullOrEmpty(directory))
            {
                directory = cwd;
            }
            string basePath = Path.Combine(directory, command);
            string existing;
            if (Path.GetExtension(command).Length == 0)
            {
                for (int extensionIndex = 0; extensionIndex < extensions.Length; extensionIndex += 1)
                {
                    existing = ExistingExecutable(basePath + extensions[extensionIndex]);
                    if (!String.IsNullOrEmpty(existing))
                    {
                        return existing;
                    }
                }
            }
            existing = ExistingExecutable(basePath);
            if (!String.IsNullOrEmpty(existing))
            {
                return existing;
            }
        }
        return null;
    }

    private static string ExistingExecutable(string candidate)
    {
        try
        {
            string full = Path.GetFullPath(candidate);
            return File.Exists(full) ? full : null;
        }
        catch
        {
            return null;
        }
    }

    private static string QuoteWindowsArgument(string value)
    {
        if (value.Length == 0)
        {
            return "\"\"";
        }
        StringBuilder result = new StringBuilder();
        result.Append('"');
        int backslashes = 0;
        for (int index = 0; index < value.Length; index += 1)
        {
            char character = value[index];
            if (character == '\\')
            {
                backslashes += 1;
                continue;
            }
            if (character == '"')
            {
                result.Append(new string('\\', backslashes * 2 + 1));
                result.Append('"');
                backslashes = 0;
                continue;
            }
            result.Append(new string('\\', backslashes));
            result.Append(character);
            backslashes = 0;
        }
        result.Append(new string('\\', backslashes * 2));
        result.Append('"');
        return result.ToString();
    }

    private static string EscapeCommand(string value)
    {
        return EscapeMetaCharacters(value, false);
    }

    private static string EscapeArgument(string value, bool doubleEscapeMetaCharacters)
    {
        StringBuilder quoted = new StringBuilder();
        quoted.Append('"');
        int backslashes = 0;
        for (int index = 0; index < value.Length; index += 1)
        {
            char character = value[index];
            if (character == '\\')
            {
                backslashes += 1;
                continue;
            }
            if (character == '"')
            {
                quoted.Append(new string('\\', backslashes * 2 + 1));
                quoted.Append('"');
                backslashes = 0;
                continue;
            }
            quoted.Append(new string('\\', backslashes));
            quoted.Append(character);
            backslashes = 0;
        }
        quoted.Append(new string('\\', backslashes * 2));
        quoted.Append('"');
        string escaped = EscapeMetaCharacters(quoted.ToString(), false);
        return doubleEscapeMetaCharacters ? EscapeMetaCharacters(escaped, false) : escaped;
    }

    private static string EscapeMetaCharacters(string value, bool unused)
    {
        const string metaCharacters = "()\\][%!^\"`<>&|;, *?";
        StringBuilder result = new StringBuilder();
        for (int index = 0; index < value.Length; index += 1)
        {
            char character = value[index];
            if (metaCharacters.IndexOf(character) >= 0)
            {
                result.Append('^');
            }
            result.Append(character);
        }
        return result.ToString();
    }

    private static SECURITY_ATTRIBUTES InheritableSecurityAttributes()
    {
        SECURITY_ATTRIBUTES attributes = new SECURITY_ATTRIBUTES();
        attributes.nLength = Marshal.SizeOf(typeof(SECURITY_ATTRIBUTES));
        attributes.bInheritHandle = true;
        return attributes;
    }

    private static bool IsUsableHandle(IntPtr handle)
    {
        return handle != IntPtr.Zero && handle.ToInt64() != InvalidHandleValue;
    }

    private static void CloseAndClear(ref IntPtr handle)
    {
        if (IsUsableHandle(handle))
        {
            CloseHandle(handle);
        }
        handle = IntPtr.Zero;
    }

    private static void WriteStatus(string path, HostResult result)
    {
        string content = result.Success
            ? "OK|" + result.ExitCode.ToString(CultureInfo.InvariantCulture)
            : "FAIL|" + result.Phase;
        File.WriteAllText(path, content + "\n", new UTF8Encoding(false));
    }

    private static void TryWriteFailure(string path, string phase)
    {
        try
        {
            File.WriteAllText(path, "FAIL|" + phase + "\n", new UTF8Encoding(false));
        }
        catch
        {
            // The caller treats a missing status as a protocol failure.
        }
    }

    private static void WriteReady(string path)
    {
        File.WriteAllText(path, "READY\n", new UTF8Encoding(false));
    }

    private sealed class Payload
    {
        public string Command;
        public List<string> Arguments;
        public string Cwd;
        public string StatusPath;
        public string ReadyPath;

        public static Payload Load(string[] args)
        {
            if (args == null || args.Length != 1)
            {
                throw new InvalidDataException();
            }
            string[] lines = File.ReadAllLines(args[0], Encoding.UTF8);
            if (lines.Length < 6 || lines[0] != "WP05-JOB-2")
            {
                throw new InvalidDataException();
            }
            Payload payload = new Payload();
            payload.Command = Decode(lines[1]);
            payload.Cwd = Decode(lines[2]);
            payload.StatusPath = Decode(lines[3]);
            payload.ReadyPath = Decode(lines[4]);
            int argumentCount = Int32.Parse(lines[5], CultureInfo.InvariantCulture);
            if (argumentCount < 0 || lines.Length != argumentCount + 6)
            {
                throw new InvalidDataException();
            }
            payload.Arguments = new List<string>();
            for (int index = 0; index < argumentCount; index += 1)
            {
                payload.Arguments.Add(Decode(lines[index + 6]));
            }
            return payload;
        }

        private static string Decode(string value)
        {
            return Encoding.UTF8.GetString(Convert.FromBase64String(value));
        }
    }

    private sealed class LaunchInfo
    {
        public readonly string ApplicationName;
        public readonly string CommandLine;

        public LaunchInfo(string applicationName, string commandLine)
        {
            ApplicationName = applicationName;
            CommandLine = commandLine;
        }
    }

    private sealed class HostResult
    {
        public readonly bool Success;
        public readonly string Phase;
        public readonly uint ExitCode;

        private HostResult(bool success, string phase, uint exitCode)
        {
            Success = success;
            Phase = phase;
            ExitCode = exitCode;
        }

        public static HostResult Successful(uint exitCode)
        {
            return new HostResult(true, String.Empty, exitCode);
        }

        public static HostResult Failure(string phase)
        {
            return new HostResult(false, phase, 255);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct SECURITY_ATTRIBUTES
    {
        public int nLength;
        public IntPtr lpSecurityDescriptor;
        [MarshalAs(UnmanagedType.Bool)] public bool bInheritHandle;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct STARTUPINFO
    {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public int dwX;
        public int dwY;
        public int dwXSize;
        public int dwYSize;
        public int dwXCountChars;
        public int dwYCountChars;
        public int dwFillAttribute;
        public int dwFlags;
        public short wShowWindow;
        public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput;
        public IntPtr hStdOutput;
        public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct PROCESS_INFORMATION
    {
        public IntPtr hProcess;
        public IntPtr hThread;
        public uint dwProcessId;
        public uint dwThreadId;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_LIMIT_INFORMATION
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IO_COUNTERS
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
    {
        public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
        public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JOBOBJECT_BASIC_ACCOUNTING_INFORMATION
    {
        public long TotalUserTime;
        public long TotalKernelTime;
        public long ThisPeriodTotalUserTime;
        public long ThisPeriodTotalKernelTime;
        public uint TotalProcesses;
        public uint ActiveProcesses;
        public uint TotalTerminatedProcesses;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        uint informationClass,
        IntPtr information,
        uint informationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool QueryInformationJobObject(
        IntPtr job,
        uint informationClass,
        out JOBOBJECT_BASIC_ACCOUNTING_INFORMATION information,
        uint informationLength,
        out uint returnLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TerminateJobObject(IntPtr job, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint ResumeThread(IntPtr thread);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetExitCodeProcess(IntPtr process, out uint exitCode);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetHandleInformation(
        IntPtr handle,
        uint mask,
        uint flags);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr GetStdHandle(uint standardHandle);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateFile(
        string name,
        uint desiredAccess,
        uint shareMode,
        ref SECURITY_ATTRIBUTES securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CreateProcess(
        string applicationName,
        StringBuilder commandLine,
        ref SECURITY_ATTRIBUTES processAttributes,
        ref SECURITY_ATTRIBUTES threadAttributes,
        [MarshalAs(UnmanagedType.Bool)] bool inheritHandles,
        uint creationFlags,
        IntPtr environment,
        string currentDirectory,
        ref STARTUPINFO startupInfo,
        out PROCESS_INFORMATION processInformation);
}
