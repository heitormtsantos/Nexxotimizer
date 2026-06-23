using Microsoft.Extensions.Logging;
using optimizerDuck.Common.Helpers;

namespace optimizerDuck.Services.System;

public class UpdaterService
{
    /// <summary>The URL to the official release/update page.</summary>
    public const string LatestReleaseUrl = Shared.WebsiteURL;

    private readonly ILogger _logger;

    /// <summary>Initializes a new instance of the <see cref="UpdaterService"/> class.</summary>
    /// <param name="logger">The logger for update diagnostics.</param>
    public UpdaterService(ILogger<UpdaterService> logger)
    {
        _logger = logger;
    }

    /// <summary>Checks for a newer version of the application.</summary>
    /// <returns>A tuple where <c>Result</c> is <see langword="true"/> if a newer version exists, and <c>Version</c> is the latest version string.</returns>
    public Task<(bool Result, string? Version)> CheckForUpdatesAsync()
    {
        _logger.LogInformation(
            "Update check disabled until the Nexxsensi release backend is configured (Current version: {CurrentVersion})",
            Shared.FileVersion
        );

        return Task.FromResult((false, (string?)null));
    }
}
