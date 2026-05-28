import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'api/kurator_api.dart';
import 'providers/session_provider.dart';
import 'providers/theme_provider.dart';
import 'services/unsplash_background_cache.dart';
import 'theme/app_theme.dart';
import 'theme/color_schemes.dart';
import 'router.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = await KuratorApi.create();
  final session = SessionProvider(api);
  final unsplashCache = await UnsplashBackgroundCache.open();
  await session.bootstrap();
  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: session),
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
        Provider<UnsplashBackgroundCache>.value(value: unsplashCache),
      ],
      child: const KuratorApp(),
    ),
  );
}

class KuratorApp extends StatelessWidget {
  const KuratorApp({super.key});

  @override
  Widget build(BuildContext context) {
    final themeProvider = context.watch<ThemeProvider>();
    final palette = themeProvider.palette;

    final lightColors = kuratorColors(palette, Brightness.light);
    final darkColors = kuratorColors(palette, Brightness.dark);

    return MaterialApp.router(
      title: 'Kurator',
      debugShowCheckedModeBanner: false,
      themeMode: themeProvider.themeMode,
      theme: buildKuratorTheme(lightColors),
      darkTheme: buildKuratorTheme(darkColors),
      routerConfig: router,
    );
  }
}
