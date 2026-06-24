using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using Microsoft.Extensions.Logging;
using optimizerDuck.Common.Helpers;

namespace optimizerDuck.Services.System;

public class StreamService(ILogger<StreamService> logger) : IDisposable
{
    private HttpClient? _client;

    /// <summary>Downloads a file from the specified URL and saves it to the local downloads directory.</summary>
    /// <param name="url">The URL to download from.</param>
    /// <param name="fileName">The target file name (not path) to save as.</param>
    /// <returns>A tuple where <c>Success</c> indicates whether the download completed, and <c>FilePath</c> is the full local path on success.</returns>
    /// <example>
    /// <code language="csharp">
    /// var (success, path) = await streamService.TryDownloadAsync("https://example.com/file.zip", "file.zip");
    /// </code>
    /// </example>
    public async Task<(bool Success, string? FilePath)> TryDownloadAsync(
        string url,
        string fileName
    )
    {
        var result = await TryDownloadWithProgressAsync(url, fileName, null, CancellationToken.None);
        return (result.Success, result.FilePath);
    }

    public async Task<DownloadFileResult> TryDownloadWithProgressAsync(
        string url,
        string fileName,
        IProgress<DownloadProgressInfo>? progress,
        CancellationToken cancellationToken
    )
    {
        var filePath = Path.Combine(Shared.DownloadsDirectory, fileName);

        logger.LogInformation("Starting download from {Url} to {FilePath}", url, filePath);

        try
        {
            Directory.CreateDirectory(Shared.DownloadsDirectory);
            _client ??= new HttpClient();
            using var response = await _client.GetAsync(
                url,
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken
            ).ConfigureAwait(false);

            logger.LogDebug("Received HTTP {StatusCode} from {Url}", response.StatusCode, url);

            response.EnsureSuccessStatusCode();

            var resolvedFileName = ResolveFileName(fileName, response.Content.Headers);
            filePath = Path.Combine(Shared.DownloadsDirectory, resolvedFileName);
            var totalBytes = response.Content.Headers.ContentLength;
            var speedWindowStartedAt = DateTime.UtcNow;
            long bytesReceived = 0;

            await using var fs = new FileStream(
                filePath,
                FileMode.Create,
                FileAccess.Write,
                FileShare.None
            );
            await using var httpStream = await response.Content
                .ReadAsStreamAsync(cancellationToken)
                .ConfigureAwait(false);

            var buffer = new byte[81920];
            int read;
            while (
                (read = await httpStream.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken)
                    .ConfigureAwait(false)) > 0
            )
            {
                await fs.WriteAsync(buffer.AsMemory(0, read), cancellationToken).ConfigureAwait(false);
                bytesReceived += read;

                var elapsedSeconds = Math.Max(
                    0.001,
                    (DateTime.UtcNow - speedWindowStartedAt).TotalSeconds
                );

                progress?.Report(
                    new DownloadProgressInfo(
                        bytesReceived,
                        totalBytes,
                        totalBytes.HasValue && totalBytes.Value > 0
                            ? (double)bytesReceived / totalBytes.Value * 100d
                            : null,
                        bytesReceived / elapsedSeconds
                    )
                );
            }

            var length = fs.Length;
            logger.LogInformation(
                "Successfully downloaded {Length} bytes from {Url} to {FilePath}",
                length,
                url,
                filePath
            );

            progress?.Report(
                new DownloadProgressInfo(
                    length,
                    totalBytes ?? length,
                    100d,
                    0d
                )
            );

            return new DownloadFileResult(true, filePath, null);
        }
        catch (OperationCanceledException ex)
        {
            logger.LogWarning(ex, "Download canceled for {Url}", url);
            return new DownloadFileResult(false, null, "Download cancelado.");
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Network error while downloading {Url}", url);
            return new DownloadFileResult(false, null, "Falha de rede ao baixar o arquivo.");
        }
        catch (IOException ex)
        {
            logger.LogError(ex, "File I/O error while saving {FilePath}", filePath);
            return new DownloadFileResult(false, null, "Falha ao salvar o arquivo.");
        }
        catch (UnauthorizedAccessException ex)
        {
            logger.LogError(ex, "Access denied when writing to {FilePath}", filePath);
            return new DownloadFileResult(false, null, "Acesso negado ao salvar o arquivo.");
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unexpected error downloading {Url} to {FilePath}", url, filePath);
            return new DownloadFileResult(false, null, "Falha inesperada no download.");
        }
    }

    private static string ResolveFileName(
        string fallbackFileName,
        HttpContentHeaders headers
    )
    {
        var headerName = headers.ContentDisposition?.FileNameStar
            ?? headers.ContentDisposition?.FileName;

        var candidate = string.IsNullOrWhiteSpace(headerName)
            ? fallbackFileName
            : headerName.Trim().Trim('"');

        foreach (var invalidChar in Path.GetInvalidFileNameChars())
            candidate = candidate.Replace(invalidChar, '_');

        return string.IsNullOrWhiteSpace(candidate) ? fallbackFileName : candidate;
    }

    /// <summary>Releases the underlying <see cref="HttpClient"/> resources.</summary>
    public void Dispose()
    {
        _client?.Dispose();
    }
}

public sealed record DownloadProgressInfo(
    long BytesReceived,
    long? TotalBytes,
    double? Percent,
    double SpeedBytesPerSecond
);

public sealed record DownloadFileResult(
    bool Success,
    string? FilePath,
    string? ErrorMessage
);
