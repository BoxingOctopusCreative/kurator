import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/kurator_models.dart';
import '../providers/session_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/kurator_card.dart';
import '../widgets/kurator_button.dart';
import '../widgets/page_hero_unsplash.dart';

bool _isWishlistItem(KuratorItem item) {
  final cat = item.category?.toLowerCase() ?? '';
  if (cat.contains('wish')) return true;
  final m = item.metadata;
  if (m == null) return false;
  final w = m['wishlist'] ?? m['wish'];
  return w == true || w == 'true' || w == 1;
}

class WishlistsScreen extends StatelessWidget {
  const WishlistsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final session = context.watch<SessionProvider>();
    return CustomScrollView(
      slivers: [
        const SliverToBoxAdapter(
          child: PageHeroUnsplash(
            routePath: '/wishlists',
            title: 'Wishlists',
            subtitle: 'Items tagged as wishlist',
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Align(
                  alignment: Alignment.centerRight,
                  child: KuratorIconButton(
                    icon: Icons.add,
                    onPressed: session.isLoggedIn ? () {} : () => context.push('/login'),
                    tooltip: 'New wishlist',
                  ),
                ),
                const SizedBox(height: 4),
        if (!session.bootstrapped)
          const Center(child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()))
        else if (!session.isLoggedIn)
          KuratorCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Sign in to see wishlist items from the API.', style: TextStyle(color: c.fg, fontSize: 14)),
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
            key: ValueKey('wish-${session.user?.id}'),
            future: session.fetchRecentItems(limit: 200),
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Center(
                  child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()),
                );
              }
              if (snap.hasError) {
                return KuratorCard(
                  child: Text('Could not load items: ${snap.error}', style: TextStyle(color: c.fg, fontSize: 13)),
                );
              }
              final wish = (snap.data ?? []).where(_isWishlistItem).toList();
              if (wish.isEmpty) {
                return KuratorCard(
                  child: Text(
                    'No wishlist items found. Tag items with a category containing "wishlist" '
                    'or metadata wishlist: true on the web.',
                    style: TextStyle(color: c.muted, fontSize: 13),
                  ),
                );
              }
              return _WishlistCard(name: 'Wishlist', count: wish.length, items: wish);
            },
          ),
        const SizedBox(height: 8),
        Center(
          child: KuratorSecondaryButton(
            label: 'New Wishlist',
            icon: Icons.add,
            onPressed: () {},
          ),
        ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _WishlistCard extends StatelessWidget {
  const _WishlistCard({
    required this.name,
    required this.count,
    required this.items,
  });

  final String name;
  final int count;
  final List<KuratorItem> items;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return KuratorCard(
      onTap: () {},
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  name,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              Icon(
                Icons.favorite,
                color: c.accent.withValues(alpha: 0.7),
                size: 18,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '$count items',
            style: TextStyle(color: c.muted, fontSize: 13),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 48,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (var i = 0; i < items.length && i < 6; i++)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: SizedBox(
                        width: 48,
                        height: 48,
                        child: items[i].coverImageUrl != null
                            ? Image.network(
                                items[i].coverImageUrl!,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => _MiniPlaceholder(c: c, title: items[i].title),
                              )
                            : _MiniPlaceholder(c: c, title: items[i].title),
                      ),
                    ),
                  ),
                if (count > 6)
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: c.border.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '+${count - 6}',
                      style: TextStyle(
                        color: c.muted,
                        fontSize: 12,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MiniPlaceholder extends StatelessWidget {
  const _MiniPlaceholder({required this.c, required this.title});
  final dynamic c;
  final String title;

  @override
  Widget build(BuildContext context) {
    final kc = context.kColors;
    return Container(
      color: kc.border.withValues(alpha: 0.4),
      alignment: Alignment.center,
      padding: const EdgeInsets.all(2),
      child: Text(
        title,
        maxLines: 2,
        overflow: TextOverflow.ellipsis,
        textAlign: TextAlign.center,
        style: TextStyle(color: kc.muted, fontSize: 7),
      ),
    );
  }
}
