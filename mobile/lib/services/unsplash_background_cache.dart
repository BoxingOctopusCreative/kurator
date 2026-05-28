import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/unsplash_models.dart';

/// Keys aligned with web `unsplash-background-cache.ts`.
const _kPayloadKey = 'kurator-unsplash-bg-v1';
const _kLastGoodKey = 'kurator-unsplash-bg-last-v1';

/// Short TTL before revalidating in background (web uses similar behavior).
const unsplashBackgroundTtl = Duration(minutes: 30);

class UnsplashBackgroundCache {
  UnsplashBackgroundCache._(this._prefs);
  final SharedPreferences _prefs;

  static Future<UnsplashBackgroundCache> open() async {
    final p = await SharedPreferences.getInstance();
    return UnsplashBackgroundCache._(p);
  }

  UnsplashBackgroundPayload? readFreshPayload() {
    final raw = _prefs.getString(_kPayloadKey);
    if (raw == null) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final at = DateTime.tryParse(map['_cachedAt'] as String? ?? '');
      if (at != null && DateTime.now().difference(at) > unsplashBackgroundTtl) {
        return null;
      }
      final data = map['data'] as Map<String, dynamic>?;
      if (data == null) return null;
      return UnsplashBackgroundPayload.fromJson(data);
    } catch (_) {
      return null;
    }
  }

  UnsplashBackgroundPayload? readLastGoodPayload() {
    final raw = _prefs.getString(_kLastGoodKey);
    if (raw == null) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return UnsplashBackgroundPayload.fromJson(map);
    } catch (_) {
      return null;
    }
  }

  Future<void> writePayload(UnsplashBackgroundPayload p) async {
    final envelope = jsonEncode({
      '_cachedAt': DateTime.now().toIso8601String(),
      'data': {
        'url': p.url,
        'photographer': p.photographer,
        'photographerUrl': p.photographerUrl,
        'photoPageUrl': p.photoPageUrl,
        'query': p.query,
      },
    });
    await _prefs.setString(_kPayloadKey, envelope);
    await _prefs.setString(
      _kLastGoodKey,
      jsonEncode({
        'url': p.url,
        'photographer': p.photographer,
        'photographerUrl': p.photographerUrl,
        'photoPageUrl': p.photoPageUrl,
        'query': p.query,
      }),
    );
  }
}
