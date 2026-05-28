import 'package:flutter/foundation.dart';

const String _defaultApiBase = 'https://api.kuratorapp.cc';
const String _defaultUnsplashBase = 'https://kuratorapp.cc';

/// Raw compile-time value from `--dart-define=KURATOR_API_BASE=...` (see [kuratorApiBaseUrl]).
const String _kuratorApiBaseFromEnv = String.fromEnvironment(
  'KURATOR_API_BASE',
  defaultValue: _defaultApiBase,
);

/// Raw compile-time value from `--dart-define=KURATOR_UNSPLASH_BASE=...`.
const String _kuratorUnsplashBaseFromEnv = String.fromEnvironment(
  'KURATOR_UNSPLASH_BASE',
  defaultValue: _defaultUnsplashBase,
);

String _normalizeOrigin(String raw, String fallback) {
  var s = raw.trim();
  while (s.endsWith('/')) {
    s = s.substring(0, s.length - 1);
  }
  if (s.isEmpty) return fallback;
  final u = Uri.tryParse(s);
  if (u == null || !u.hasScheme || u.host.isEmpty) return fallback;
  return s;
}

/// Production Kurator **REST** API (OpenAPI: https://swagger.kuratorapp.cc).
///
/// Must be the **Go API host** (session + `/api/v1/...`), not the Next.js web origin.
/// Override for staging or local dev, for example:
/// `flutter run --dart-define=KURATOR_API_BASE=http://127.0.0.1:8080`
String get kuratorApiBaseUrl =>
    _normalizeOrigin(_kuratorApiBaseFromEnv, _defaultApiBase);

/// Public web origin for Next.js routes that proxy Unsplash (`/api/unsplash-background`, etc.).
String get kuratorUnsplashBaseUrl =>
    _normalizeOrigin(_kuratorUnsplashBaseFromEnv, _defaultUnsplashBase);

void assertKuratorApiBaseLooksValid() {
  assert(() {
    final u = Uri.tryParse(kuratorApiBaseUrl);
    if (u == null || !u.hasScheme || u.host.isEmpty) {
      debugPrint('Invalid KURATOR_API_BASE: $kuratorApiBaseUrl');
    }
    return true;
  }());
}
