using optimizerDuck.Services.UI;
using optimizerDuck.UI.ViewModels.Pages;
using Wpf.Ui.Abstractions.Controls;

namespace optimizerDuck.UI.Pages;

public partial class DashboardPage : INavigableView<DashboardViewModel>
{
    public DashboardPage(DashboardViewModel viewModel, ActivationService activation)
    {
        ViewModel = viewModel;
        Activation = activation;
        DataContext = this;

        InitializeComponent();
    }

    public DashboardViewModel ViewModel { get; }

    public ActivationService Activation { get; }
}
