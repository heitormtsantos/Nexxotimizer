using System.Windows;
using optimizerDuck.Services.UI;

namespace optimizerDuck.UI.Windows;

public partial class ActivationWindow : Window
{
    private readonly ActivationService _activationService;

    public ActivationWindow(ActivationService activationService)
    {
        _activationService = activationService;
        InitializeComponent();
        KeyTextBox.Focus();
    }

    private async void ActivateButton_Click(object sender, RoutedEventArgs e)
    {
        var key = KeyTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(key))
        {
            MessageText.Text = "Informe sua key de acesso.";
            return;
        }

        ActivateButton.IsEnabled = false;
        MessageText.Text = "Validando key...";

        try
        {
            var result = await _activationService.ActivateAsync(key);
            if (!result.Valid)
            {
                MessageText.Text = result.Message;
                return;
            }

            DialogResult = true;
            Close();
        }
        finally
        {
            ActivateButton.IsEnabled = true;
        }
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        DialogResult = false;
        Close();
    }
}
