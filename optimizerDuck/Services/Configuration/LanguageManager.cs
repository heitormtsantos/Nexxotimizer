using System.Globalization;
using System.Text;
using optimizerDuck.Resources.Languages;

namespace optimizerDuck.Services.Configuration;

/// <summary>
///     Provides localization and culture management for the application.
/// </summary>
public class Loc
{
    /// <summary>
    ///     Gets the singleton instance of the localization manager.
    /// </summary>
    public static Loc Instance { get; } = new();

    /// <summary>
    ///     Gets the current culture information.
    /// </summary>
    public static CultureInfo CurrentCulture => Translations.Culture;

    /// <summary>
    ///     Gets the localized string for the specified key.
    /// </summary>
    /// <param name="key">The resource key to look up.</param>
    /// <returns>The localized string or the key itself if not found.</returns>
    public string this[string key] =>
        RepairMojibake(Translations.ResourceManager.GetString(key, Translations.Culture) ?? key);

    /// <summary>
    ///     Changes the current culture for localization.
    /// </summary>
    /// <param name="culture">The new culture to apply.</param>
    public void ChangeCulture(CultureInfo culture)
    {
        var formattingCulture = culture.Name.Length == 0 ? new CultureInfo("pt-BR") : culture;
        CultureInfo.DefaultThreadCurrentCulture = formattingCulture;
        CultureInfo.DefaultThreadCurrentUICulture = formattingCulture;
        CultureInfo.CurrentCulture = formattingCulture;
        CultureInfo.CurrentUICulture = formattingCulture;
        Translations.Culture = CultureInfo.InvariantCulture;
    }

    private static string RepairMojibake(string value)
    {
        if (
            string.IsNullOrEmpty(value)
            || (!value.Contains('Ã') && !value.Contains('Â') && !value.Contains('�'))
        )
        {
            return value;
        }

        var current = value;

        for (var i = 0; i < 3; i++)
        {
            var repaired = Encoding.UTF8.GetString(Encoding.GetEncoding(1252).GetBytes(current));

            if (repaired == current || CountReplacementChars(repaired) > CountReplacementChars(current))
            {
                break;
            }

            current = repaired;

            if (!current.Contains('Ã') && !current.Contains('Â') && !current.Contains('�'))
            {
                break;
            }
        }

        return current;
    }

    private static int CountReplacementChars(string value)
    {
        return value.Count(c => c == '�');
    }
}
