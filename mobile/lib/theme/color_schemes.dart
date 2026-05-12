import 'package:flutter/material.dart';

/// Semantic color tokens that map to Kurator's CSS custom properties.
class KuratorColors {
  const KuratorColors({
    required this.bg,
    required this.main,
    required this.surface,
    required this.border,
    required this.accent,
    required this.muted,
    required this.fg,
    required this.onAccent,
    required this.brightness,
  });

  final Color bg;
  final Color main;
  final Color surface;
  final Color border;
  final Color accent;
  final Color muted;
  final Color fg;
  final Color onAccent;
  final Brightness brightness;
}

enum KuratorPalette {
  defaultKurator,
  darcula,
  catppuccin,
  solarized,
  outrun,
  accessibleOkabe,
  accessibleHighContrast,
}

extension KuratorPaletteLabel on KuratorPalette {
  String get label => switch (this) {
        KuratorPalette.defaultKurator => 'Default',
        KuratorPalette.darcula => 'Darcula',
        KuratorPalette.catppuccin => 'Catppuccin',
        KuratorPalette.solarized => 'Solarized',
        KuratorPalette.outrun => 'Outrun',
        KuratorPalette.accessibleOkabe => 'Okabe–Ito',
        KuratorPalette.accessibleHighContrast => 'High Contrast',
      };

  String get id => switch (this) {
        KuratorPalette.defaultKurator => 'default',
        KuratorPalette.darcula => 'darcula',
        KuratorPalette.catppuccin => 'catppuccin',
        KuratorPalette.solarized => 'solarized',
        KuratorPalette.outrun => 'outrun',
        KuratorPalette.accessibleOkabe => 'accessible_okabe',
        KuratorPalette.accessibleHighContrast => 'accessible_high_contrast',
      };
}

/// Returns [KuratorColors] for the given palette + brightness.
KuratorColors kuratorColors(KuratorPalette palette, Brightness brightness) {
  final light = brightness == Brightness.light;
  return switch (palette) {
    KuratorPalette.defaultKurator => light
        ? const KuratorColors(
            bg: Color(0xFFE8EDF5),
            main: Color(0xFFF6F9FD),
            surface: Color(0xFFE7EEF9),
            border: Color(0xFFD0DBEB),
            accent: Color(0xFF5168CF),
            muted: Color(0xFF5C6D86),
            fg: Color(0xFF1C2738),
            onAccent: Color(0xFFFFFFFF),
            brightness: Brightness.light,
          )
        : const KuratorColors(
            bg: Color(0xFF0C0F14),
            main: Color(0xFF111620),
            surface: Color(0xFF151C28),
            border: Color(0xFF243042),
            accent: Color(0xFF3D9CF0),
            muted: Color(0xFF8B9CB3),
            fg: Color(0xFFF4F4F5),
            onAccent: Color(0xFFFFFFFF),
            brightness: Brightness.dark,
          ),
    KuratorPalette.darcula => light
        ? const KuratorColors(
            bg: Color(0xFFE8EDF5),
            main: Color(0xFFF6F9FD),
            surface: Color(0xFFE7EEF9),
            border: Color(0xFFD0DBEB),
            accent: Color(0xFF5168CF),
            muted: Color(0xFF5C6D86),
            fg: Color(0xFF1C2738),
            onAccent: Color(0xFFFFFFFF),
            brightness: Brightness.light,
          )
        : const KuratorColors(
            bg: Color(0xFF2B2B2B),
            main: Color(0xFF303030),
            surface: Color(0xFF3D3D3D),
            border: Color(0xFF4E4E52),
            accent: Color(0xFF6A9FB5),
            muted: Color(0xFF8C8C8C),
            fg: Color(0xFFC8D0D8),
            onAccent: Color(0xFF1A1A1A),
            brightness: Brightness.dark,
          ),
    KuratorPalette.catppuccin => light
        ? const KuratorColors(
            bg: Color(0xFFEFF1F5),
            main: Color(0xFFF6F7FB),
            surface: Color(0xFFE2E6EF),
            border: Color(0xFFCCD0DA),
            accent: Color(0xFF1E66F5),
            muted: Color(0xFF6C6F85),
            fg: Color(0xFF4C4F69),
            onAccent: Color(0xFFEFF1F5),
            brightness: Brightness.light,
          )
        : const KuratorColors(
            bg: Color(0xFF1E1E2E),
            main: Color(0xFF242438),
            surface: Color(0xFF11111B),
            border: Color(0xFF313244),
            accent: Color(0xFF89B4FA),
            muted: Color(0xFFA6ADC8),
            fg: Color(0xFFCDD6F4),
            onAccent: Color(0xFF1E1E2E),
            brightness: Brightness.dark,
          ),
    KuratorPalette.solarized => light
        ? const KuratorColors(
            bg: Color(0xFFFDF6E3),
            main: Color(0xFFFEFBF4),
            surface: Color(0xFFEBE3CF),
            border: Color(0xFF93A1A1),
            accent: Color(0xFF268BD2),
            muted: Color(0xFF657B83),
            fg: Color(0xFF073642),
            onAccent: Color(0xFFFDF6E3),
            brightness: Brightness.light,
          )
        : const KuratorColors(
            bg: Color(0xFF002B36),
            main: Color(0xFF063542),
            surface: Color(0xFF0A3A47),
            border: Color(0xFF586E75),
            accent: Color(0xFF268BD2),
            muted: Color(0xFF839496),
            fg: Color(0xFFEEE8D5),
            onAccent: Color(0xFF002B36),
            brightness: Brightness.dark,
          ),
    KuratorPalette.outrun => light
        ? const KuratorColors(
            bg: Color(0xFFF8EFFF),
            main: Color(0xFFFCF8FF),
            surface: Color(0xFFF0E4FB),
            border: Color(0xFFE9C7F0),
            accent: Color(0xFFDB2777),
            muted: Color(0xFF7C6B9E),
            fg: Color(0xFF2D1A4A),
            onAccent: Color(0xFFFFF7FB),
            brightness: Brightness.light,
          )
        : const KuratorColors(
            bg: Color(0xFF0B0614),
            main: Color(0xFF120A22),
            surface: Color(0xFF1A0D32),
            border: Color(0xFF6D28D9),
            accent: Color(0xFF22D3EE),
            muted: Color(0xFFC4B5FD),
            fg: Color(0xFFFAF5FF),
            onAccent: Color(0xFF0B0614),
            brightness: Brightness.dark,
          ),
    KuratorPalette.accessibleOkabe => light
        ? const KuratorColors(
            bg: Color(0xFFF2F2F2),
            main: Color(0xFFFAFAFA),
            surface: Color(0xFFFFFFFF),
            border: Color(0xFF333333),
            accent: Color(0xFF0072B2),
            muted: Color(0xFF444444),
            fg: Color(0xFF000000),
            onAccent: Color(0xFFFFFFFF),
            brightness: Brightness.light,
          )
        : const KuratorColors(
            bg: Color(0xFF1A1A1A),
            main: Color(0xFF222222),
            surface: Color(0xFF2E2E2E),
            border: Color(0xFF666666),
            accent: Color(0xFF56B4E9),
            muted: Color(0xFFB5B5B5),
            fg: Color(0xFFF5F5F5),
            onAccent: Color(0xFF0D0D0D),
            brightness: Brightness.dark,
          ),
    KuratorPalette.accessibleHighContrast => light
        ? const KuratorColors(
            bg: Color(0xFFFFFFFF),
            main: Color(0xFFF7F7F7),
            surface: Color(0xFFFFFFFF),
            border: Color(0xFF000000),
            accent: Color(0xFF0000C0),
            muted: Color(0xFF1A1A1A),
            fg: Color(0xFF000000),
            onAccent: Color(0xFFFFFFFF),
            brightness: Brightness.light,
          )
        : const KuratorColors(
            bg: Color(0xFF000000),
            main: Color(0xFF0C0C0C),
            surface: Color(0xFF141414),
            border: Color(0xFFFFFFFF),
            accent: Color(0xFFFFFF66),
            muted: Color(0xFFE0E0E0),
            fg: Color(0xFFFFFFFF),
            onAccent: Color(0xFF000000),
            brightness: Brightness.dark,
          ),
  };
}
