import 'package:flutter/material.dart';

/// Adobe Fonts / Typekit registers Futura PT as `futura-pt` (same as web).
///
/// Add licensed `.otf` files under `assets/fonts/futura_pt/` and declare them
/// in [pubspec.yaml] so this family resolves; otherwise the platform falls back.
const String kFuturaPtFontFamily = 'futura-pt';

TextStyle kuratorFuturaPt({
  Color? color,
  double? fontSize,
  FontWeight? fontWeight,
  double? height,
  double? letterSpacing,
  TextDecoration? decoration,
}) =>
    TextStyle(
      fontFamily: kFuturaPtFontFamily,
      color: color,
      fontSize: fontSize,
      fontWeight: fontWeight,
      height: height,
      letterSpacing: letterSpacing,
      decoration: decoration,
    );
