using System.Collections.ObjectModel;
using System.Diagnostics;
using System.IO;
using System.Management;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json.Serialization;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Win32;
using optimizerDuck.Common.Helpers;
using optimizerDuck.Domain.Configuration;
using optimizerDuck.Services.UI;
using optimizerDuck.Services.System;
using Wpf.Ui;
using Wpf.Ui.Controls;

namespace optimizerDuck.UI.ViewModels.Pages;

public partial class FreeFireViewModel(
    ILogger<FreeFireViewModel> logger,
    ISnackbarService snackbarService,
    ActivationService activationService,
    StreamService streamService,
    IOptionsMonitor<AppSettings> appSettingsMonitor
) : ViewModel
{
    private const string RecommendedEmulatorUrl =
        "https://www.ldplayer.net/games/garena-free-fire-on-pc.html";
    private readonly HttpClient _downloadsClient = new() { Timeout = TimeSpan.FromMinutes(30) };
    private readonly AppSettings.AppOptions _appOptions = appSettingsMonitor.CurrentValue.App;

    private static readonly EmulatorDefinition[] KnownEmulators =
    [
        new("BlueStacks", ["HD-Player", "BstkSVC", "BlueStacks"]),
        new("LDPlayer", ["dnplayer", "ldplayer", "LdVBoxHeadless"]),
        new("MuMu Player", ["MuMuPlayer", "NemuPlayer", "NemuHeadless", "MuMuVMMHeadless"]),
        new("GameLoop", ["AndroidEmulator", "AppMarket", "aow_exe"]),
        new("MEmu", ["MEmu", "MEmuHeadless"]),
        new("NoxPlayer", ["Nox", "NoxVMHandle", "NoxVMSVC"]),
    ];

    [ObservableProperty]
    private string _boostStatus = "Aguardando diagnostico.";

    [ObservableProperty]
    private string _powerPlan = "Verificando...";

    [ObservableProperty]
    private string _ramStatus = "Verificando...";

    [ObservableProperty]
    private string _recommendedAction = "Clique em Atualizar para diagnosticar o ambiente.";

    [ObservableProperty]
    private string _virtualizationStatus = "Verificando...";

    [ObservableProperty]
    private bool _isLoadingDownloads;

    [ObservableProperty]
    private string _downloadsStatus = "Carregando biblioteca gamer...";

    public ObservableCollection<EmulatorStatus> Emulators { get; } = [];
    public ObservableCollection<GameDownloadItemViewModel> Downloads { get; } = [];

    protected override async Task InitializeOnceAsync()
    {
        await RefreshAsync();
    }

    [RelayCommand]
    private async Task RefreshAsync()
    {
        BoostStatus = "Diagnostico atualizado. Nenhuma alteracao aplicada.";
        IsLoadingDownloads = true;
        DownloadsStatus = "Atualizando downloads da central gamer...";

        var diagnosticsTask = Task.Run(() =>
        {
            var emulators = KnownEmulators.Select(BuildStatus).Where(e => e.IsRunning).ToList();
            var ram = RamProvider.Get();
            var powerPlan = GetActivePowerPlan();
            var virtualization = GetVirtualizationStatus();

            System.Windows.Application.Current.Dispatcher.Invoke(() =>
            {
                Emulators.Clear();
                foreach (var emulator in emulators)
                    Emulators.Add(emulator);

                RamStatus =
                    $"{ram.AvailableGB:F1} GB livres de {ram.TotalGB:F1} GB ({ram.UsedPercent:F0}% em uso)";
                PowerPlan = powerPlan;
                VirtualizationStatus = virtualization;
                RecommendedAction = BuildRecommendation(emulators, ram.AvailableGB, powerPlan);
            });
        });
        var downloadsTask = LoadDownloadsAsync();

        await Task.WhenAll(diagnosticsTask, downloadsTask);
    }

    [RelayCommand]
    private async Task ApplySessionBoostAsync()
    {
        if (!await EnsureActivationAsync())
            return;

        var cleaned = await Task.Run(CleanGameCache);
        var targets = Emulators.Where(e => e.IsRunning).SelectMany(e => e.ProcessIds).Distinct();
        var boosted = 0;

        foreach (var processId in targets)
        {
            try
            {
                using var process = Process.GetProcessById(processId);
                process.PriorityClass = ProcessPriorityClass.High;
                boosted++;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to boost process {ProcessId}", processId);
            }
        }

        BoostStatus =
            boosted == 0
                ? $"Limpeza concluida: {cleaned.DeletedItems} item(ns) removido(s). Nenhum emulador aberto foi encontrado para prioridade alta."
                : $"Boost aplicado em {boosted} processo(s). Limpeza concluida: {cleaned.DeletedItems} item(ns) removido(s). Reinicie o PC se algum arquivo protegido nao puder ser apagado.";

        snackbarService.Show(
            "Jogos",
            BoostStatus,
            boosted == 0 ? ControlAppearance.Caution : ControlAppearance.Success,
            new SymbolIcon { Symbol = boosted == 0 ? SymbolRegular.Warning24 : SymbolRegular.CheckmarkCircle24 },
            TimeSpan.FromSeconds(5)
        );
    }

    [RelayCommand]
    private void InstallEmulator()
    {
        if (!activationService.IsActivated)
        {
            activationService.OpenActivationWindow();
            return;
        }

        try
        {
            Process.Start(
                new ProcessStartInfo { FileName = RecommendedEmulatorUrl, UseShellExecute = true }
            );
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to open emulator installer page");
            snackbarService.Show(
                "Jogos",
                "Nao foi possivel abrir a pagina de instalacao do emulador.",
                ControlAppearance.Caution,
                new SymbolIcon { Symbol = SymbolRegular.Warning24 },
                TimeSpan.FromSeconds(5)
            );
        }
    }

    [RelayCommand]
    private static void OpenGameSettings()
    {
        Process.Start(new ProcessStartInfo { FileName = "ms-settings:gaming-gamemode", UseShellExecute = true });
    }

    [RelayCommand]
    private void OpenProcessLocation(EmulatorStatus emulator)
    {
        var processId = emulator.ProcessIds.FirstOrDefault();
        if (processId == 0)
            return;

        try
        {
            using var process = Process.GetProcessById(processId);
            var fileName = process.MainModule?.FileName;
            if (string.IsNullOrWhiteSpace(fileName))
                return;

            Process.Start("explorer.exe", $"/select,\"{fileName}\"");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to open emulator process location");
            snackbarService.Show(
                "Jogos",
                "Nao foi possivel abrir a pasta do processo.",
                ControlAppearance.Caution,
                new SymbolIcon { Symbol = SymbolRegular.Warning24 },
                TimeSpan.FromSeconds(5)
            );
        }
    }

    [RelayCommand]
    private async Task DownloadPackageAsync(GameDownloadItemViewModel item)
    {
        if (item == null)
            return;

        if (!await EnsureActivationAsync(openDialogWhenLocked: true))
            return;

        item.IsDownloading = true;
        item.IsDownloaded = false;
        item.DownloadPercent = 0;
        item.DownloadStatus = "Preparando download...";

        var absoluteUrl = BuildAbsoluteDownloadUrl(item.DownloadUrl);
        var progress = new Progress<DownloadProgressInfo>(p =>
        {
            item.DownloadPercent = p.Percent ?? 0;
            item.DownloadStatus =
                $"{item.DownloadPercent:0}% • {GameDownloadItemViewModel.FormatBytes(p.BytesReceived)}"
                + (p.TotalBytes.HasValue
                    ? $" / {GameDownloadItemViewModel.FormatBytes(p.TotalBytes.Value)}"
                    : string.Empty)
                + $" • {FormatSpeed(p.SpeedBytesPerSecond)}";
        });

        var result = await streamService.TryDownloadWithProgressAsync(
            absoluteUrl,
            item.OriginalFileName,
            progress,
            CancellationToken.None
        );

        item.IsDownloading = false;

        if (!result.Success || string.IsNullOrWhiteSpace(result.FilePath))
        {
            item.DownloadStatus = result.ErrorMessage ?? "Falha no download.";
            snackbarService.Show(
                "Jogos",
                item.DownloadStatus,
                ControlAppearance.Caution,
                new SymbolIcon { Symbol = SymbolRegular.Warning24 },
                TimeSpan.FromSeconds(5)
            );
            return;
        }

        item.DownloadedFilePath = result.FilePath;
        item.IsDownloaded = true;
        item.DownloadPercent = 100;
        item.DownloadStatus = $"Concluido • {item.DownloadedFileName}";

        snackbarService.Show(
            "Jogos",
            $"Download concluido: {item.DownloadedFileName}",
            ControlAppearance.Success,
            new SymbolIcon { Symbol = SymbolRegular.CheckmarkCircle24 },
            TimeSpan.FromSeconds(5)
        );
    }

    [RelayCommand]
    private void OpenDownloadedFile(GameDownloadItemViewModel item)
    {
        if (item == null || string.IsNullOrWhiteSpace(item.DownloadedFilePath) || !File.Exists(item.DownloadedFilePath))
            return;

        try
        {
            Process.Start(new ProcessStartInfo { FileName = item.DownloadedFilePath, UseShellExecute = true });
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to open downloaded file {FilePath}", item.DownloadedFilePath);
            snackbarService.Show(
                "Jogos",
                "Nao foi possivel abrir o arquivo baixado.",
                ControlAppearance.Caution,
                new SymbolIcon { Symbol = SymbolRegular.Warning24 },
                TimeSpan.FromSeconds(5)
            );
        }
    }

    [RelayCommand]
    private void OpenDownloadedFolder(GameDownloadItemViewModel item)
    {
        if (item == null || string.IsNullOrWhiteSpace(item.DownloadedFilePath) || !File.Exists(item.DownloadedFilePath))
            return;

        try
        {
            Process.Start("explorer.exe", $"/select,\"{item.DownloadedFilePath}\"");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to open downloaded file folder {FilePath}", item.DownloadedFilePath);
            snackbarService.Show(
                "Jogos",
                "Nao foi possivel abrir a pasta do download.",
                ControlAppearance.Caution,
                new SymbolIcon { Symbol = SymbolRegular.Warning24 },
                TimeSpan.FromSeconds(5)
            );
        }
    }

    private static EmulatorStatus BuildStatus(EmulatorDefinition definition)
    {
        var processes = definition
            .ProcessNames.SelectMany(name =>
            {
                try
                {
                    return Process.GetProcessesByName(name);
                }
                catch
                {
                    return Array.Empty<Process>();
                }
            })
            .GroupBy(p => p.Id)
            .Select(g => g.First())
            .ToList();

        var ids = processes.Select(p => p.Id).OrderBy(id => id).ToArray();
        foreach (var process in processes)
            process.Dispose();

        return new EmulatorStatus(
            definition.DisplayName,
            string.Join(", ", definition.ProcessNames),
            ids.Length > 0,
            ids,
            ids.Length > 0 ? "Em execucao" : "Nao detectado",
            ids.Length > 0
                ? $"Processos ativos: {string.Join(", ", ids)}"
                : "Abra o emulador antes de aplicar o boost de sessao."
        );
    }

    private static string BuildRecommendation(
        IReadOnlyCollection<EmulatorStatus> emulators,
        double availableRamGb,
        string powerPlan
    )
    {
        if (emulators.Count == 0)
            return "Abra o emulador usado para jogar e clique em Atualizar.";

        if (availableRamGb < 2.5)
            return "RAM livre baixa. Feche navegadores, launchers e apps pesados antes de jogar.";

        if (powerPlan.StartsWith("Nao foi possivel", StringComparison.OrdinalIgnoreCase))
            return "Plano de energia nao verificado. O boost de sessao ainda pode ser aplicado.";

        if (!powerPlan.Contains("alto", StringComparison.OrdinalIgnoreCase)
            && !powerPlan.Contains("high", StringComparison.OrdinalIgnoreCase)
            && !powerPlan.Contains("ultimate", StringComparison.OrdinalIgnoreCase))
            return "Considere usar um plano de energia de alto desempenho antes de jogar.";

        return "Ambiente pronto para aplicar o boost de sessao do emulador.";
    }

    private async Task LoadDownloadsAsync()
    {
        try
        {
            var endpoint = $"{GetDownloadsApiBaseUrl().TrimEnd('/')}/api/optimizer-downloads";
            var payload = await _downloadsClient.GetFromJsonAsync<List<OptimizerDownloadItem>>(endpoint);
            var items = payload ?? [];

            System.Windows.Application.Current.Dispatcher.Invoke(() =>
            {
                Downloads.Clear();
                foreach (var entry in items.OrderBy(i => i.SortOrder).ThenBy(i => i.Title).Select((item, index) => new { item, index }))
                {
                    Downloads.Add(
                        new GameDownloadItemViewModel
                        {
                            Id = entry.item.Id,
                            Title = entry.item.Title,
                            Description = entry.item.Description ?? string.Empty,
                            Category = entry.item.Category,
                            DownloadUrl = entry.item.DownloadUrl,
                            OriginalFileName = entry.item.OriginalFileName ?? entry.item.Title,
                            CoverImageUrl = entry.item.CoverImageUrl ?? string.Empty,
                            ButtonLabel = string.IsNullOrWhiteSpace(entry.item.ButtonLabel) ? "Baixar agora" : entry.item.ButtonLabel,
                            FileSizeBytes = entry.item.FileSizeBytes,
                            MimeType = entry.item.MimeType ?? string.Empty,
                            CreatedAt = entry.item.CreatedAt,
                            IsFeatured = entry.index == 0,
                        }
                    );
                }

                IsLoadingDownloads = false;
                DownloadsStatus = Downloads.Count == 0
                    ? "Nenhum download gamer disponivel agora."
                    : $"{Downloads.Count} download(s) disponivel(is) para a aba Jogos.";
            });
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to load optimizer downloads");
            System.Windows.Application.Current.Dispatcher.Invoke(() =>
            {
                Downloads.Clear();
                IsLoadingDownloads = false;
                DownloadsStatus = "Nao foi possivel carregar os downloads do servidor.";
            });
        }
    }

    private string GetDownloadsApiBaseUrl()
    {
        return string.IsNullOrWhiteSpace(_appOptions.DownloadsApiBaseUrl)
            ? "http://localhost:3333"
            : _appOptions.DownloadsApiBaseUrl;
    }

    private string BuildAbsoluteDownloadUrl(string downloadUrl)
    {
        if (Uri.TryCreate(downloadUrl, UriKind.Absolute, out var absoluteUri))
            return absoluteUri.ToString();

        var baseUrl = GetDownloadsApiBaseUrl().TrimEnd('/');
        return $"{baseUrl}/{downloadUrl.TrimStart('/')}";
    }

    private static string FormatSpeed(double bytesPerSecond)
    {
        return $"{GameDownloadItemViewModel.FormatBytes((long)bytesPerSecond)}/s";
    }

    private static string GetActivePowerPlan()
    {
        try
        {
            var powerCfgPath = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.System),
                "powercfg.exe"
            );

            using var process = Process.Start(
                new ProcessStartInfo
                {
                    FileName = powerCfgPath,
                    Arguments = "/getactivescheme",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.Default,
                    StandardErrorEncoding = Encoding.Default,
                }
            );

            if (process == null)
                return "Nao foi possivel verificar o plano de energia agora.";

            if (!process.WaitForExit(3000))
            {
                try
                {
                    process.Kill(entireProcessTree: true);
                }
                catch
                {
                    // Best effort cleanup.
                }

                return "Nao foi possivel verificar o plano de energia agora.";
            }

            var output = process.StandardOutput.ReadToEnd();
            var error = process.StandardError.ReadToEnd();
            if (!string.IsNullOrWhiteSpace(output))
                return output.Trim();

            return GetActivePowerPlanFromRegistry()
                ?? (
                    string.IsNullOrWhiteSpace(error)
                        ? "Nao foi possivel verificar o plano de energia agora."
                        : $"Plano de energia nao verificado: {error.Trim()}"
                );
        }
        catch
        {
            return GetActivePowerPlanFromRegistry()
                ?? "Nao foi possivel verificar o plano de energia agora.";
        }
    }

    private static string? GetActivePowerPlanFromRegistry()
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(
                @"SYSTEM\CurrentControlSet\Control\Power\User\PowerSchemes"
            );
            var activeGuid = key?.GetValue("ActivePowerScheme")?.ToString();
            if (string.IsNullOrWhiteSpace(activeGuid))
                return null;

            var normalizedGuid = activeGuid.ToLowerInvariant();
            var planName = normalizedGuid switch
            {
                "381b4222-f694-41f0-9685-ff5bb260df2e" => "Equilibrado",
                "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c" => "Alto desempenho",
                "a1841308-3541-4fab-bc81-f71556f20b4a" => "Economia de energia",
                "e9a42b02-d5df-448d-aa00-03f14749eb61" => "Desempenho maximo",
                Shared.PowerPlanGUID => "Nexxsensi Otimizer",
                _ => "Plano personalizado",
            };

            return $"Plano ativo via registro: {planName} ({activeGuid})";
        }
        catch
        {
            return null;
        }
    }

    private static string GetVirtualizationStatus()
    {
        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT VirtualizationFirmwareEnabled FROM Win32_Processor"
            );

            var enabled = searcher
                .Get()
                .Cast<ManagementObject>()
                .Any(obj => obj["VirtualizationFirmwareEnabled"] is true);

        return enabled
                ? "Virtualizacao ativada na BIOS/UEFI."
                : "Virtualizacao desativada. Emuladores podem perder desempenho.";
        }
        catch
        {
            return "Nao foi possivel verificar virtualizacao.";
        }
    }

    private static CleanupResult CleanGameCache()
    {
        var targets = new[]
        {
            Path.GetTempPath(),
            Environment.ExpandEnvironmentVariables(@"%TEMP%"),
            Environment.ExpandEnvironmentVariables(@"%LOCALAPPDATA%\Temp"),
            Environment.ExpandEnvironmentVariables(@"%WINDIR%\Temp"),
            Environment.ExpandEnvironmentVariables(@"%WINDIR%\Prefetch"),
        };

        var deleted = 0;
        var failed = 0;

        foreach (var target in targets.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(target) || !Directory.Exists(target))
                continue;

            string[] files;
            string[] directories;

            try
            {
                files = Directory.GetFiles(target, "*", SearchOption.TopDirectoryOnly);
                directories = Directory.GetDirectories(target, "*", SearchOption.TopDirectoryOnly);
            }
            catch
            {
                failed++;
                continue;
            }

            foreach (var file in files)
            {
                try
                {
                    File.SetAttributes(file, FileAttributes.Normal);
                    File.Delete(file);
                    deleted++;
                }
                catch
                {
                    failed++;
                }
            }

            foreach (var directory in directories)
            {
                try
                {
                    Directory.Delete(directory, recursive: true);
                    deleted++;
                }
                catch
                {
                    failed++;
                }
            }
        }

        return new CleanupResult(deleted, failed);
    }

    private sealed record EmulatorDefinition(string DisplayName, string[] ProcessNames);

    private sealed record CleanupResult(int DeletedItems, int FailedItems);

    private async Task<bool> EnsureActivationAsync(bool openDialogWhenLocked = false)
    {
        if (await activationService.EnsureActivatedAsync(openDialogWhenLocked))
            return true;

        snackbarService.Show(
            "Key necessaria",
            "Para ver esta funcao, ative sua key.",
            ControlAppearance.Caution,
            new SymbolIcon { Symbol = SymbolRegular.Key24 },
            TimeSpan.FromSeconds(4)
        );

        return false;
    }
}

public sealed record EmulatorStatus(
    string DisplayName,
    string ProcessNames,
    bool IsRunning,
    int[] ProcessIds,
    string Status,
    string Detail
);

public sealed record OptimizerDownloadItem
{
    public string Id { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public string? Description { get; init; }
    public string Category { get; init; } = string.Empty;
    [JsonPropertyName("download_url")]
    public string DownloadUrl { get; init; } = string.Empty;
    [JsonPropertyName("original_file_name")]
    public string? OriginalFileName { get; init; }
    [JsonPropertyName("file_size_bytes")]
    public long? FileSizeBytes { get; init; }
    [JsonPropertyName("mime_type")]
    public string? MimeType { get; init; }
    [JsonPropertyName("cover_image_url")]
    public string? CoverImageUrl { get; init; }
    [JsonPropertyName("button_label")]
    public string? ButtonLabel { get; init; }
    [JsonPropertyName("sort_order")]
    public int SortOrder { get; init; }
    [JsonPropertyName("created_at")]
    public DateTimeOffset? CreatedAt { get; init; }
}
