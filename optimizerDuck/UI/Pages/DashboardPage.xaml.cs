using System;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using optimizerDuck.Services.UI;
using optimizerDuck.UI.ViewModels.Pages;
using Wpf.Ui.Abstractions.Controls;

namespace optimizerDuck.UI.Pages;

public partial class DashboardPage : INavigableView<DashboardViewModel>
{
    private readonly DispatcherTimer _heroCarouselTimer = new() { Interval = TimeSpan.FromSeconds(4) };
    private readonly string[] _heroImages =
    [
        "pack://application:,,,/Resources/Images/PerformanceCarousel1.png",
        "pack://application:,,,/Resources/Images/PerformanceCarousel2.png",
        "pack://application:,,,/Resources/Images/PerformanceCarousel3.png",
        "pack://application:,,,/Resources/Images/PerformanceCarousel4.png"
    ];

    private int _heroImageIndex;

    public DashboardPage(DashboardViewModel viewModel, ActivationService activation)
    {
        ViewModel = viewModel;
        Activation = activation;
        DataContext = this;

        InitializeComponent();

        Loaded += OnLoaded;
        Unloaded += OnUnloaded;
        _heroCarouselTimer.Tick += OnHeroCarouselTick;
    }

    public DashboardViewModel ViewModel { get; }

    public ActivationService Activation { get; }

    private void OnLoaded(object sender, System.Windows.RoutedEventArgs e)
    {
        _heroImageIndex = 0;
        ApplyHeroImage();
        _heroCarouselTimer.Start();
    }

    private void OnUnloaded(object sender, System.Windows.RoutedEventArgs e)
    {
        _heroCarouselTimer.Stop();
    }

    private void OnHeroCarouselTick(object? sender, EventArgs e)
    {
        _heroImageIndex = (_heroImageIndex + 1) % _heroImages.Length;
        ApplyHeroImage();
    }

    private void ApplyHeroImage()
    {
        DashboardHeroImage.Source = new BitmapImage(new Uri(_heroImages[_heroImageIndex], UriKind.Absolute));
    }
}
