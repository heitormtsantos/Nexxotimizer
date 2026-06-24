using optimizerDuck.UI.ViewModels.Pages;
using optimizerDuck.Services.UI;

namespace optimizerDuck.UI.Pages.Customize.Categories;

public sealed class PreferencesFeatureCategory : CustomizeCategoryPage
{
    public PreferencesFeatureCategory(
        CustomizeCategoryViewModel viewModel,
        ActivationService activation
    )
        : base(viewModel, activation)
    {
        InitializeComponent();
    }
}

public sealed class SystemFeatureCategory : CustomizeCategoryPage
{
    public SystemFeatureCategory(
        CustomizeCategoryViewModel viewModel,
        ActivationService activation
    )
        : base(viewModel, activation)
    {
        InitializeComponent();
    }
}

public sealed class GamingFeatureCategory : CustomizeCategoryPage
{
    public GamingFeatureCategory(
        CustomizeCategoryViewModel viewModel,
        ActivationService activation
    )
        : base(viewModel, activation)
    {
        InitializeComponent();
    }
}

public sealed class DesktopFeatureCategory : CustomizeCategoryPage
{
    public DesktopFeatureCategory(
        CustomizeCategoryViewModel viewModel,
        ActivationService activation
    )
        : base(viewModel, activation)
    {
        InitializeComponent();
    }
}
