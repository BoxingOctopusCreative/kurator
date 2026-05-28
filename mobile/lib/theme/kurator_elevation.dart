import 'package:flutter/material.dart';

/// Layered shadows approximating web utilities (`shadow-surface`, `shadow-hero-bottom`, `shadow-dropdown`).
List<BoxShadow> kuratorElevationSurface(Brightness b) {
  final alpha = b == Brightness.dark ? 0.45 : 0.08;
  return [
    BoxShadow(
      color: Colors.black.withValues(alpha: alpha),
      blurRadius: 12,
      offset: const Offset(0, 4),
      spreadRadius: 0,
    ),
    BoxShadow(
      color: Colors.black.withValues(alpha: alpha * 0.5),
      blurRadius: 4,
      offset: const Offset(0, 1),
    ),
  ];
}

List<BoxShadow> kuratorElevationHeroBottom(Brightness b) {
  final a = b == Brightness.dark ? 0.35 : 0.12;
  return [
    BoxShadow(
      color: Colors.black.withValues(alpha: a),
      blurRadius: 16,
      offset: const Offset(0, 8),
    ),
  ];
}

List<BoxShadow> kuratorElevationDropdown(Brightness b) {
  final a = b == Brightness.dark ? 0.55 : 0.18;
  return [
    BoxShadow(
      color: Colors.black.withValues(alpha: a),
      blurRadius: 24,
      offset: const Offset(0, 12),
      spreadRadius: -4,
    ),
    BoxShadow(
      color: Colors.black.withValues(alpha: a * 0.6),
      blurRadius: 8,
      offset: const Offset(0, 4),
    ),
  ];
}

/// Dialog / modal surface: strong panel shadow, no reliance on dimmed scrim (see memory-flutter-ui-port).
List<BoxShadow> kuratorElevationFloatingPanel(Brightness b) =>
    kuratorElevationDropdown(b);

extension KuratorElevationContext on BuildContext {
  Brightness get _b => Theme.of(this).brightness;

  List<BoxShadow> get kuratorSurfaceShadow => kuratorElevationSurface(_b);
  List<BoxShadow> get kuratorHeroBottomShadow => kuratorElevationHeroBottom(_b);
  List<BoxShadow> get kuratorDropdownShadow => kuratorElevationDropdown(_b);
}
