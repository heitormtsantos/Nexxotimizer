using optimizerDuck.Services.UI;
using optimizerDuck.UI.ViewModels.Pages;
using Wpf.Ui.Abstractions.Controls;

namespace optimizerDuck.UI.Pages.Customize;

public partial class CustomizeCategoryPage : INavigableView<CustomizeCategoryViewModel>
{
    public CustomizeCategoryPage(
        CustomizeCategoryViewModel viewModel,
        ActivationService activation
    )
    {
        ViewModel = viewModel;
        Activation = activation;
        DataContext = this;
        InitializeComponent();
    }

    public CustomizeCategoryViewModel ViewModel { get; }

    public ActivationService Activation { get; }
}
