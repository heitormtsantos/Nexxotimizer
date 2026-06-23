using System.Diagnostics;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using optimizerDuck.Common.Helpers;
using optimizerDuck.Domain.Configuration;
using optimizerDuck.Resources.Languages;
using optimizerDuck.Services.Configuration;
using optimizerDuck.Services.Optimization;
using optimizerDuck.Services.Revert;
using optimizerDuck.Services.System;
using optimizerDuck.UI.Behaviors;
using Wpf.Ui;
using Wpf.Ui.Appearance;
using Wpf.Ui.Controls;

namespace optimizerDuck.UI.ViewModels.Pages;

public partial class SettingsViewModel(
    ConfigManager configManager,
    IOptionsMonitor<AppSettings> appOptionsMonitor,
    OptimizationRegistry optimizationRegistry,
    IContentDialogService contentDialogService,
    ISnackbarService snackbarService,
    ILogger<SettingsViewModel> logger
) : ViewModel
{
    [ObservableProperty]
    private ApplicationTheme _currentApplicationTheme = ApplicationTheme.Unknown;

    [ObservableProperty]
    private bool _removeProvisioned;

    [ObservableProperty]
    private int _shellTimeoutMs;

    [ObservableProperty]
    private bool _showSnackbarNotificationAfterAppliedSuccessfully;

    [ObservableProperty]
    private bool _smoothScrolling;
    public string Version { get; } = Shared.FileVersion;


    protected override Task InitializeOnceAsync()
    {
        ShellTimeoutMs = appOptionsMonitor.CurrentValue.Optimize.ShellTimeoutMs;
        ShowSnackbarNotificationAfterAppliedSuccessfully = appOptionsMonitor
            .CurrentValue
            .Optimize
            .ShowCompletionNotification;
        SmoothScrolling = appOptionsMonitor.CurrentValue.Optimize.SmoothScrolling;
        SmoothScrollBehavior.GlobalEnabled = SmoothScrolling;
        RemoveProvisioned = appOptionsMonitor.CurrentValue.Bloatware.RemoveProvisioned;
        CurrentApplicationTheme = ApplicationTheme.Dark;

        return Task.CompletedTask;
    }

    #region Helpers

    private async Task<ContentDialogResult> ConfirmationDialogAsync(string content)
    {
        var dialog = new ContentDialog
        {
            Title = Translations.Dialog_AreYouSure_Title,
            Content = content,
            PrimaryButtonText = Translations.Button_Clear,
            PrimaryButtonAppearance = ControlAppearance.Danger,

            CloseButtonText = Translations.Button_Cancel,

            DefaultButton = ContentDialogButton.Close,
            MaxWidth = 500,
        };
        return await contentDialogService.ShowAsync(dialog, CancellationToken.None);
    }

    #endregion Helpers

    private async Task SaveConfigAsync(Func<Task> saveAction, Func<Task>? revertAction = null)
    {
        try
        {
            await saveAction();
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to save configuration");
            if (revertAction != null)
            {
                try
                {
                    await revertAction();
                }
                catch (Exception revertEx)
                {
                    logger.LogError(revertEx, "Failed to revert UI property");
                }
            }
        }
    }

    #region Commands

    [RelayCommand]
    private void OpenRootDir()
    {
        try
        {
            logger.LogInformation("Opening root directory: {Path}", Shared.RootDirectory);
            Process.Start(
                new ProcessStartInfo { FileName = Shared.RootDirectory, UseShellExecute = true }
            );
        }
        catch (Exception ex)
        {
            snackbarService.Show(
                Translations.Snackbar_OpenFailed_Title,
                Translations.Snackbar_OpenFailed_Message,
                ControlAppearance.Danger,
                new SymbolIcon { Symbol = SymbolRegular.ErrorCircle24, Filled = true },
                TimeSpan.FromSeconds(5)
            );
            logger.LogError(ex, "Failed to open root directory: {Path}", Shared.RootDirectory);
        }
    }

    [RelayCommand]
    private async Task ClearDownloads()
    {
        var result = await ConfirmationDialogAsync(
            Translations.Settings_ClearDownloads_Description
        );
        if (result == ContentDialogResult.Primary)
            OptimizationService.ClearDownloads(logger);
    }

    [RelayCommand]
    private async Task ClearAllRevertData()
    {
        var result = await ConfirmationDialogAsync(
            Translations.Settings_ClearRevertData_Description
        );
        if (result == ContentDialogResult.Primary)
        {
            RevertManager.ClearAllRevertData(logger);
            // Refresh optimizations
            await OptimizationService.UpdateOptimizationStateAsync(
                optimizationRegistry.OptimizationCategories.SelectMany(c => c.Optimizations)
            );
        }
    }

    [RelayCommand]
    private void OpenWebsite(string type)
    {
        try
        {
            switch (type)
            {
                case "Documentation":
                    logger.LogInformation(
                        "Opening page: {Url}",
                        Shared.WebsiteURL + "docs/guides/getting-started"
                    );
                    Process.Start(
                        new ProcessStartInfo
                        {
                            FileName = Shared.WebsiteURL + "docs/guides/getting-started",
                            UseShellExecute = true,
                        }
                    );
                    break;

                case "GitHub":
                    logger.LogInformation("Opening page: {Url}", Shared.GitHubRepoURL);
                    Process.Start(
                        new ProcessStartInfo
                        {
                            FileName = Shared.GitHubRepoURL,
                            UseShellExecute = true,
                        }
                    );
                    break;

                case "Acknowledgements":
                    logger.LogInformation("Opening page: {Url}", Shared.AcknowledgementsURL);
                    Process.Start(
                        new ProcessStartInfo
                        {
                            FileName = Shared.AcknowledgementsURL,
                            UseShellExecute = true,
                        }
                    );
                    break;

                case "Help":
                    logger.LogInformation("Opening page: {Url}", Shared.CommunityURL);
                    Process.Start(
                        new ProcessStartInfo
                        {
                            FileName = Shared.CommunityURL,
                            UseShellExecute = true,
                        }
                    );
                    break;
            }
        }
        catch (Exception ex)
        {
            snackbarService.Show(
                Translations.Snackbar_OpenLinkFailed_Title,
                Translations.Snackbar_OpenLinkFailed_Message,
                ControlAppearance.Danger,
                new SymbolIcon { Symbol = SymbolRegular.ErrorCircle24, Filled = true },
                TimeSpan.FromSeconds(5)
            );
            logger.LogError(ex, "Failed to open page");
        }
    }

    [RelayCommand]
    private async Task ToggleRemoveProvisioned()
    {
        if (!IsInitialized)
            return;
        try
        {
            await configManager.SetAsync(
                "bloatware:removeProvisioned",
                (!appOptionsMonitor.CurrentValue.Bloatware.RemoveProvisioned).ToString()
            );
            RemoveProvisioned = appOptionsMonitor.CurrentValue.Bloatware.RemoveProvisioned;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to toggle RemoveProvisioned setting");
            RemoveProvisioned = appOptionsMonitor.CurrentValue.Bloatware.RemoveProvisioned;
        }
    }

    [RelayCommand]
    private async Task ToggleShowCompletionNotification()
    {
        if (!IsInitialized)
            return;
        try
        {
            await configManager.SetAsync(
                "optimize:showCompletionNotification",
                (!appOptionsMonitor.CurrentValue.Optimize.ShowCompletionNotification).ToString()
            );
            ShowSnackbarNotificationAfterAppliedSuccessfully = appOptionsMonitor
                .CurrentValue
                .Optimize
                .ShowCompletionNotification;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to toggle ShowCompletionNotification setting");
            ShowSnackbarNotificationAfterAppliedSuccessfully = appOptionsMonitor
                .CurrentValue
                .Optimize
                .ShowCompletionNotification;
        }
    }

    [RelayCommand]
    private async Task ToggleSmoothScrolling()
    {
        if (!IsInitialized)
            return;
        try
        {
            await configManager.SetAsync(
                "optimize:smoothScrolling",
                (!appOptionsMonitor.CurrentValue.Optimize.SmoothScrolling).ToString()
            );
            SmoothScrolling = appOptionsMonitor.CurrentValue.Optimize.SmoothScrolling;
            SmoothScrollBehavior.GlobalEnabled = SmoothScrolling;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to toggle SmoothScrolling setting");
            SmoothScrolling = appOptionsMonitor.CurrentValue.Optimize.SmoothScrolling;
        }
    }

    [RelayCommand]
    private void OpenLatestRelease()
    {
        try
        {
            logger.LogInformation(
                "Opening latest release page: {Url}",
                UpdaterService.LatestReleaseUrl
            );
            Process.Start(
                new ProcessStartInfo
                {
                    FileName = UpdaterService.LatestReleaseUrl,
                    UseShellExecute = true,
                }
            );
        }
        catch (Exception ex)
        {
            snackbarService.Show(
                Translations.Snackbar_OpenLinkFailed_Title,
                Translations.Snackbar_OpenLinkFailed_Message,
                ControlAppearance.Danger,
                new SymbolIcon { Symbol = SymbolRegular.ErrorCircle24, Filled = true },
                TimeSpan.FromSeconds(5)
            );
            logger.LogError(ex, "Failed to open latest release page");
        }
    }

    #endregion Commands

    #region Property Changed


    partial void OnShellTimeoutMsChanged(int value)
    {
        if (!IsInitialized)
            return;
        if (value <= 0)
            return;

        var oldValue = appOptionsMonitor.CurrentValue.Optimize.ShellTimeoutMs;
        _ = SaveConfigAsync(
            async () =>
            {
                await configManager.SetAsync(x => x.Optimize.ShellTimeoutMs, value);
            },
            async () =>
            {
                ShellTimeoutMs = oldValue;
            }
        );
    }

    #endregion Property Changed
}
