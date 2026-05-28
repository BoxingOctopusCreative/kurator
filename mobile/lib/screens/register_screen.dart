import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/unsplash_client.dart';
import '../models/unsplash_models.dart';
import '../services/unsplash_background_cache.dart';
import '../theme/app_fonts.dart';
import '../theme/app_theme.dart';
import '../widgets/kurator_button.dart';
import '../widgets/page_hero_unsplash.dart';
import '../widgets/unsplash_marketing_shell.dart';

const _kuratorRegisterUrl = 'https://kuratorapp.cc/register';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  UnsplashBackgroundPayload? _bg;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadBackground());
  }

  Future<void> _loadBackground() async {
    if (!mounted) return;
    final cache = context.read<UnsplashBackgroundCache>();
    var payload = cache.readFreshPayload() ?? cache.readLastGoodPayload();
    if (mounted) setState(() => _bg = payload);

    final client = UnsplashClient.create();
    final fresh = await client.fetchMarketingBackground();
    if (fresh != null) {
      await cache.writePayload(fresh);
      if (mounted) setState(() => _bg = fresh);
    }
  }

  static const _unsplashReferral =
      'https://unsplash.com/?utm_source=kurator&utm_medium=referral';

  Future<void> _openRegister() async {
    final uri = Uri.parse(_kuratorRegisterUrl);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final bottomPad = MediaQuery.paddingOf(context).bottom;

    return Scaffold(
      body: UnsplashMarketingShell(
        colors: c,
        imageUrl: _bg?.url,
        foreground: SafeArea(
          child: Stack(
            children: [
              Positioned(
                top: 4,
                left: 4,
                child: IconButton(
                  icon: Icon(Icons.arrow_back, color: c.fg.withValues(alpha: 0.9)),
                  style: IconButton.styleFrom(
                    backgroundColor: c.surface.withValues(alpha: 0.55),
                  ),
                  onPressed: () => context.canPop() ? context.pop() : context.go('/'),
                ),
              ),
              ListView(
                padding: EdgeInsets.fromLTRB(24, 72, 24, 24 + bottomPad),
                children: [
                  Center(child: kuratorWideLogoWithShadow(width: 220)),
                  const SizedBox(height: 28),
                  Text(
                    'Sign up',
                    textAlign: TextAlign.center,
                    style: kuratorFuturaPt(
                      color: c.fg,
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Create your Kurator account on the web, then sign in here.',
                    textAlign: TextAlign.center,
                    style: kuratorFuturaPt(
                      color: c.muted,
                      fontSize: 14,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 28),
                  KuratorPrimaryButton(
                    label: 'Continue on kuratorapp.cc',
                    icon: Icons.open_in_new,
                    onPressed: _openRegister,
                  ),
                  const SizedBox(height: 12),
                  Center(
                    child: TextButton(
                      onPressed: () => context.push('/login'),
                      child: Text(
                        'Already have an account? Log in',
                        style: kuratorFuturaPt(
                          color: c.accent,
                          fontSize: 14,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
        attribution: _bg != null && _bg!.photographer.isNotEmpty
            ? UnsplashAttributionRow(
                photographer: _bg!.photographer,
                photographerUrl: _bg!.photographerUrl,
                photoPageUrl: _bg!.photoPageUrl ?? _unsplashReferral,
              )
            : Padding(
                padding: EdgeInsets.fromLTRB(16, 8, 16, bottomPad + 12),
                child: Text(
                  'Photos from Unsplash',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: c.muted, fontSize: 11),
                ),
              ),
      ),
    );
  }
}
