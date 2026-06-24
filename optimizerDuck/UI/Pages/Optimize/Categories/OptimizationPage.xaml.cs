using optimizerDuck.Services.UI;
using optimizerDuck.UI.ViewModels.Optimizer;
using Wpf.Ui.Abstractions.Controls;

namespace optimizerDuck.UI.Pages.Optimizations;

public partial class OptimizationPage : INavigableView<OptimizationCategoryViewModel>
{
    public OptimizationPage(
        OptimizationCategoryViewModel viewModel,
        ActivationService activation
    )
    {
        ViewModel = viewModel;
        Activation = activation;
        DataContext = this;

        InitializeComponent();
    }

    public OptimizationCategoryViewModel ViewModel { get; }

    public ActivationService Activation { get; }
}
