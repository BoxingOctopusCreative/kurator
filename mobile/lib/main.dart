import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'providers/theme_provider.dart';
import 'theme/app_theme.dart';
import 'theme/color_schemes.dart';
import 'router.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ChangeNotifierProvider(
      create: (_) => ThemeProvider(),
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
