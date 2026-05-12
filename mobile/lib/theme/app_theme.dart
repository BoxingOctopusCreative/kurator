import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'color_schemes.dart';

/// Builds a [ThemeData] from Kurator semantic color tokens.
ThemeData buildKuratorTheme(KuratorColors c) {
  final textTheme = GoogleFonts.cabinTextTheme(
    ThemeData(brightness: c.brightness).textTheme,
  ).apply(
    bodyColor: c.fg,
    displayColor: c.fg,
  );

  final colorScheme = ColorScheme(
    brightness: c.brightness,
    primary: c.accent,
    onPrimary: c.onAccent,
    secondary: c.muted,
    onSecondary: c.bg,
    surface: c.surface,
    onSurface: c.fg,
    error: const Color(0xFFCF6679),
    onError: Colors.white,
  );

  return ThemeData(
    useMaterial3: true,
    brightness: c.brightness,
    colorScheme: colorScheme,
    textTheme: textTheme,
    scaffoldBackgroundColor: c.bg,
    cardColor: c.surface,
    dividerColor: c.border,
    appBarTheme: AppBarTheme(
      backgroundColor: c.surface.withValues(alpha: 0.95),
      foregroundColor: c.fg,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: GoogleFonts.cabin(
        color: c.fg,
        fontSize: 18,
        fontWeight: FontWeight.w600,
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.surface.withValues(alpha: 0.95),
      indicatorColor: c.border,
      labelTextStyle: WidgetStatePropertyAll(
        GoogleFonts.cabin(
          fontSize: 11,
          fontWeight: FontWeight.w500,
        ),
      ),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        return IconThemeData(
          color: states.contains(WidgetState.selected) ? c.accent : c.muted,
          size: 22,
        );
      }),
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
    ),
    cardTheme: CardThemeData(
      color: c.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: c.border),
      ),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.main,
      labelStyle: TextStyle(color: c.muted, fontSize: 14),
      hintStyle: TextStyle(color: c.muted.withValues(alpha: 0.7), fontSize: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: c.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: c.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: c.accent, width: 2),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: c.accent,
        foregroundColor: c.onAccent,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: GoogleFonts.cabin(fontSize: 14, fontWeight: FontWeight.w500),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.fg,
        side: BorderSide(color: c.border),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: GoogleFonts.cabin(fontSize: 14, fontWeight: FontWeight.w500),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: c.accent,
        textStyle: GoogleFonts.cabin(fontSize: 14, fontWeight: FontWeight.w500),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: c.surface,
      labelStyle: TextStyle(color: c.fg, fontSize: 13),
      side: BorderSide(color: c.border),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
    dividerTheme: DividerThemeData(
      color: c.border,
      thickness: 1,
      space: 1,
    ),
    extensions: [KuratorThemeExtension(colors: c)],
  );
}

/// Theme extension so widgets can access Kurator tokens directly.
class KuratorThemeExtension extends ThemeExtension<KuratorThemeExtension> {
  const KuratorThemeExtension({required this.colors});
  final KuratorColors colors;

  @override
  KuratorThemeExtension copyWith({KuratorColors? colors}) =>
      KuratorThemeExtension(colors: colors ?? this.colors);

  @override
  KuratorThemeExtension lerp(KuratorThemeExtension? other, double t) => this;
}

extension BuildContextKuratorTheme on BuildContext {
  KuratorColors get kColors =>
      Theme.of(this).extension<KuratorThemeExtension>()!.colors;
}
