using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using optimizerDuck.Services.System;
using Wpf.Ui.Abstractions.Controls;

namespace optimizerDuck.UI.ViewModels.Pages;

public partial class HomeViewModel : ObservableObject, INavigationAware
{
    private readonly ILogger<HomeViewModel> _logger;
    private readonly SystemInfoService _systemInfoService;
    private readonly DispatcherTimer _updateTimer;
    private bool _isRefreshingSilently;

    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private SystemSnapshot _systemInfo = SystemSnapshot.Unknown;

    public HomeViewModel(SystemInfoService systemInfoService, ILogger<HomeViewModel> logger)
    {
        _systemInfoService = systemInfoService;
        _logger = logger;

        _updateTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(2) };
        _updateTimer.Tick += async (_, _) => await RefreshRuntimeInfoAsync();
    }

    public DiskVolume? PrimaryVolume =>
        SystemInfo.Disk.Volumes.FirstOrDefault(volume => volume.IsSystemDrive)
        ?? SystemInfo.Disk.Volumes.FirstOrDefault();

    public double SystemHealthScore
    {
        get
        {
            var ramPressure = SystemInfo.Ram.UsedPercent <= 0 ? 35 : SystemInfo.Ram.UsedPercent;
            var diskPressure = PrimaryVolume?.UsedPercent ?? 35;
            var score = 100 - (ramPressure * 0.45) - (diskPressure * 0.25);
            return Math.Clamp(Math.Round(score), 0, 100);
        }
    }

    public double CurrentFps => Math.Clamp(Math.Round(86 + (SystemHealthScore * 0.62)), 60, 165);

    public string LastSessionSummary =>
        $"CPU: {SystemInfo.Cpu.Name}  |  RAM: {SystemInfo.Ram.UsedPercent:F0}% em uso";

    public string StorageSummary =>
        PrimaryVolume == null
            ? "Armazenamento indisponível"
            : $"{PrimaryVolume.DriveLetter} {PrimaryVolume.UsedPercent:F0}% ocupado";

    public async Task OnNavigatedToAsync()
    {
        await LoadAsync();
        _updateTimer.Start();
    }

    public Task OnNavigatedFromAsync()
    {
        _updateTimer.Stop();
        return Task.CompletedTask;
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        await LoadAsync();
    }

    private async Task LoadAsync()
    {
        if (IsLoading || _isRefreshingSilently)
            return;

        IsLoading = true;

        try
        {
            SystemInfo = await _systemInfoService.RefreshAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load home system summary");
        }
        finally
        {
            IsLoading = false;
        }
    }

    private async Task RefreshRuntimeInfoAsync()
    {
        if (IsLoading || _isRefreshingSilently)
            return;

        _isRefreshingSilently = true;

        try
        {
            SystemInfo = await _systemInfoService.RefreshAsync();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to refresh home runtime info");
        }
        finally
        {
            _isRefreshingSilently = false;
        }
    }

    partial void OnSystemInfoChanged(SystemSnapshot value)
    {
        OnPropertyChanged(nameof(PrimaryVolume));
        OnPropertyChanged(nameof(SystemHealthScore));
        OnPropertyChanged(nameof(CurrentFps));
        OnPropertyChanged(nameof(LastSessionSummary));
        OnPropertyChanged(nameof(StorageSummary));
    }
}
