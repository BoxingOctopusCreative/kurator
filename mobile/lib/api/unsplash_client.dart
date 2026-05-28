import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'kurator_api_config.dart';
import '../models/unsplash_models.dart';

/// Set to `false` in widget tests to skip outbound Unsplash HTTP (avoids pending Dio timers).
bool kuratorUnsplashNetworkEnabled = true;

/// Read-only client for public Unsplash proxy routes (no cookies, no API secrets).
class UnsplashClient {
  UnsplashClient._(this._dio);

  final Dio _dio;

  static UnsplashClient create() {
    final dio = Dio(
      BaseOptions(
        baseUrl: kuratorUnsplashBaseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 20),
        headers: const {
          'Accept': 'application/json',
        },
        validateStatus: (s) => s != null && s < 500,
      ),
    );
    return UnsplashClient._(dio);
  }

  Future<UnsplashBackgroundPayload?> fetchMarketingBackground() async {
    if (!kuratorUnsplashNetworkEnabled) return null;
    try {
      final res = await _dio.get<dynamic>('/api/unsplash-background');
      if (res.statusCode != 200 || res.data is! Map) return null;
      final map = Map<String, dynamic>.from(res.data as Map);
      final payload = UnsplashBackgroundPayload.fromJson(map);
      if (payload.url.isEmpty) return null;
      return payload;
    } catch (e, st) {
      debugPrint('UnsplashClient.fetchMarketingBackground: $e\n$st');
      return null;
    }
  }

  /// Banner image URL for in-app heroes (`/api/unsplash-page-banner?path=…`).
  Future<String?> fetchPageBannerUrl(String path, {CancelToken? cancelToken}) async {
    if (!kuratorUnsplashNetworkEnabled) return null;
    try {
      final res = await _dio.get<dynamic>(
        '/api/unsplash-page-banner',
        queryParameters: {'path': path},
        cancelToken: cancelToken,
      );
      if (res.statusCode != 200 || res.data is! Map) return null;
      final map = Map<String, dynamic>.from(res.data as Map);
      final url = map['url'] as String? ?? map['imageUrl'] as String?;
      if (url == null || url.isEmpty) return null;
      return url;
    } catch (e, st) {
      debugPrint('UnsplashClient.fetchPageBannerUrl: $e\n$st');
      return null;
    }
  }
}
