using System.Diagnostics;
using Microsoft.Extensions.Logging;
using optimizerDuck.Resources.Languages;
using Wpf.Ui;
using Wpf.Ui.Controls;

namespace optimizerDuck.Common.Helpers;

/// <summary>
///     Provides shared logic for opening the configured project source/community URL.
/// </summary>
public static class GitHubSourceHelper
{
    /// <summary>
    ///     Opens the configured project source page.
    /// </summary>
    /// <param name="ownerType">The type that owns the source file (e.g., the category class).</param>
    /// <param name="className">The class name to find within the source file.</param>
    /// <param name="baseClassPattern">Optional base class pattern to search for (e.g., "BaseCustomizeSetting").</param>
    /// <param name="logger">Optional logger for diagnostic output.</param>
    /// <param name="snackbarService">Optional snackbar service for user-facing error notifications.</param>
    public static async Task OpenSourceOnGitHubAsync(
        Type ownerType,
        string className,
        string? baseClassPattern = null,
        ILogger? logger = null,
        ISnackbarService? snackbarService = null
    )
    {
        await Task.CompletedTask;
        var url = Shared.GitHubRepoURL;

        try
        {
            Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true });
        }
        catch (Exception ex)
        {
            logger?.LogError(ex, "Failed to open GitHub URL: {Url}", url);
            snackbarService?.Show(
                Translations.Snackbar_OpenLinkFailed_Title,
                Translations.Snackbar_OpenLinkFailed_Message,
                ControlAppearance.Danger,
                new SymbolIcon { Symbol = SymbolRegular.ErrorCircle24, Filled = true },
                TimeSpan.FromSeconds(5)
            );
        }
    }
}
