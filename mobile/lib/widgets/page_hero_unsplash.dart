import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/unsplash_client.dart';
import '../theme/app_typography.dart';
import '../theme/app_theme.dart';
import '../theme/kurator_elevation.dart';
import '../util/safe_image_url.dart';

/// In-app page hero (web `PageHeroUnsplash`): main-column banner, hero title caps,
/// black/45 + kurator-bg/70 tint stack when using Unsplash; [customCoverUrl] skips fetch.
class PageHeroUnsplash extends StatefulWidget {
  /// When false, skips `/api/unsplash-page-banner` (e.g. widget tests — avoids pending Dio timers).
  static bool fetchRemoteBanner = true;

  const PageHeroUnsplash({
    super.key,
    required this.routePath,
    required this.title,
    this.customCoverUrl,
    this.subtitle,
    this.heroHeight = 168,
  });

  final String routePath;
  final String title;
  final String? customCoverUrl;
  final String? subtitle;
  final double heroHeight;

  @override
  State<PageHeroUnsplash> createState() => _PageHeroUnsplashState();
}

class _PageHeroUnsplashState extends State<PageHeroUnsplash> {
  String? _bannerUrl;
  bool _loading = true;
  CancelToken? _cancelToken;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _cancelToken?.cancel();
    super.dispose();
  }

  @override
  void didUpdateWidget(PageHeroUnsplash oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.routePath != widget.routePath ||
        oldWidget.customCoverUrl != widget.customCoverUrl) {
      _load();
    }
  }

  Future<void> _load() async {
    _cancelToken?.cancel();
    _cancelToken = CancelToken();
    final token = _cancelToken!;

    final custom = safeHttpsImageUrl(widget.customCoverUrl);
    if (custom != null) {
      if (!mounted) return;
      setState(() {
        _bannerUrl = custom;
        _loading = false;
      });
      return;
    }
    if (!mounted) return;
    setState(() => _loading = true);
    if (!PageHeroUnsplash.fetchRemoteBanner) {
      if (!mounted) return;
      setState(() {
        _bannerUrl = null;
        _loading = false;
      });
      return;
    }
    final client = UnsplashClient.create();
    try {
      final url = await client.fetchPageBannerUrl(widget.routePath, cancelToken: token);
      if (!mounted) return;
      setState(() {
        _bannerUrl = safeHttpsImageUrl(url);
        _loading = false;
      });
    } on DioException catch (e) {
      if (e.type == DioExceptionType.cancel) return;
      if (!mounted) return;
      setState(() {
        _bannerUrl = null;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _bannerUrl = null;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final brightness = Theme.of(context).brightness;
    final isDark = brightness == Brightness.dark;
    final heroBlackVeil = isDark ? 0.58 : 0.38;
    final heroBgGradient = isDark ? 0.82 : 0.7;

    return Container(
      height: widget.heroHeight,
      width: double.infinity,
      decoration: BoxDecoration(
        boxShadow: kuratorElevationHeroBottom(brightness),
      ),
      clipBehavior: Clip.hardEdge,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (_bannerUrl != null)
            Image.network(
              _bannerUrl!,
              fit: BoxFit.cover,
              alignment: Alignment.center,
              errorBuilder: (_, __, ___) => ColoredBox(color: c.main),
            )
          else
            ColoredBox(color: c.main),
          // Hero tint: darken photo then bg gradient (web page hero; stronger in dark mode)
          ColoredBox(color: Colors.black.withValues(alpha: heroBlackVeil)),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.transparent,
                  c.bg.withValues(alpha: heroBgGradient),
                ],
                stops: const [0.2, 1],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Text(
                  widget.title.toUpperCase(),
                  style: kuratorPageHeroTitleStyle(c.fg),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (widget.subtitle != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    widget.subtitle!,
                    style: TextStyle(color: c.muted, fontSize: 13),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
          if (_loading)
            const Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: EdgeInsets.all(8),
                child: SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// 11px muted attribution row (marketing + heroes).
class UnsplashAttributionRow extends StatelessWidget {
  const UnsplashAttributionRow({
    super.key,
    required this.photographer,
    this.photographerUrl,
    this.photoPageUrl,
  });

  final String photographer;
  final String? photographerUrl;
  final String? photoPageUrl;

  Future<void> _open(String? url) async {
    if (url == null || url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  static const _unsplashReferral =
      'https://unsplash.com/?utm_source=kurator&utm_medium=referral';

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final base = TextStyle(
      color: c.muted,
      fontSize: 11,
      height: 1.35,
    );
    final linkStyle = base.copyWith(
      color: c.accent,
      decoration: TextDecoration.underline,
    );
    final unsplashLink = photoPageUrl ?? _unsplashReferral;

    return SafeArea(
      minimum: const EdgeInsets.only(bottom: 4),
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          8,
          16,
          math.max(20.0, MediaQuery.paddingOf(context).bottom + 8),
        ),
        child: RichText(
          textAlign: TextAlign.center,
          text: TextSpan(
            style: base,
            children: [
              const TextSpan(text: 'Photo by '),
              TextSpan(
                text: photographer,
                style: linkStyle,
                recognizer: TapGestureRecognizer()
                  ..onTap = () => _open(photographerUrl),
              ),
              const TextSpan(text: ' on '),
              TextSpan(
                text: 'Unsplash',
                style: linkStyle,
                recognizer: TapGestureRecognizer()
                  ..onTap = () => _open(unsplashLink),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
