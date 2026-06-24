using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;

namespace optimizerDuck.UI.ViewModels.Pages;

public partial class GameDownloadItemViewModel : ObservableObject
{
    public string Id { get; init; } = string.Empty;
    public string Title { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public string Category { get; init; } = string.Empty;
    public string DownloadUrl { get; init; } = string.Empty;
    public string OriginalFileName { get; init; } = string.Empty;
    public string CoverImageUrl { get; init; } = string.Empty;
    public string ButtonLabel { get; init; } = "Baixar agora";
    public long? FileSizeBytes { get; init; }
    public string MimeType { get; init; } = string.Empty;
    public DateTimeOffset? CreatedAt { get; init; }
    public bool IsFeatured { get; init; }

    [ObservableProperty]
    private bool _isDownloading;

    [ObservableProperty]
    private double _downloadPercent;

    [ObservableProperty]
    private string _downloadStatus = "Pronto para baixar";

    [ObservableProperty]
    private string? _downloadedFilePath;

    [ObservableProperty]
    private bool _isDownloaded;

    public bool HasCover => !string.IsNullOrWhiteSpace(CoverImageUrl);

    public string FileSizeLabel => FormatBytes(FileSizeBytes);

    public string UpdatedAtLabel =>
        CreatedAt.HasValue ? CreatedAt.Value.LocalDateTime.ToString("dd/MM/yy") : "--";

    public string PlatformTag =>
        MimeType.Contains("xapk", StringComparison.OrdinalIgnoreCase)
        || OriginalFileName.Contains(".xapk", StringComparison.OrdinalIgnoreCase)
            ? "Android"
            : "Windows";

    public string DownloadedFileName =>
        string.IsNullOrWhiteSpace(DownloadedFilePath)
            ? OriginalFileName
            : Path.GetFileName(DownloadedFilePath);

    partial void OnDownloadedFilePathChanged(string? value)
    {
        OnPropertyChanged(nameof(DownloadedFileName));
    }

    public static string FormatBytes(long? value)
    {
        if (!value.HasValue || value.Value <= 0)
            return "Tamanho sob consulta";

        var size = value.Value;
        var units = new[] { "B", "KB", "MB", "GB" };
        var unitIndex = 0;
        double display = size;

        while (display >= 1024 && unitIndex < units.Length - 1)
        {
            display /= 1024;
            unitIndex++;
        }

        return $"{display:0.#} {units[unitIndex]}";
    }
}
