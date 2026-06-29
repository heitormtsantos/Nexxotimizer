using System.Globalization;
using System.Windows.Data;

namespace optimizerDuck.Common.Converters;

public class MultiplyNumberConverter : IValueConverter
{
    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is not double number)
            return Binding.DoNothing;

        if (!double.TryParse(
                parameter?.ToString(),
                NumberStyles.Float,
                CultureInfo.InvariantCulture,
                out var factor
            ))
        {
            return Binding.DoNothing;
        }

        return number * factor;
    }

    public object ConvertBack(
        object? value,
        Type targetType,
        object? parameter,
        CultureInfo culture
    )
    {
        throw new NotSupportedException();
    }
}
