import 'package:flutter_test/flutter_test.dart';
import 'package:kurator_mobile/api/unsplash_client.dart';
import 'package:kurator_mobile/main.dart';
import 'package:kurator_mobile/providers/session_provider.dart';
import 'package:kurator_mobile/providers/theme_provider.dart';
import 'package:kurator_mobile/services/unsplash_background_cache.dart';
import 'package:kurator_mobile/widgets/page_hero_unsplash.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    kuratorUnsplashNetworkEnabled = false;
    PageHeroUnsplash.fetchRemoteBanner = false;
  });

  tearDown(() {
    kuratorUnsplashNetworkEnabled = true;
    PageHeroUnsplash.fetchRemoteBanner = true;
  });

  testWidgets('KuratorApp builds', (WidgetTester tester) async {
    final unsplashCache = await UnsplashBackgroundCache.open();
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider.value(value: SessionProvider.disabled()),
          ChangeNotifierProvider(create: (_) => ThemeProvider()),
          Provider<UnsplashBackgroundCache>.value(value: unsplashCache),
        ],
        child: const KuratorApp(),
      ),
    );
    await tester.pump();
    expect(find.text('Log in'), findsOneWidget);
    expect(find.text('Sign up'), findsOneWidget);
  });
}
