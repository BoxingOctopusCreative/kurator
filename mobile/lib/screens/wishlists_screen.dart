import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/kurator_card.dart';
import '../widgets/kurator_button.dart';

class WishlistsScreen extends StatelessWidget {
  const WishlistsScreen({super.key});

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
                    'Wishlists',
                    style: TextStyle(
                      color: c.fg,
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Things you want to experience.',
                    style: TextStyle(color: c.muted, fontSize: 14),
                  ),
                ],
              ),
            ),
            KuratorIconButton(
              icon: Icons.add,
              onPressed: () {},
              tooltip: 'New wishlist',
            ),
          ],
        ),
        const SizedBox(height: 20),
        for (final wl in _demoWishlists)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _WishlistCard(wishlist: wl),
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
    );
  }
}

class _WishlistCard extends StatelessWidget {
  const _WishlistCard({required this.wishlist});
  final Map<String, dynamic> wishlist;

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
                  wishlist['name'] as String,
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
            '${wishlist['count']} items',
            style: TextStyle(color: c.muted, fontSize: 13),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 48,
            child: Row(
              children: [
                for (var i = 0; i < 3; i++)
                  Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: Container(
                        width: 48,
                        height: 48,
                        color: c.border.withValues(alpha: 0.4),
                        child: Icon(Icons.image_outlined, color: c.muted, size: 20),
                      ),
                    ),
                  ),
                if ((wishlist['count'] as int) > 3)
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: c.border.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '+${(wishlist['count'] as int) - 3}',
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

const _demoWishlists = [
  {'name': 'Books to Read', 'count': 28},
  {'name': 'Films to Watch', 'count': 15},
  {'name': 'Games to Play', 'count': 9},
  {'name': 'Albums to Hear', 'count': 22},
];
