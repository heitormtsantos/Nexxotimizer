using System.Collections.ObjectModel;
using Microsoft.Extensions.Logging;
using Microsoft.Win32;
using optimizerDuck.Domain.Abstractions;
using optimizerDuck.Domain.Attributes;
using optimizerDuck.Domain.Optimizations.Models;
using optimizerDuck.Domain.Optimizations.Models.Services;
using optimizerDuck.Domain.UI;
using optimizerDuck.Services.Configuration;
using optimizerDuck.Services.Optimization.Providers;
using optimizerDuck.UI.Pages.Optimize.Categories;

namespace optimizerDuck.Domain.Optimizations.Categories;

[OptimizationCategory(typeof(PerformanceOptimizerPage))]
public class Performance : IOptimizationCategory
{
    public string Name => "Desempenho";
    public OptimizationCategoryOrder Order { get; init; } = OptimizationCategoryOrder.Performance;
    public ObservableCollection<IOptimization> Optimizations { get; init; } = [];

    [Optimization(
        Id = "648EC19A-FDA5-4607-8A7C-148B8B05FB4C",
        Risk = OptimizationRisk.Moderate,
        Tags = OptimizationTags.System | OptimizationTags.Performance | OptimizationTags.Ram
    )]
    public class DisableBackgroundApps : BaseOptimization
    {
        public override Task<ApplyResult> ApplyAsync(
            IProgress<ProcessingProgress> progress,
            OptimizationContext context
        )
        {
            RegistryService.Write(
                new RegistryItem(
                    @"HKCU\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications",
                    "GlobalUserDisabled",
                    1
                ),
                new RegistryItem(
                    @"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Search",
                    "BackgroundAppGlobalToggle",
                    0
                )
            );
            context.Logger.LogInformation("Disabled background apps");
            return Task.FromResult(CompleteFromScope());
        }
    }

    [Optimization(
        Id = "CD436A05-51F1-46E9-B4DE-5262EE7F812A",
        Risk = OptimizationRisk.Moderate,
        Tags = OptimizationTags.System | OptimizationTags.Performance | OptimizationTags.Ram
    )]
    public class SvcHostSplit : BaseOptimization
    {
        public override Task<ApplyResult> ApplyAsync(
            IProgress<ProcessingProgress> progress,
            OptimizationContext context
        )
        {
            if (context.Snapshot.Ram.TotalKB <= 0)
            {
                context.Logger.LogInformation(
                    "Invalid RAM value: {RamTotalKB}. Skipping...",
                    context.Snapshot.Ram.TotalKB
                );
                return Task.FromResult(
                    ApplyResult.False(
                        string.Format(
                            Loc.Instance[$"{ErrorPrefix}.InvalidRAM"],
                            context.Snapshot.Ram.TotalKB
                        )
                    )
                );
            }

            RegistryService.Write(
                new RegistryItem(
                    @"HKLM\SYSTEM\CurrentControlSet\Control",
                    "SvcHostSplitThresholdInKB",
                    context.Snapshot.Ram.TotalKB,
                    RegistryValueKind.DWord
                )
            );
            context.Logger.LogInformation(
                "Enabled service host splitting with threshold: {ThresholdKB} KB",
                context.Snapshot.Ram.TotalKB
            );
            return Task.FromResult(CompleteFromScope());
        }
    }

    [Optimization(
        Id = "C51E4187-BE49-4376-A97D-46C967A033B5",
        Risk = OptimizationRisk.Safe,
        Tags = OptimizationTags.System | OptimizationTags.Performance
    )]
    public class ProcessPriority : BaseOptimization
    {
        public override Task<ApplyResult> ApplyAsync(
            IProgress<ProcessingProgress> progress,
            OptimizationContext context
        )
        {
            /*
             ref: https://forums.blurbusters.com/viewtopic.php?t=8535
            42 Dec, 2A Hex = Short, Fixed , High foreground boost.
            41 Dec, 29 Hex = Short, Fixed , Medium foreground boost.
            40 Dec, 28 Hex = Short, Fixed , No foreground boost.

            38 Dec, 26 Hex = Short, Variable , High foreground boost.
            37 Dec, 25 Hex = Short, Variable , Medium foreground boost.
            36 Dec, 24 Hex = Short, Variable , No foreground boost.

            26 Dec, 1A Hex = Long, Fixed, High foreground boost.
            25 Dec, 19 Hex = Long, Fixed, Medium foreground boost.
            24 Dec, 18 Hex = Long, Fixed, No foreground boost.

            22 Dec, 16 Hex = Long, Variable, High foreground boost.
            21 Dec, 15 Hex = Long, Variable, Medium foreground boost.
            20 Dec, 14 Hex = Long, Variable, No foreground boost.
             */

            const int win32Priority = 38; // Short, Variable, High foreground boost

            RegistryService.Write(
                new RegistryItem(
                    @"HKLM\SYSTEM\CurrentControlSet\Control\PriorityControl",
                    "Win32PrioritySeparation",
                    win32Priority
                )
            );
            context.Logger.LogInformation(
                "Enabled foreground boost with priority: {Priority}",
                win32Priority
            );
            return Task.FromResult(CompleteFromScope());
        }
    }

    [Optimization(
        Id = "FFB49D94-CCA9-4591-B329-6FDA3A2758F9",
        Risk = OptimizationRisk.Safe,
        Tags = OptimizationTags.System
            | OptimizationTags.Performance
            | OptimizationTags.Latency
            | OptimizationTags.Audio
            | OptimizationTags.Display
    )]
    public class OptimizeMultimediaScheduler : BaseOptimization
    {
        public override Task<ApplyResult> ApplyAsync(
            IProgress<ProcessingProgress> progress,
            OptimizationContext context
        )
        {
            const string systemProfileKey =
                @"HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile";

            // Parent SystemProfile settings (NoLazyMode, AlwaysOn, NetworkThrottlingIndex, SystemResponsiveness)
            RegistryService.Write(
                new RegistryItem(systemProfileKey, "NoLazyMode", 1),
                new RegistryItem(systemProfileKey, "AlwaysOn", 1),
                new RegistryItem(
                    systemProfileKey,
                    "NetworkThrottlingIndex",
                    unchecked((int)0xFFFFFFFF),
                    RegistryValueKind.DWord
                ),
                new RegistryItem(
                    systemProfileKey,
                    "SystemResponsiveness",
                    10,
                    RegistryValueKind.DWord
                ) // minimum possible value (Values below 10 and above 100 are clamped to 20.)
            );

            // Games task scheduling (Priority, Scheduling Category, SFIO Priority, GPU Priority)
            RegistryService.Write(
                new RegistryItem($@"{systemProfileKey}\Tasks\Games", "Priority", 2),
                new RegistryItem($@"{systemProfileKey}\Tasks\Games", "Scheduling Category", "High"),
                new RegistryItem($@"{systemProfileKey}\Tasks\Games", "SFIO Priority", "High"),
                new RegistryItem($@"{systemProfileKey}\Tasks\Games", "GPU Priority", 8)
            );

            context.Logger.LogInformation(
                "Optimized Multimedia Class Scheduler Service (MMCSS) for gaming and low latency"
            );
            return Task.FromResult(CompleteFromScope());
        }
    }

    [Optimization(
        Id = "613FE85C-770D-441C-B97A-147B89B99028",
        Risk = OptimizationRisk.Safe,
        Tags = OptimizationTags.Latency | OptimizationTags.System | OptimizationTags.Performance
    )]
    public class KeyboardLatencyOptimization : BaseOptimization
    {
        public override Task<ApplyResult> ApplyAsync(
            IProgress<ProcessingProgress> progress,
            OptimizationContext context
        )
        {
            RegistryService.Write(
                new RegistryItem(@"HKEY_CURRENT_USER\Control Panel\Keyboard", "KeyboardDelay", "0"),
                new RegistryItem(@"HKEY_CURRENT_USER\Control Panel\Keyboard", "KeyboardSpeed", "31")
            );

            context.Logger.LogInformation("Optimized keyboard repeat settings");
            return Task.FromResult(CompleteFromScope());
        }
    }

    [Optimization(
        Id = "DCA57CA7-BA27-4A4D-AE1B-3F8B58DDFD6E",
        Risk = OptimizationRisk.Moderate,
        Tags = OptimizationTags.Latency | OptimizationTags.System | OptimizationTags.Performance
    )]
    public class OptimizeMouseAndKeyboardQueues : BaseOptimization
    {
        public override Task<ApplyResult> ApplyAsync(
            IProgress<ProcessingProgress> progress,
            OptimizationContext context
        )
        {
            RegistryService.Write(
                new RegistryItem(
                    @"HKLM\SYSTEM\CurrentControlSet\Services\mouclass\Parameters",
                    "MouseDataQueueSize",
                    40
                ),
                new RegistryItem(
                    @"HKLM\SYSTEM\CurrentControlSet\Services\kbdclass\Parameters",
                    "KeyboardDataQueueSize",
                    40
                ),
                new RegistryItem(@"HKCU\Control Panel\Accessibility\MouseKeys", "Flags", "0")
            );

            context.Logger.LogInformation("Optimized mouse and keyboard queue sizes");
            return Task.FromResult(CompleteFromScope());
        }
    }

    [Optimization(
        Id = "E1794E77-1C79-42F1-A5A6-F4124B8D5C12",
        Risk = OptimizationRisk.Moderate,
        Tags = OptimizationTags.Disk | OptimizationTags.Ram | OptimizationTags.Performance
    )]
    public class OptimizeStorageAndMemoryBehavior : BaseOptimization
    {
        public override async Task<ApplyResult> ApplyAsync(
            IProgress<ProcessingProgress> progress,
            OptimizationContext context
        )
        {
            RegistryService.Write(
                new RegistryItem(
                    @"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters",
                    "EnablePrefetch",
                    0
                ),
                new RegistryItem(
                    @"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management\PrefetchParameters",
                    "EnableSuperfetch",
                    0
                )
            );

            await ShellService.CMDAsync(
                "fsutil behavior set memoryusage 2",
                "fsutil behavior set memoryusage 1"
            );
            await ShellService.CMDAsync(
                "fsutil behavior set disabledeletenotify 0",
                "fsutil behavior set disabledeletenotify 0"
            );

            context.Logger.LogInformation("Optimized storage TRIM and memory behavior");
            return CompleteFromScope();
        }
    }

    [Optimization(
        Id = "F6B0D8D9-4A9E-4A08-AB8E-0C5D802313C8",
        Risk = OptimizationRisk.Risky,
        Tags = OptimizationTags.System | OptimizationTags.Performance | OptimizationTags.Latency
    )]
    public class OptimizeBootTimers : BaseOptimization
    {
        public override async Task<ApplyResult> ApplyAsync(
            IProgress<ProcessingProgress> progress,
            OptimizationContext context
        )
        {
            await ShellService.CMDAsync(
                "bcdedit /set useplatformtick yes",
                "bcdedit /deletevalue useplatformtick"
            );
            await ShellService.CMDAsync(
                "bcdedit /set disabledynamictick yes",
                "bcdedit /deletevalue disabledynamictick"
            );
            await ShellService.CMDAsync(
                "bcdedit /deletevalue useplatformclock",
                "bcdedit /deletevalue useplatformclock",
                ShellPolicy.From(result =>
                    result.ExitCode == 0
                    || result.Stderr.Contains(
                        "elemento de dados",
                        StringComparison.OrdinalIgnoreCase
                    )
                    || result.Stderr.Contains(
                        "data element",
                        StringComparison.OrdinalIgnoreCase
                    )
                )
            );

            context.Logger.LogInformation("Optimized Windows boot timer configuration with bcdedit");
            return CompleteFromScope();
        }
    }

    [Optimization(
        Id = "B7BB32F8-C756-47A4-83F2-F6E7EC7D45B8",
        Risk = OptimizationRisk.Moderate,
        Tags = OptimizationTags.Latency | OptimizationTags.System
    )]
    public class DisableAccessibilityKeyboardHotkeys : BaseOptimization
    {
        public override Task<ApplyResult> ApplyAsync(
            IProgress<ProcessingProgress> progress,
            OptimizationContext context
        )
        {
            RegistryService.Write(
                new RegistryItem(
                    @"HKEY_CURRENT_USER\Control Panel\Accessibility\StickyKeys",
                    "Flags",
                    "26"
                ),
                new RegistryItem(
                    @"HKEY_CURRENT_USER\Control Panel\Accessibility\Keyboard Response",
                    "Flags",
                    "2"
                ),
                new RegistryItem(
                    @"HKEY_CURRENT_USER\Control Panel\Accessibility\ToggleKeys",
                    "Flags",
                    "34"
                )
            );

            context.Logger.LogInformation("Disabled accessibility keyboard hotkeys");
            return Task.FromResult(CompleteFromScope());
        }
    }
}
