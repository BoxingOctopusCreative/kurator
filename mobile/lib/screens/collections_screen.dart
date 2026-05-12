import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/kurator_card.dart';
import '../widgets/kurator_button.dart';

class CollectionsScreen extends StatelessWidget {
  const CollectionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                'Collections',
                style: TextStyle(
                  color: c.fg,
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            KuratorIconButton(
              icon: Icons.add,
              onPressed: () {},
              tooltip: 'New collection',
            ),
          ],
        ),
        const SizedBox(height: 16),
        for (final col in _demoCollections)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _CollectionCard(collection: col),
          ),
      ],
    );
  }
}

class _CollectionCard extends StatelessWidget {
  const _CollectionCard({required this.collection});
  final Map<String, dynamic> collection;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
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
              collection['icon'] as IconData,
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
                  collection['name'] as String,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  collection['description'] as String,
                  style: TextStyle(color: c.muted, fontSize: 13),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
                Text(
                  '${collection['count']} items',
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

const _demoCollections = [
  {
    'name': 'Sci-Fi Classics',
    'description': 'The foundational works of science fiction that shaped the genre.',
    'count': 24,
    'icon': Icons.auto_stories,
  },
  {
    'name': 'Favourite Films',
    'description': 'Movies I keep coming back to.',
    'count': 47,
    'icon': Icons.movie_outlined,
  },
  {
    'name': 'Games of the Year',
    'description': 'My picks for the best games each year.',
    'count': 18,
    'icon': Icons.sports_esports_outlined,
  },
  {
    'name': 'Music to Code By',
    'description': 'Albums and playlists perfect for deep focus.',
    'count': 31,
    'icon': Icons.music_note_outlined,
  },
];
