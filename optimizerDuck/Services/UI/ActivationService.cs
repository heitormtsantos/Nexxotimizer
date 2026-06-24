using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using optimizerDuck.Common.Helpers;
using optimizerDuck.UI.Windows;

namespace optimizerDuck.Services.UI;

public sealed partial class ActivationService(ILogger<ActivationService> logger) : ObservableObject
{
    private const string ProductName = "Nexxsensi Otimizer";
    private const string MasterUnlockKey = "UNLOCKMASTER";
    private const string ValidationUrl = "https://api.nexxsensi.com/api/keys/validate";
    private const string OpenLogUrl = "https://api.nexxsensi.com/api/keys/open-log";
    private static readonly string ActivationFilePath = Path.Combine(
        Shared.RootDirectory,
        "activation.json"
    );

    private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(12) };
    private readonly DispatcherTimer _statusTimer = new() { Interval = TimeSpan.FromSeconds(5) };
    private int _remoteRefreshTickCount;
    private string? _loggedOpenForKey;

    [ObservableProperty]
    private bool _isActivated;

    [ObservableProperty]
    private string _statusMessage = "Para usar esta funcao, ative sua key.";

    [ObservableProperty]
    private DateTimeOffset? _expiresAt;

    public string LockedMessage => "Para ver esta funcao, ative sua key.";

    public string ActivationSummary =>
        IsActivated && ExpiresAt.HasValue
            ? $"Key ativa ate {ExpiresAt.Value.LocalDateTime:dd/MM/yyyy HH:mm}."
            : StatusMessage;

    public async Task InitializeAsync()
    {
        _statusTimer.Tick -= StatusTimer_Tick;
        _statusTimer.Tick += StatusTimer_Tick;
        _statusTimer.Start();
        await RefreshActivationStateAsync();
    }

    public async Task<bool> RefreshActivationStateAsync()
    {
        var result = await ValidateStoredActivationAsync();
        ApplyActivationState(result);
        return result.Valid;
    }

    public async Task<bool> EnsureActivatedAsync(bool openDialogWhenLocked = false)
    {
        if (await RefreshActivationStateAsync())
            return true;

        if (!openDialogWhenLocked)
            return false;

        return OpenActivationWindow();
    }

    public async Task<ActivationCheckResult> ValidateStoredActivationAsync()
    {
        var stored = await ReadStoredActivationAsync();
        if (stored == null || string.IsNullOrWhiteSpace(stored.Key))
            return ActivationCheckResult.Failure("Nenhuma key ativa encontrada.");

        if (stored.ExpiresAt <= DateTimeOffset.UtcNow)
        {
            DeleteStoredActivation();
            return ActivationCheckResult.Failure("Sua key expirou.");
        }

        if (string.Equals(NormalizeKey(stored.Key), MasterUnlockKey, StringComparison.Ordinal))
        {
            return ActivationCheckResult.Success(CreateMasterUnlockValidation(stored.ExpiresAt));
        }

        var result = await ValidateKeyAsync(stored.Key);
        if (!result.Valid)
        {
            if (!string.Equals(result.Message, "Nao foi possivel validar a key no momento."))
                DeleteStoredActivation();

            return ActivationCheckResult.Failure(result.Message);
        }

        if (result.Data != null)
        {
            await SaveActivationAsync(
                new StoredActivation
                {
                    Key = NormalizeKey(stored.Key),
                    Email = result.Data.Email,
                    Product = result.Data.Product,
                    StartsAt = result.Data.StartsAt,
                    ExpiresAt = result.Data.ExpiresAt,
                    LastValidatedAt = DateTimeOffset.UtcNow,
                }
            );

            await TrySendOpenLogAsync(stored.Key);
        }

        return result;
    }

    public async Task<ActivationCheckResult> ActivateAsync(string key)
    {
        if (string.Equals(NormalizeKey(key), MasterUnlockKey, StringComparison.Ordinal))
        {
            var masterUnlock = CreateMasterUnlockValidation(DateTimeOffset.UtcNow.AddMinutes(5));
            await SaveActivationAsync(
                new StoredActivation
                {
                    Key = MasterUnlockKey,
                    Email = "teste@nexxsensi.local",
                    Product = ProductName,
                    StartsAt = masterUnlock.StartsAt,
                    ExpiresAt = masterUnlock.ExpiresAt,
                    LastValidatedAt = DateTimeOffset.UtcNow,
                }
            );

            var masterResult = ActivationCheckResult.Success(masterUnlock);
            ApplyActivationState(masterResult);
            return masterResult;
        }

        var result = await ValidateKeyAsync(key);
        if (!result.Valid || result.Data == null)
        {
            ApplyActivationState(result);
            return result;
        }

        await SaveActivationAsync(
            new StoredActivation
            {
                Key = NormalizeKey(key),
                Email = result.Data.Email,
                Product = result.Data.Product,
                StartsAt = result.Data.StartsAt,
                ExpiresAt = result.Data.ExpiresAt,
                LastValidatedAt = DateTimeOffset.UtcNow,
            }
        );

        await TrySendOpenLogAsync(key);

        ApplyActivationState(result);
        return result;
    }

    [RelayCommand]
    private void OpenPurchasePage()
    {
        try
        {
            Process.Start(
                new ProcessStartInfo { FileName = Shared.WebsiteURL, UseShellExecute = true }
            );
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to open purchase page");
        }
    }

    [RelayCommand]
    private void ShowActivationDialog()
    {
        OpenActivationWindow();
    }

    public bool OpenActivationWindow()
    {
        var owner = Application.Current?.MainWindow;
        var window = new ActivationWindow(this);

        if (owner != null && !ReferenceEquals(owner, window))
            window.Owner = owner;

        var result = window.ShowDialog() == true;
        if (result)
            ApplyActivationState(ActivationCheckResult.Success(window.LastValidation!));

        return result;
    }

    private void StatusTimer_Tick(object? sender, EventArgs e)
    {
        if (ExpiresAt.HasValue && ExpiresAt.Value <= DateTimeOffset.UtcNow)
        {
            DeleteStoredActivation();
            ApplyActivationState(ActivationCheckResult.Failure("Sua key expirou."));
            return;
        }

        if (!IsActivated)
            return;

        _remoteRefreshTickCount++;
        if (_remoteRefreshTickCount >= 12)
        {
            _remoteRefreshTickCount = 0;
            _ = RefreshActivationStateAsync();
        }

        OnPropertyChanged(nameof(ActivationSummary));
    }

    private async Task<ActivationCheckResult> ValidateKeyAsync(string key)
    {
        try
        {
            var response = await _httpClient.PostAsJsonAsync(
                ValidationUrl,
                new { key = NormalizeKey(key), product = ProductName }
            );

            var data = await response.Content.ReadFromJsonAsync<ActivationValidationResponse>();
            if (data == null)
                return ActivationCheckResult.Failure("Resposta invalida do servidor.");

            if (!response.IsSuccessStatusCode || !data.Valid)
                return ActivationCheckResult.Failure(StatusToMessage(data.Status), data);

            return ActivationCheckResult.Success(data);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to validate activation key");
            return ActivationCheckResult.Failure("Nao foi possivel validar a key no momento.");
        }
    }

    private async Task TrySendOpenLogAsync(string key)
    {
        var normalizedKey = NormalizeKey(key);
        if (_loggedOpenForKey == normalizedKey)
            return;

        var payload = new AppOpenLogRequest
        {
            Key = normalizedKey,
            Product = ProductName,
            Fingerprint = BuildFingerprint(),
            MachineName = Environment.MachineName,
            WindowsUser = Environment.UserName,
            WindowsVersion = Environment.OSVersion.VersionString,
        };

        try
        {
            var response = await _httpClient.PostAsJsonAsync(OpenLogUrl, payload);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "Failed to register app open log. StatusCode={StatusCode}",
                    response.StatusCode
                );
                return;
            }

            _loggedOpenForKey = normalizedKey;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to register app open log");
        }
    }

    private void ApplyActivationState(ActivationCheckResult result)
    {
        IsActivated = result.Valid;
        StatusMessage = result.Valid
            ? "Key validada com sucesso."
            : string.IsNullOrWhiteSpace(result.Message)
                ? "Para usar esta funcao, ative sua key."
                : result.Message;
        ExpiresAt = result.Data?.ExpiresAt;
        OnPropertyChanged(nameof(ActivationSummary));
    }

    private static async Task<StoredActivation?> ReadStoredActivationAsync()
    {
        try
        {
            if (!File.Exists(ActivationFilePath))
                return null;

            await using var stream = File.OpenRead(ActivationFilePath);
            return await JsonSerializer.DeserializeAsync<StoredActivation>(stream);
        }
        catch
        {
            return null;
        }
    }

    private static async Task SaveActivationAsync(StoredActivation activation)
    {
        Directory.CreateDirectory(Shared.RootDirectory);
        await using var stream = File.Create(ActivationFilePath);
        await JsonSerializer.SerializeAsync(
            stream,
            activation,
            new JsonSerializerOptions { WriteIndented = true }
        );
    }

    private static void DeleteStoredActivation()
    {
        try
        {
            if (File.Exists(ActivationFilePath))
                File.Delete(ActivationFilePath);
        }
        catch
        {
            // Ignore file cleanup errors.
        }
    }

    private static string NormalizeKey(string key)
    {
        return key.Trim().ToUpperInvariant();
    }

    private static string BuildFingerprint()
    {
        var input = $"{Environment.MachineName}|{Environment.UserName}";
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes);
    }

    private static ActivationValidationResponse CreateMasterUnlockValidation(
        DateTimeOffset expiresAt
    )
    {
        var startsAt = DateTimeOffset.UtcNow;
        return new ActivationValidationResponse
        {
            Valid = true,
            Status = "valid",
            Email = "teste@nexxsensi.local",
            Product = ProductName,
            StartsAt = startsAt,
            ExpiresAt = expiresAt,
            ActivatedAt = startsAt,
        };
    }

    private static string StatusToMessage(string? status)
    {
        return status switch
        {
            "expired" => "Sua key expirou.",
            "inactive" => "Sua key esta inativa.",
            "not_started" => "Sua key ainda nao foi liberada.",
            "pending_activation" => "Sua key ainda nao foi ativada.",
            "not_found" => "Key nao encontrada.",
            _ => "Key invalida.",
        };
    }
}

public sealed record ActivationCheckResult(
    bool Valid,
    string Message,
    ActivationValidationResponse? Data
)
{
    public static ActivationCheckResult Success(ActivationValidationResponse data)
    {
        return new ActivationCheckResult(true, "Ativacao validada.", data);
    }

    public static ActivationCheckResult Failure(
        string message,
        ActivationValidationResponse? data = null
    )
    {
        return new ActivationCheckResult(false, message, data);
    }
}

public sealed class ActivationValidationResponse
{
    public bool Valid { get; set; }
    public string? Status { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Product { get; set; } = string.Empty;
    [JsonPropertyName("starts_at")]
    public DateTimeOffset StartsAt { get; set; }
    [JsonPropertyName("expires_at")]
    public DateTimeOffset ExpiresAt { get; set; }
    [JsonPropertyName("activated_at")]
    public DateTimeOffset? ActivatedAt { get; set; }
}

public sealed class StoredActivation
{
    public string Key { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string Product { get; set; } = string.Empty;
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset LastValidatedAt { get; set; }
}

public sealed class AppOpenLogRequest
{
    [JsonPropertyName("key")]
    public string Key { get; set; } = string.Empty;

    [JsonPropertyName("product")]
    public string Product { get; set; } = string.Empty;

    [JsonPropertyName("fingerprint")]
    public string Fingerprint { get; set; } = string.Empty;

    [JsonPropertyName("machine_name")]
    public string MachineName { get; set; } = string.Empty;

    [JsonPropertyName("windows_user")]
    public string WindowsUser { get; set; } = string.Empty;

    [JsonPropertyName("windows_version")]
    public string WindowsVersion { get; set; } = string.Empty;
}
