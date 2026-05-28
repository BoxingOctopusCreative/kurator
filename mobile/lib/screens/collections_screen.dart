import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../api/kurator_api.dart';
import '../models/kurator_models.dart';
import '../providers/session_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/kurator_card.dart';
import '../widgets/kurator_button.dart';
import '../widgets/page_hero_unsplash.dart';

IconData _collectionIcon(String name) {
  final n = name.toLowerCase();
  if (n.contains('film') || n.contains('movie') || n.contains('cinema')) {
    return Icons.movie_outlined;
  }
  if (n.contains('game')) return Icons.sports_esports_outlined;
  if (n.contains('music') || n.contains('album') || n.contains('song')) {
    return Icons.music_note_outlined;
  }
  if (n.contains('book') || n.contains('read')) return Icons.auto_stories;
  return Icons.folder_outlined;
}

class CollectionsScreen extends StatelessWidget {
  const CollectionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final session = context.watch<SessionProvider>();
    return CustomScrollView(
      slivers: [
        const SliverToBoxAdapter(
          child: PageHeroUnsplash(
            routePath: '/collections',
            title: 'Collections',
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
                    tooltip: 'New collection',
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
                Text(
                  'Sign in to see collections from https://api.kuratorapp.cc',
                  style: TextStyle(color: c.fg, fontSize: 14),
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
          FutureBuilder<KuratorCollectionListPage>(
            key: ValueKey(session.user?.id),
            future: session.fetchCollections(),
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Center(
                  child: Padding(padding: EdgeInsets.all(32), child: CircularProgressIndicator()),
                );
              }
              if (snap.hasError) {
                return KuratorCard(
                  child: Text(
                    'Could not load collections: ${snap.error}',
                    style: TextStyle(color: c.fg, fontSize: 13),
                  ),
                );
              }
              final page = snap.data!;
              if (page.items.isEmpty) {
                return KuratorCard(
                  child: Text(
                    'No collections yet.',
                    style: TextStyle(color: c.muted, fontSize: 13),
                  ),
                );
              }
              return Column(
                children: [
                  for (final col in page.items)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _CollectionCard(collection: col),
                    ),
                ],
              );
            },
          ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _CollectionCard extends StatelessWidget {
  const _CollectionCard({required this.collection});
  final KuratorCollection collection;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final desc = collection.description?.trim();
    final count = collection.itemCount ?? 0;
    return KuratorCard(
      onTap: () {},
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: c.border.withValues(alpha: 0.4),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(
              _collectionIcon(collection.name),
              color: c.accent,
              size: 26,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  collection.name,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  (desc != null && desc.isNotEmpty) ? desc : 'No description',
                  style: TextStyle(color: c.muted, fontSize: 13),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Text(
                  '$count items',
                  style: TextStyle(
                    color: c.accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          Icon(Icons.chevron_right, color: c.muted, size: 20),
        ],
      ),
    );
  }
}
