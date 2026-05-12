import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/kurator_card.dart';
import '../widgets/kurator_button.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _RecentActivitySection(c: c),
        const SizedBox(height: 24),
        _QuickAddSection(c: c),
        const SizedBox(height: 24),
        _RecentItemsSection(c: c),
      ],
    );
  }
}

class _RecentActivitySection extends StatelessWidget {
  const _RecentActivitySection({required this.c});
  final dynamic c;

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
        for (final item in _demoActivity)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: _ActivityItem(item: item),
          ),
      ],
    );
  }
}

class _ActivityItem extends StatelessWidget {
  const _ActivityItem({required this.item});
  final Map<String, String> item;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return KuratorCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: c.border,
            child: Text(
              item['initials']!,
              style: TextStyle(
                color: c.fg,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item['text']!,
                  style: TextStyle(color: c.fg, fontSize: 13),
                ),
                const SizedBox(height: 2),
                Text(
                  item['time']!,
                  style: TextStyle(color: c.muted, fontSize: 11),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _QuickAddSection extends StatelessWidget {
  const _QuickAddSection({required this.c});
  final dynamic c;

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
                onPressed: () {},
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
  const _RecentItemsSection({required this.c});
  final dynamic c;

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
        GridView.count(
          crossAxisCount: 2,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 0.75,
          children: _demoItems
              .map((item) => _ItemCard(item: item))
              .toList(),
        ),
      ],
    );
  }
}

class _ItemCard extends StatelessWidget {
  const _ItemCard({required this.item});
  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return KuratorCard(
      padding: EdgeInsets.zero,
      onTap: () {},
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          KuratorCoverImage(title: item['title'] as String),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item['title'] as String,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 2),
                Text(
                  item['category'] as String,
                  style: TextStyle(color: c.muted, fontSize: 11),
                ),
                const SizedBox(height: 6),
                StarRating(rating: item['rating'] as int),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

const _demoActivity = [
  {'initials': 'AJ', 'text': 'You added "Dune" to Books', 'time': '2 minutes ago'},
  {'initials': 'AJ', 'text': 'You rated "The Shining" 5 stars', 'time': '1 hour ago'},
  {'initials': 'MK', 'text': 'Maya liked your collection "Sci-Fi Classics"', 'time': '3 hours ago'},
];

const _demoItems = [
  {'title': 'Dune', 'category': 'Books', 'rating': 5},
  {'title': 'The Shining', 'category': 'Books', 'rating': 5},
  {'title': 'Blade Runner 2049', 'category': 'Films', 'rating': 4},
  {'title': 'Elden Ring', 'category': 'Games', 'rating': 5},
];
