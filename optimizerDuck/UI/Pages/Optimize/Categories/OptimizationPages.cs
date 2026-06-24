using optimizerDuck.UI.Pages.Optimizations;
using optimizerDuck.UI.ViewModels.Optimizer;
using optimizerDuck.Services.UI;

namespace optimizerDuck.UI.Pages.Optimize.Categories;

public sealed class PowerManagementOptimizerPage : OptimizationPage
{
    public PowerManagementOptimizerPage(
        OptimizationCategoryViewModel viewModel,
        ActivationService activation
    )
        : base(viewModel, activation)
    {
        InitializeComponent();
    }
}

public sealed class UserExperienceOptimizerPage : OptimizationPage
{
    public UserExperienceOptimizerPage(
        OptimizationCategoryViewModel viewModel,
        ActivationService activation
    )
        : base(viewModel, activation)
    {
        InitializeComponent();
    }
}

public sealed class BloatwareAndServicesOptimizerPage : OptimizationPage
{
    public BloatwareAndServicesOptimizerPage(
        OptimizationCategoryViewModel viewModel,
        ActivationService activation
    )
        : base(viewModel, activation)
    {
        InitializeComponent();
    }
}

public sealed class GpuOptimizerPage : OptimizationPage
{
    public GpuOptimizerPage(
        OptimizationCategoryViewModel viewModel,
        ActivationService activation
    )
        : base(viewModel, activation)
    {
        InitializeComponent();
    }
}

public sealed class PerformanceOptimizerPage : OptimizationPage
{
    public PerformanceOptimizerPage(
        OptimizationCategoryViewModel viewModel,
        ActivationService activation
    )
        : base(viewModel, activation)
    {
        InitializeComponent();
    }
}

public sealed class SecurityAndPrivacyOptimizerPage : OptimizationPage
{
    public SecurityAndPrivacyOptimizerPage(
        OptimizationCategoryViewModel viewModel,
        ActivationService activation
    )
        : base(viewModel, activation)
    {
        InitializeComponent();
    }
}
