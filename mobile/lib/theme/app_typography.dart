import 'package:flutter/material.dart';

import 'app_fonts.dart';

/// Wide logo used on marketing / login (web `Logo-Black-Wide-Transparent.png`).
const String kKuratorWideLogoUrl =
    'https://assets.kuratorapp.cc/Logo-Black-Wide-Transparent.png';

/// Page hero H1: Futura PT Condensed 800 caps on web; use heavy Futura PT + tracking here.
TextStyle kuratorPageHeroTitleStyle(Color fg) {
  return kuratorFuturaPt(
    color: fg,
    fontSize: 32,
    fontWeight: FontWeight.w800,
    letterSpacing: 0.02 * 32,
    height: 1.05,
  );
}

/// Shelf titles, section headings — Futura PT bold 700.
TextStyle kuratorSectionTitleStyle(Color fg) {
  return kuratorFuturaPt(
    color: fg,
    fontSize: 17,
    fontWeight: FontWeight.w700,
    height: 1.25,
  );
}

/// Item titles: mixed case, weight 700 (`.kurator-item-title`).
TextStyle kuratorItemTitleStyle(Color fg, {double fontSize = 13}) {
  return kuratorFuturaPt(
    color: fg,
    fontSize: fontSize,
    fontWeight: FontWeight.w700,
    height: 1.2,
  );
}

/// Panel titles (modals): ~text-3xl / 600 on web.
TextStyle kuratorPanelTitleStyle(Color fg) {
  return kuratorFuturaPt(
    color: fg,
    fontSize: 28,
    fontWeight: FontWeight.w600,
    height: 1.15,
  );
}

TextTheme kuratorFuturaTextTheme(TextTheme base, Color fg) {
  return base.apply(
    fontFamily: kFuturaPtFontFamily,
    bodyColor: fg,
    displayColor: fg,
  );
}
