using System.IO;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using optimizerDuck.Common.Helpers;

namespace optimizerDuck.Services.UI;

public sealed class ActivationService(ILogger<ActivationService> logger)
{
    private const string ProductName = "Nexxsensi Otimizer";
    private const string ValidationUrl = "http://localhost:3333/api/keys/validate";
    private static readonly string ActivationFilePath = Path.Combine(
        Shared.RootDirectory,
        "activation.json"
    );

    private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(12) };

    public async Task<ActivationCheckResult> ValidateStoredActivationAsync()
    {
        var stored = await ReadStoredActivationAsync();
        if (stored == null || string.IsNullOrWhiteSpace(stored.Key))
            return ActivationCheckResult.Failure("Informe uma key para ativar.");

        if (stored.ExpiresAt <= DateTimeOffset.UtcNow)
            return ActivationCheckResult.Failure("Sua key expirou.");

        var result = await ValidateKeyAsync(stored.Key);
        return result.Valid ? result : ActivationCheckResult.Failure(result.Message);
    }

    public async Task<ActivationCheckResult> ActivateAsync(string key)
    {
        var result = await ValidateKeyAsync(key);
        if (!result.Valid || result.Data == null)
            return result;

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

        return result;
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
                return ActivationCheckResult.Failure("Resposta inválida do servidor.");

            if (!response.IsSuccessStatusCode || !data.Valid)
                return ActivationCheckResult.Failure(StatusToMessage(data.Status), data);

            return ActivationCheckResult.Success(data);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to validate activation key");
            return ActivationCheckResult.Failure("Não foi possível validar a key no momento.");
        }
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
            "inactive" => "Sua key está inativa.",
            "not_started" => "Sua key ainda não está liberada.",
            "not_found" => "Key não encontrada.",
            _ => "Key inválida.",
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
        return new ActivationCheckResult(true, "Ativação validada.", data);
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
    public DateTimeOffset StartsAt { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
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
