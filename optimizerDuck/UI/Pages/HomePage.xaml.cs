using optimizerDuck.UI.ViewModels.Pages;
using Wpf.Ui.Abstractions.Controls;

namespace optimizerDuck.UI.Pages;

public partial class HomePage : INavigableView<HomeViewModel>
{
    public HomePage(HomeViewModel viewModel)
    {
        ViewModel = viewModel;
        DataContext = this;

        InitializeComponent();
    }

    public HomeViewModel ViewModel { get; }
}
