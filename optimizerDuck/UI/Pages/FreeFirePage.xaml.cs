using optimizerDuck.UI.ViewModels.Pages;
using Wpf.Ui.Abstractions.Controls;
using optimizerDuck.Services.UI;

namespace optimizerDuck.UI.Pages;

public partial class FreeFirePage : INavigableView<FreeFireViewModel>
{
    public FreeFirePage(FreeFireViewModel viewModel, ActivationService activation)
    {
        ViewModel = viewModel;
        Activation = activation;
        DataContext = this;
        InitializeComponent();
    }

    public FreeFireViewModel ViewModel { get; }

    public ActivationService Activation { get; }
}
