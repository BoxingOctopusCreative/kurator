import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../api/kurator_api.dart';
import '../api/kurator_api_config.dart';
import '../models/kurator_models.dart';

class SessionProvider extends ChangeNotifier {
  SessionProvider(this._api);

  final KuratorApi? _api;

  KuratorUser? user;
  bool bootstrapped = false;
  String? bootstrapError;

  bool get isLoggedIn => user != null;

  /// Test-only: skip network and cookie setup.
  @visibleForTesting
  SessionProvider.disabled()
      : _api = null,
        bootstrapped = true;

  Future<void> bootstrap() async {
    final api = _api;
    if (api == null) {
      bootstrapped = true;
      notifyListeners();
      return;
    }
    try {
      user = await api.getMe();
      bootstrapError = null;
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        user = null;
        bootstrapError = null;
      } else {
        user = null;
        bootstrapError = _bootstrapErrorMessage(e);
      }
    } catch (e) {
      user = null;
      bootstrapError = e.toString();
    } finally {
      bootstrapped = true;
      notifyListeners();
    }
  }

  Future<String?> login(String email, String password) async {
    final api = _api;
    if (api == null) return 'API not available';
    try {
      await api.login(email: email, password: password);
      user = await api.getMe();
      bootstrapError = null;
      notifyListeners();
      return null;
    } on DioException catch (e) {
      return e.message ?? 'Sign in failed';
    } catch (e) {
      return e.toString();
    }
  }

  Future<void> logout() async {
    final api = _api;
    if (api != null) {
      try {
        await api.logout();
      } catch (_) {
        // Still clear local session UI even if server logout fails.
      }
    }
    user = null;
    notifyListeners();
  }

  Future<List<KuratorItem>> fetchRecentItems({int limit = 24}) async {
    final api = _api;
    if (api == null) return [];
    final items = await api.listItems(limit: limit);
    items.sort((a, b) {
      final ta = a.updatedAt ?? a.createdAt;
      final tb = b.updatedAt ?? b.createdAt;
      if (ta == null && tb == null) return b.id.compareTo(a.id);
      if (ta == null) return 1;
      if (tb == null) return -1;
      return tb.compareTo(ta);
    });
    return items;
  }

  Future<KuratorCollectionListPage> fetchCollections() async {
    final api = _api;
    if (api == null) {
      return const KuratorCollectionListPage(
        items: [],
        total: 0,
        page: 1,
        pageSize: 0,
      );
    }
    return api.listCollections();
  }

  Future<List<KuratorPublicUser>> searchUsers(String q) async {
    final api = _api;
    if (api == null) return [];
    final trimmed = q.trim();
    if (trimmed.isEmpty) return [];
    return api.searchUsers(q: trimmed);
  }
}

String _bootstrapErrorMessage(DioException e) {
  final buf = StringBuffer('$kuratorApiBaseUrl: ');
  buf.write(e.message?.trim().isNotEmpty == true ? e.message! : e.type.name);
  final sc = e.response?.statusCode;
  if (sc != null) {
    buf.write(' (HTTP $sc)');
  }
  if (e.type == DioExceptionType.connectionError ||
      e.type == DioExceptionType.connectionTimeout) {
    buf.write(
      '. For a local API use --dart-define=KURATOR_API_BASE=http://127.0.0.1:<port> '
      '(iOS Simulator: 127.0.0.1 reaches your Mac; physical device: use your Mac LAN IP).',
    );
  }
  return buf.toString();
}
