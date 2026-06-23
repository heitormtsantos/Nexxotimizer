using optimizerDuck.UI.ViewModels.Pages;
using Wpf.Ui.Abstractions.Controls;

namespace optimizerDuck.UI.Pages;

public partial class FreeFirePage : INavigableView<FreeFireViewModel>
{
    public FreeFirePage(FreeFireViewModel viewModel)
    {
        ViewModel = viewModel;
        DataContext = this;
        InitializeComponent();
    }

    public FreeFireViewModel ViewModel { get; }
}
