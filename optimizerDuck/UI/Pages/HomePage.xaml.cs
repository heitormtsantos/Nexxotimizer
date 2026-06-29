using System.Windows.Media.Imaging;
using System.Windows.Threading;
using optimizerDuck.UI.ViewModels.Pages;
using Wpf.Ui.Abstractions.Controls;

namespace optimizerDuck.UI.Pages;

public partial class HomePage : INavigableView<HomeViewModel>
{
    private readonly DispatcherTimer _carouselTimer;
    private readonly Uri[] _promoImages =
    [
        new("pack://application:,,,/Resources/Images/HomeCarousel2.png", UriKind.Absolute),
        new("pack://application:,,,/Resources/Images/Assine.png", UriKind.Absolute),
    ];

    private int _promoImageIndex;

    public HomePage(HomeViewModel viewModel)
    {
        ViewModel = viewModel;
        DataContext = this;

        InitializeComponent();

        HomePromoImage.Source = new BitmapImage(_promoImages[0]);

        _carouselTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromSeconds(4),
        };
        _carouselTimer.Tick += OnCarouselTimerTick;
        _carouselTimer.Start();

        Unloaded += OnUnloaded;
    }

    public HomeViewModel ViewModel { get; }

    private void OnCarouselTimerTick(object? sender, EventArgs e)
    {
        _promoImageIndex = (_promoImageIndex + 1) % _promoImages.Length;
        HomePromoImage.Source = new BitmapImage(_promoImages[_promoImageIndex]);
    }

    private void OnUnloaded(object sender, System.Windows.RoutedEventArgs e)
    {
        _carouselTimer.Stop();
        _carouselTimer.Tick -= OnCarouselTimerTick;
        Unloaded -= OnUnloaded;
    }
}
