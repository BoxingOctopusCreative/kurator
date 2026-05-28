import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api/unsplash_client.dart';
import '../models/kurator_models.dart';
import '../models/unsplash_models.dart';
import '../providers/session_provider.dart';
import '../services/unsplash_background_cache.dart';
import '../theme/app_fonts.dart';
import '../theme/app_theme.dart';
import '../theme/app_typography.dart';
import '../widgets/kurator_button.dart';
import '../widgets/kurator_card.dart';
import '../widgets/page_hero_unsplash.dart';
import '../widgets/unsplash_marketing_shell.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    if (!session.isLoggedIn) {
      return const _LoggedOutHomeSplash();
    }

    final c = context.kColors;
    return CustomScrollView(
      slivers: [
        const SliverToBoxAdapter(
          child: PageHeroUnsplash(
            routePath: '/',
            title: 'Home',
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.all(16),
          sliver: SliverList(
            delegate: SliverChildListDelegate([
              if (session.bootstrapError != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: KuratorCard(
                    child: Text(
                      'Could not reach the API (${session.bootstrapError}). '
                      'Check your connection or KURATOR_API_BASE.',
                      style: TextStyle(color: c.fg, fontSize: 13),
                    ),
                  ),
                ),
              _RecentActivitySection(c: c, session: session),
              const SizedBox(height: 24),
              _QuickAddSection(c: c, session: session),
              const SizedBox(height: 24),
              _RecentItemsSection(c: c, session: session),
            ]),
          ),
        ),
      ],
    );
  }
}

/// Full-viewport landing when signed out (Unsplash + logo + auth CTAs).
class _LoggedOutHomeSplash extends StatefulWidget {
  const _LoggedOutHomeSplash();

  @override
  State<_LoggedOutHomeSplash> createState() => _LoggedOutHomeSplashState();
}

class _LoggedOutHomeSplashState extends State<_LoggedOutHomeSplash> {
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

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final session = context.watch<SessionProvider>();
    final bottomPad = MediaQuery.paddingOf(context).bottom;

    return UnsplashMarketingShell(
      colors: c,
      imageUrl: _bg?.url,
      foreground: SafeArea(
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (!session.bootstrapped)
              const Center(child: CircularProgressIndicator()),
            if (session.bootstrapped)
              Positioned.fill(
                child: Column(
                  children: [
                    if (session.bootstrapError != null)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                        child: Material(
                          color: c.main.withValues(alpha: 0.92),
                          borderRadius: BorderRadius.circular(12),
                          child: Padding(
                            padding: const EdgeInsets.all(12),
                            child: Text(
                              'Could not reach the API (${session.bootstrapError}). '
                              'You can still sign in if the service recovers.',
                              style: kuratorFuturaPt(color: c.fg, fontSize: 13, height: 1.35),
                            ),
                          ),
                        ),
                      ),
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(28, 16, 28, 16 + bottomPad),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Center(child: kuratorWideLogoWithShadow(width: 260)),
                            const SizedBox(height: 40),
                            KuratorPrimaryButton(
                              label: 'Log in',
                              icon: Icons.login,
                              onPressed: () => context.push('/login'),
                            ),
                            const SizedBox(height: 14),
                            KuratorSecondaryButton(
                              label: 'Sign up',
                              icon: Icons.person_add_outlined,
                              onPressed: () => context.push('/register'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
      attribution: session.bootstrapped && _bg != null && _bg!.photographer.isNotEmpty
          ? UnsplashAttributionRow(
              photographer: _bg!.photographer,
              photographerUrl: _bg!.photographerUrl,
              photoPageUrl: _bg!.photoPageUrl ?? _unsplashReferral,
            )
          : session.bootstrapped
              ? Padding(
                  padding: EdgeInsets.fromLTRB(16, 8, 16, bottomPad + 12),
                  child: Text(
                    'Photos from Unsplash',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: c.muted, fontSize: 11),
                  ),
                )
              : null,
    );
  }
}

class _RecentActivitySection extends StatelessWidget {
  const _RecentActivitySection({required this.c, required this.session});
  final dynamic c;
  final SessionProvider session;

  @override
  Widget build(BuildContext context) {
    final kc = context.kColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        KuratorSectionHeader(
          title: 'Recent Activity',
          action: TextButton(
            onPressed: () {},
            child: Text('See all', style: TextStyle(color: kc.accent, fontSize: 13)),
          ),
        ),
        const SizedBox(height: 12),
        KuratorCard(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Text(
            session.isLoggedIn
                ? 'Activity from your collections will appear here as the mobile app catches up with the web experience.'
                : 'Sign in to track additions, ratings, and social updates from the Kurator API.',
            style: TextStyle(color: kc.muted, fontSize: 13),
          ),
        ),
      ],
    );
  }
}

class _QuickAddSection extends StatelessWidget {
  const _QuickAddSection({required this.c, required this.session});
  final dynamic c;
  final SessionProvider session;

  @override
  Widget build(BuildContext context) {
    final kc = context.kColors;
    return KuratorCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Add to your collection',
            style: TextStyle(
              color: kc.fg,
              fontSize: 15,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Track books, films, music, games, and more.',
            style: TextStyle(color: kc.muted, fontSize: 13),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              KuratorPrimaryButton(
                label: 'Add Item',
                icon: Icons.add,
                onPressed: session.isLoggedIn
                    ? () {}
                    : () => context.push('/login'),
              ),
              const SizedBox(width: 10),
              KuratorSecondaryButton(
                label: 'Scan',
                icon: Icons.qr_code_scanner,
                onPressed: () {},
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _RecentItemsSection extends StatelessWidget {
  const _RecentItemsSection({required this.c, required this.session});
  final dynamic c;
  final SessionProvider session;

  @override
  Widget build(BuildContext context) {
    final kc = context.kColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        KuratorSectionHeader(
          title: 'Recently Added',
          action: TextButton(
            onPressed: () {},
            child: Text('See all', style: TextStyle(color: kc.accent, fontSize: 13)),
          ),
        ),
        const SizedBox(height: 12),
        if (!session.bootstrapped)
          const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
        else if (!session.isLoggedIn)
          KuratorCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Sign in to load items from your Kurator library.',
                  style: TextStyle(color: kc.fg, fontSize: 14),
                ),
                const SizedBox(height: 12),
                KuratorPrimaryButton(
                  label: 'Sign in',
                  icon: Icons.login,
                  onPressed: () => context.push('/login'),
                ),
              ],
            ),
          )
        else
          FutureBuilder<List<KuratorItem>>(
            key: ValueKey(session.user?.id),
            future: session.fetchRecentItems(),
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Center(
                  child: Padding(
                    padding: EdgeInsets.all(24),
                    child: CircularProgressIndicator(),
                  ),
                );
              }
              if (snap.hasError) {
                return KuratorCard(
                  child: Text(
                    'Could not load items: ${snap.error}',
                    style: TextStyle(color: kc.fg, fontSize: 13),
                  ),
                );
              }
              final items = snap.data ?? [];
              if (items.isEmpty) {
                return KuratorCard(
                  child: Text(
                    'No items yet. Add some on the web or when the mobile composer ships.',
                    style: TextStyle(color: kc.muted, fontSize: 13),
                  ),
                );
              }
              return GridView.count(
                crossAxisCount: 2,
                crossAxisSpacing: 12,
                mainAxisSpacing: 12,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                childAspectRatio: 0.75,
                children: items.map((item) => _ItemCard(item: item)).toList(),
              );
            },
          ),
      ],
    );
  }
}

class _ItemCard extends StatelessWidget {
  const _ItemCard({required this.item});
  final KuratorItem item;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final cat = item.category ?? 'Uncategorized';
    return KuratorCard(
      padding: EdgeInsets.zero,
      onTap: () {},
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          KuratorCoverImage(
            title: item.title,
            imageUrl: item.coverImageUrl,
          ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  style: kuratorItemTitleStyle(c.fg, fontSize: 13),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  cat,
                  style: TextStyle(color: c.muted, fontSize: 11),
                ),
                const SizedBox(height: 6),
                StarRating(rating: item.ratingStars),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
