import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../theme/color_schemes.dart';
import '../providers/theme_provider.dart';
import '../widgets/kurator_card.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'Appearance',
          style: TextStyle(
            color: c.fg,
            fontSize: 22,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 20),
        const _ThemeModeSection(),
        const SizedBox(height: 20),
        const _PaletteSection(),
      ],
    );
  }
}

class _ThemeModeSection extends StatelessWidget {
  const _ThemeModeSection();

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final provider = context.watch<ThemeProvider>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Color Mode',
          style: TextStyle(
            color: c.fg,
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            for (final mode in [ThemeMode.light, ThemeMode.system, ThemeMode.dark])
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(right: mode == ThemeMode.dark ? 0 : 8),
                  child: _ThemeModeChip(
                    mode: mode,
                    selected: provider.themeMode == mode,
                    onTap: () => provider.setThemeMode(mode),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _ThemeModeChip extends StatelessWidget {
  const _ThemeModeChip({
    required this.mode,
    required this.selected,
    required this.onTap,
  });

  final ThemeMode mode;
  final bool selected;
  final VoidCallback onTap;

  String get label => switch (mode) {
        ThemeMode.light => 'Light',
        ThemeMode.dark => 'Dark',
        ThemeMode.system => 'System',
      };

  IconData get icon => switch (mode) {
        ThemeMode.light => Icons.light_mode_outlined,
        ThemeMode.dark => Icons.dark_mode_outlined,
        ThemeMode.system => Icons.brightness_auto_outlined,
      };

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: selected ? c.accent.withValues(alpha: 0.12) : c.surface,
          border: Border.all(
            color: selected ? c.accent : c.border,
            width: selected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          children: [
            Icon(
              icon,
              color: selected ? c.accent : c.muted,
              size: 20,
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                color: selected ? c.accent : c.muted,
                fontSize: 12,
                fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaletteSection extends StatelessWidget {
  const _PaletteSection();

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final provider = context.watch<ThemeProvider>();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Color Palette',
          style: TextStyle(
            color: c.fg,
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),
        for (final palette in KuratorPalette.values)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _PaletteRow(
              palette: palette,
              selected: provider.palette == palette,
              onTap: () => provider.setPalette(palette),
            ),
          ),
      ],
    );
  }
}

class _PaletteRow extends StatelessWidget {
  const _PaletteRow({
    required this.palette,
    required this.selected,
    required this.onTap,
  });

  final KuratorPalette palette;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final brightness = Theme.of(context).brightness;
    final swatch = kuratorColors(palette, brightness);

    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: c.surface,
          border: Border.all(
            color: selected ? c.accent : c.border,
            width: selected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Row(
              children: [
                for (final color in [swatch.bg, swatch.surface, swatch.accent, swatch.fg])
                  Container(
                    width: 18,
                    height: 18,
                    margin: const EdgeInsets.only(right: 3),
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                      border: Border.all(color: c.border.withValues(alpha: 0.5)),
                    ),
                  ),
              ],
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                palette.label,
                style: TextStyle(
                  color: c.fg,
                  fontSize: 14,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ),
            if (selected)
              Icon(Icons.check_circle, color: c.accent, size: 18),
          ],
        ),
      ),
    );
  }
}
