import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/kurator_models.dart';
import '../providers/session_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/kurator_card.dart';
import '../widgets/kurator_button.dart';
import '../widgets/page_hero_unsplash.dart';

class ListsScreen extends StatelessWidget {
  const ListsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final session = context.watch<SessionProvider>();
    return CustomScrollView(
      slivers: [
        const SliverToBoxAdapter(
          child: PageHeroUnsplash(
            routePath: '/lists',
            title: 'Lists',
            subtitle: 'Ranked view of your library',
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
                    tooltip: 'New list',
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
                Text('Sign in to rank items from your API library.', style: TextStyle(color: c.fg, fontSize: 14)),
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
            key: ValueKey('lists-${session.user?.id}'),
            future: session.fetchRecentItems(limit: 50),
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
              final items = snap.data ?? [];
              if (items.isEmpty) {
                return KuratorCard(
                  child: Text('No items to list yet.', style: TextStyle(color: c.muted, fontSize: 13)),
                );
              }
              return _ListCard(
                name: 'Your library (recent)',
                count: items.length,
                titles: items.map((e) => e.title).toList(),
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

class _ListCard extends StatelessWidget {
  const _ListCard({
    required this.name,
    required this.count,
    required this.titles,
  });

  final String name;
  final int count;
  final List<String> titles;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final preview = titles.take(8).toList();
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
              Icon(Icons.chevron_right, color: c.muted, size: 20),
            ],
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < preview.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  SizedBox(
                    width: 24,
                    child: Text(
                      '${i + 1}.',
                      style: TextStyle(
                        color: c.accent,
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  Expanded(
                    child: Text(
                      preview[i],
                      style: TextStyle(color: c.fg, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 4),
          Text(
            '$count items total',
            style: TextStyle(color: c.muted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
