import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/kurator_card.dart';
import '../widgets/kurator_button.dart';

class ListsScreen extends StatelessWidget {
  const ListsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Lists',
                    style: TextStyle(
                      color: c.fg,
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Ranked and ordered selections.',
                    style: TextStyle(color: c.muted, fontSize: 14),
                  ),
                ],
              ),
            ),
            KuratorIconButton(
              icon: Icons.add,
              onPressed: () {},
              tooltip: 'New list',
            ),
          ],
        ),
        const SizedBox(height: 20),
        for (var i = 0; i < _demoLists.length; i++)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _ListCard(list: _demoLists[i]),
          ),
      ],
    );
  }
}

class _ListCard extends StatelessWidget {
  const _ListCard({required this.list});
  final Map<String, dynamic> list;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final items = list['items'] as List<String>;
    return KuratorCard(
      onTap: () {},
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  list['name'] as String,
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
          for (var i = 0; i < items.length; i++)
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
                      items[i],
                      style: TextStyle(color: c.fg, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 4),
          Text(
            '${list['count']} items total',
            style: TextStyle(color: c.muted, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

final _demoLists = [
  {
    'name': 'All-Time Favourite Books',
    'count': 10,
    'items': ['Dune', 'The Master and Margarita', 'Neuromancer'],
  },
  {
    'name': 'Essential Sci-Fi Films',
    'count': 8,
    'items': ['Blade Runner 2049', '2001: A Space Odyssey', 'Annihilation'],
  },
  {
    'name': 'Games That Changed Me',
    'count': 6,
    'items': ['Elden Ring', 'The Last of Us', 'Disco Elysium'],
  },
];
