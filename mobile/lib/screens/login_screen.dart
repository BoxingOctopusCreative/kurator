import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api/unsplash_client.dart';
import '../models/unsplash_models.dart';
import '../providers/session_provider.dart';
import '../services/unsplash_background_cache.dart';
import '../theme/app_fonts.dart';
import '../theme/app_theme.dart';
import '../widgets/kurator_button.dart';
import '../widgets/page_hero_unsplash.dart';
import '../widgets/unsplash_marketing_shell.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;
  bool _busy = false;
  String? _error;
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

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _busy = true;
    });
    final session = context.read<SessionProvider>();
    final err = await session.login(_email.text.trim(), _password.text);
    if (!mounted) return;
    setState(() => _busy = false);
    if (err != null) {
      setState(() => _error = err);
      return;
    }
    if (mounted) context.go('/');
  }

  static const _unsplashReferral =
      'https://unsplash.com/?utm_source=kurator&utm_medium=referral';

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
                  icon: Icon(Icons.close, color: c.fg.withValues(alpha: 0.9)),
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
                    'Sign in',
                    textAlign: TextAlign.center,
                    style: kuratorFuturaPt(
                      color: c.fg,
                      fontSize: 22,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Use your Kurator account. Sessions stay on this device.',
                    textAlign: TextAlign.center,
                    style: kuratorFuturaPt(
                      color: c.muted,
                      fontSize: 14,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 28),
                  Card(
                    color: c.main.withValues(alpha: 0.92),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: BorderSide(color: c.border),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          TextField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            autocorrect: false,
                            decoration: const InputDecoration(
                              labelText: 'Email',
                            ),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _password,
                            obscureText: _obscure,
                            decoration: InputDecoration(
                              labelText: 'Password',
                              suffixIcon: IconButton(
                                icon: Icon(
                                  _obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                                ),
                                onPressed: () => setState(() => _obscure = !_obscure),
                              ),
                            ),
                            onSubmitted: (_) {
                              if (!_busy) _submit();
                            },
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 12),
                            Text(
                              _error!,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                                fontSize: 13,
                              ),
                            ),
                          ],
                          const SizedBox(height: 22),
                          KuratorPrimaryButton(
                            label: 'Sign in',
                            icon: Icons.login,
                            loading: _busy,
                            onPressed: _submit,
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 32),
                  Text(
                    '© ${DateTime.now().year} Kurator',
                    textAlign: TextAlign.center,
                    style: kuratorFuturaPt(
                      color: c.muted,
                      fontSize: 12,
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
