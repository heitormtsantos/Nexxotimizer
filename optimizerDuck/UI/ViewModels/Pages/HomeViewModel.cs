using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using optimizerDuck.Services.System;
using Wpf.Ui.Abstractions.Controls;

namespace optimizerDuck.UI.ViewModels.Pages;

public partial class HomeViewModel(
    SystemInfoService systemInfoService,
    ILogger<HomeViewModel> logger
) : ObservableObject, INavigationAware
{
    [ObservableProperty]
    private bool _isLoading;

    [ObservableProperty]
    private SystemSnapshot _systemInfo = SystemSnapshot.Unknown;

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

    public string SystemHealthLabel =>
        SystemHealthScore >= 75 ? "Ótimo"
        : SystemHealthScore >= 50 ? "Atenção"
        : "Crítico";

    public string LastSessionSummary =>
        $"CPU: {SystemInfo.Cpu.Name}  |  RAM: {SystemInfo.Ram.UsedPercent:F0}% em uso";

    public string StorageSummary =>
        PrimaryVolume == null
            ? "Armazenamento indisponível"
            : $"{PrimaryVolume.DriveLetter} {PrimaryVolume.UsedPercent:F0}% ocupado";

    public async Task OnNavigatedToAsync()
    {
        await LoadAsync();
    }

    public Task OnNavigatedFromAsync()
    {
        return Task.CompletedTask;
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        await LoadAsync();
    }

    private async Task LoadAsync()
    {
        if (IsLoading)
            return;

        IsLoading = true;

        try
        {
            SystemInfo = await systemInfoService.RefreshAsync();
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to load home system summary");
        }
        finally
        {
            IsLoading = false;
        }
    }

    partial void OnSystemInfoChanged(SystemSnapshot value)
    {
        OnPropertyChanged(nameof(PrimaryVolume));
        OnPropertyChanged(nameof(SystemHealthScore));
        OnPropertyChanged(nameof(SystemHealthLabel));
        OnPropertyChanged(nameof(LastSessionSummary));
        OnPropertyChanged(nameof(StorageSummary));
    }
}
