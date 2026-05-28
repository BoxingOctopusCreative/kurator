import 'package:flutter/foundation.dart';
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'kurator_api_config.dart';
import '../models/kurator_models.dart';

const String _kBearerPrefsKey = 'kurator_mobile_bearer_v1';

/// HTTP client for Kurator REST API (`/api/v1/...`, session cookie `kurator_session`).
class KuratorApi {
  KuratorApi._(this._dio, this._prefs, {String? initialBearer}) : _bearerToken = initialBearer;

  final Dio _dio;
  final SharedPreferences? _prefs;
  String? _bearerToken;

  static Future<KuratorApi> create() async {
    assertKuratorApiBaseLooksValid();
    final prefs = await SharedPreferences.getInstance();
    final dir = await getApplicationSupportDirectory();
    final jar = PersistCookieJar(
      storage: FileStorage('${dir.path}/.kurator_cookies'),
    );
    final dio = Dio(
      BaseOptions(
        baseUrl: kuratorApiBaseUrl,
        connectTimeout: const Duration(seconds: 20),
        receiveTimeout: const Duration(seconds: 45),
        headers: const {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        validateStatus: (s) => s != null && s < 500,
      ),
    );
    dio.interceptors.add(CookieManager(jar));
    final api = KuratorApi._(
      dio,
      prefs,
      initialBearer: prefs.getString(_kBearerPrefsKey),
    );
    dio.interceptors.add(_KuratorAuthInterceptor(api));
    return api;
  }

  /// Headless / widget-test constructor: no cookies, no disk.
  @visibleForTesting
  factory KuratorApi.inMemoryForTesting() {
    final dio = Dio(
      BaseOptions(
        baseUrl: kuratorApiBaseUrl,
        validateStatus: (s) => s != null && s < 500,
        headers: const {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      ),
    );
    dio.interceptors.add(CookieManager(CookieJar()));
    final api = KuratorApi._(dio, null);
    dio.interceptors.add(_KuratorAuthInterceptor(api));
    return api;
  }

  Future<void> getHealth() async {
    final res = await _dio.get<Object?>('/health');
    if (res.statusCode != 200) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: 'Health check failed (${res.statusCode})',
      );
    }
  }

  Future<void> login({required String email, required String password}) async {
    final res = await _dio.post<dynamic>(
      '/api/v1/auth/login',
      data: {'email': email, 'password': password},
    );
    if (res.statusCode == 401 || res.statusCode == 403) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: _messageFromResponse(res) ?? 'Invalid email or password',
      );
    }
    if (res.statusCode != null && res.statusCode! >= 400) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: _messageFromResponse(res) ?? 'Login failed (${res.statusCode})',
      );
    }
    await _captureAuthFromLoginResponse(res);
  }

  Future<void> logout() async {
    try {
      await _dio.post<Object?>('/api/v1/auth/logout');
    } finally {
      await _setBearerToken(null);
    }
  }

  Future<KuratorUser> getMe() async {
    final res = await _dio.get<dynamic>('/api/v1/me');
    final code = res.statusCode ?? 0;
    if (code == 401 || code == 403) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: 'Not signed in',
      );
    }
    final userMap = _userMapFromProfileResponse(res.data);
    if (userMap == null) {
      final hint = code == 404
          ? 'Not found (404) on /api/v1/me — KURATOR_API_BASE must be the Go REST API (e.g. https://api.kuratorapp.cc), not the Next.js web app.'
          : 'Unexpected profile response (HTTP $code).';
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: res.data == null ? 'Not signed in' : hint,
      );
    }
    return KuratorUser.fromJson(userMap);
  }

  Future<KuratorCollectionListPage> listCollections({
    String? q,
    String? sort,
    int page = 1,
    int limit = 50,
  }) async {
    final res = await _dio.get<dynamic>(
      '/api/v1/collections',
      queryParameters: <String, dynamic>{
        if (q != null && q.isNotEmpty) 'q': q,
        if (sort != null && sort.isNotEmpty) 'sort': sort,
        'page': page,
        'limit': limit,
      },
    );
    if (res.statusCode == 401) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: 'Not signed in',
      );
    }
    final raw = res.data;
    if (raw is! Map) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: 'Unexpected collections response',
      );
    }
    final map = Map<String, dynamic>.from(raw);
    final items = (map['items'] as List<dynamic>? ?? [])
        .map((e) => KuratorCollection.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
    return KuratorCollectionListPage(
      items: items,
      total: (map['total'] as num?)?.toInt() ?? items.length,
      page: (map['page'] as num?)?.toInt() ?? page,
      pageSize: (map['page_size'] as num?)?.toInt() ?? limit,
    );
  }

  Future<List<KuratorItem>> listItems({int? limit, int? collectionId}) async {
    final res = await _dio.get<dynamic>(
      '/api/v1/items',
      queryParameters: <String, dynamic>{
        if (limit != null) 'limit': limit,
        if (collectionId != null) 'collection_id': collectionId,
      },
    );
    if (res.statusCode == 401) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: 'Not signed in',
      );
    }
    final data = res.data;
    if (data is! List) {
      throw DioException(
        requestOptions: res.requestOptions,
        response: res,
        message: 'Unexpected items response',
      );
    }
    return data
        .map((e) => KuratorItem.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<List<KuratorPublicUser>> searchUsers({required String q}) async {
    final res = await _dio.get<dynamic>(
      '/api/v1/users/search',
      queryParameters: {'q': q},
    );
    final data = res.data;
    if (data is! List) return [];
    return data
        .map((e) => KuratorPublicUser.fromJson(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<void> _setBearerToken(String? token) async {
    _bearerToken = (token != null && token.isNotEmpty) ? token : null;
    final prefs = _prefs;
    if (prefs == null) return;
    if (_bearerToken == null) {
      await prefs.remove(_kBearerPrefsKey);
    } else {
      await prefs.setString(_kBearerPrefsKey, _bearerToken!);
    }
  }

  Future<void> _captureAuthFromLoginResponse(Response<dynamic> res) async {
    final token = _extractBearerFromLoginPayload(res.data);
    if (token != null && token.isNotEmpty) {
      await _setBearerToken(token);
      return;
    }
    assert(() {
      final hasSetCookie =
          res.headers.map.containsKey('set-cookie') &&
          (res.headers['set-cookie']?.isNotEmpty ?? false);
      if (!hasSetCookie && res.data == null) {
        debugPrint(
          'KuratorApi: login returned no body and no Set-Cookie; '
          '/api/v1/me may still be unauthenticated. If you use HTTP (not HTTPS) against a dev API, '
          'Secure cookies will not be sent — use HTTPS for the API base or return a bearer token in the login JSON.',
        );
      }
      return true;
    }());
  }
}

/// Sends [KuratorApi._bearerToken] when set (after login or cold start).
class _KuratorAuthInterceptor extends Interceptor {
  _KuratorAuthInterceptor(this._api);

  final KuratorApi _api;

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final t = _api._bearerToken;
    if (t != null && t.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $t';
    }
    handler.next(options);
  }
}

String? _extractBearerFromLoginPayload(dynamic data) {
  if (data is! Map) return null;
  final m = Map<String, dynamic>.from(data);
  final direct = _extractBearerFromMap(m);
  if (direct != null) return direct;
  final nested = m['data'];
  if (nested is Map) {
    return _extractBearerFromMap(Map<String, dynamic>.from(nested));
  }
  return null;
}

String? _extractBearerFromMap(Map<String, dynamic> m) {
  for (final key in const [
    'access_token',
    'accessToken',
    'token',
    'jwt',
    'session_token',
    'sessionToken',
  ]) {
    final v = m[key];
    if (v is String && v.isNotEmpty) return v;
  }
  return null;
}

Map<String, dynamic>? _userMapFromProfileResponse(dynamic data) {
  if (data is! Map) return null;
  final m = Map<String, dynamic>.from(data);
  final nested = m['user'];
  if (nested is Map) {
    return Map<String, dynamic>.from(nested);
  }
  if (m['id'] != null && m['email'] != null) {
    return m;
  }
  return null;
}

class KuratorCollectionListPage {
  const KuratorCollectionListPage({
    required this.items,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  final List<KuratorCollection> items;
  final int total;
  final int page;
  final int pageSize;
}

String? _messageFromResponse(Response<dynamic> res) {
  final data = res.data;
  if (data is Map) {
    final msg = data['message'] ?? data['error'] ?? data['detail'];
    if (msg is String) return msg;
  }
  if (data is String && data.isNotEmpty) return data;
  return null;
}
