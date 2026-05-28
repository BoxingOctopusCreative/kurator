import 'dart:ui';

import 'package:flutter/material.dart';

import '../theme/app_typography.dart';
import '../theme/color_schemes.dart';
import '../util/safe_image_url.dart';

/// Full-viewport marketing / auth background (web `UnsplashMarketingShell`).
///
/// Stack (bottom → top): cover image (~1.03 scale), black dim (stronger in dark mode),
/// `kurator-bg` veil + light blur, vertical gradient toward bottom, then [foreground].
class UnsplashMarketingShell extends StatelessWidget {
  const UnsplashMarketingShell({
    super.key,
    required this.colors,
    required this.foreground,
    this.imageUrl,
    this.attribution,
  });

  final KuratorColors colors;
  final Widget foreground;
  final String? imageUrl;
  final Widget? attribution;

  @override
  Widget build(BuildContext context) {
    final safeUrl = safeHttpsImageUrl(imageUrl);
    final isDark = colors.brightness == Brightness.dark;
    // Dark mode: pull bright Unsplash photos down before semantic-bg veils.
    final photoDim = isDark ? 0.48 : 0.22;
    final bgVeil = isDark ? 0.58 : 0.45;
    final gradientFloor = isDark ? 0.88 : 0.72;

    return ColoredBox(
      color: colors.bg,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (safeUrl != null)
            Transform.scale(
              scale: 1.03,
              child: Image.network(
                safeUrl,
                fit: BoxFit.cover,
                alignment: Alignment.center,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),
          ColoredBox(color: Colors.black.withValues(alpha: photoDim)),
          // Semantic-bg veil + subtle blur (web: kurator-bg/45 + backdrop-blur)
          BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 1.2, sigmaY: 1.2),
            child: ColoredBox(
              color: colors.bg.withValues(alpha: bgVeil),
            ),
          ),
          // Gradient: calm field toward bottom for form legibility
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.transparent,
                  colors.bg.withValues(alpha: gradientFloor),
                ],
                stops: const [0.35, 1],
              ),
            ),
          ),
          foreground,
          if (attribution != null)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: attribution!,
            ),
        ],
      ),
    );
  }
}

/// Stacked drop-shadows for the wide logo on busy photos (`kurator-logo-shadow`).
Widget kuratorWideLogoWithShadow({
  required double width,
}) {
  return Container(
    decoration: const BoxDecoration(
      boxShadow: [
        BoxShadow(
          color: Color(0x66000000),
          blurRadius: 24,
          offset: Offset(0, 4),
        ),
        BoxShadow(
          color: Color(0x44000000),
          blurRadius: 8,
          offset: Offset(0, 2),
        ),
      ],
    ),
    child: Image.network(
      kKuratorWideLogoUrl,
      width: width,
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => const SizedBox.shrink(),
    ),
  );
}
