import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../theme/color_schemes.dart';

class ThemeProvider extends ChangeNotifier {
  ThemeProvider() {
    _load();
  }

  KuratorPalette _palette = KuratorPalette.defaultKurator;
  ThemeMode _mode = ThemeMode.dark;

  KuratorPalette get palette => _palette;
  ThemeMode get themeMode => _mode;

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final palId = prefs.getString('palette') ?? 'default';
    final modeStr = prefs.getString('theme_mode') ?? 'dark';

    _palette = KuratorPalette.values.firstWhere(
      (p) => p.id == palId,
      orElse: () => KuratorPalette.defaultKurator,
    );
    _mode = switch (modeStr) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
    notifyListeners();
  }

  Future<void> setPalette(KuratorPalette palette) async {
    _palette = palette;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('palette', palette.id);
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    _mode = mode;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      'theme_mode',
      switch (mode) {
        ThemeMode.light => 'light',
        ThemeMode.dark => 'dark',
        ThemeMode.system => 'system',
      },
    );
  }
}
