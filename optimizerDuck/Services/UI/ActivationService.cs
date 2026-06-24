using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
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
    private const string ValidationUrl = "http://localhost:3333/api/keys/validate";
    private static readonly string ActivationFilePath = Path.Combine(
        Shared.RootDirectory,
        "activation.json"
    );

    private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(12) };
    private readonly DispatcherTimer _statusTimer = new() { Interval = TimeSpan.FromSeconds(5) };

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

        var result = await ValidateKeyAsync(stored.Key);
        if (!result.Valid)
        {
            if (
                stored.ExpiresAt > DateTimeOffset.UtcNow
                && string.Equals(result.Message, "Nao foi possivel validar a key no momento.")
            )
                return ActivationCheckResult.Success(
                    new ActivationValidationResponse
                    {
                        Valid = true,
                        Status = "valid",
                        Email = stored.Email,
                        Product = stored.Product,
                        StartsAt = stored.StartsAt,
                        ExpiresAt = stored.ExpiresAt,
                        ActivatedAt = stored.StartsAt,
                    }
                );

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
        }

        return result;
    }

    public async Task<ActivationCheckResult> ActivateAsync(string key)
    {
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
        if (!IsActivated || !ExpiresAt.HasValue)
            return;

        if (ExpiresAt.Value <= DateTimeOffset.UtcNow)
        {
            ApplyActivationState(ActivationCheckResult.Failure("Sua key expirou."));
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

    private static string NormalizeKey(string key)
    {
        return key.Trim().ToUpperInvariant();
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
