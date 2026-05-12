import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class KuratorCard extends StatelessWidget {
  const KuratorCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return Material(
      color: c.surface,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: BoxDecoration(
            border: Border.all(color: c.border),
            borderRadius: BorderRadius.circular(12),
          ),
          padding: padding,
          child: child,
        ),
      ),
    );
  }
}

class KuratorCoverImage extends StatelessWidget {
  const KuratorCoverImage({super.key, this.imageUrl, this.title});

  final String? imageUrl;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return AspectRatio(
      aspectRatio: 4 / 3,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: imageUrl != null
            ? Image.network(
                imageUrl!,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _Placeholder(c: c, title: title),
              )
            : _Placeholder(c: c, title: title),
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.c, this.title});
  final dynamic c;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final kc = context.kColors;
    return Container(
      color: kc.border.withValues(alpha: 0.3),
      child: Center(
        child: Text(
          title ?? '',
          style: TextStyle(
            color: kc.muted,
            fontSize: 9,
          ),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

class StarRating extends StatelessWidget {
  const StarRating({
    super.key,
    required this.rating,
    this.maxStars = 5,
    this.onChanged,
  });

  final int rating;
  final int maxStars;
  final ValueChanged<int>? onChanged;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(maxStars, (i) {
        final filled = i < rating;
        return GestureDetector(
          onTap: onChanged != null ? () => onChanged!(i + 1) : null,
          child: Padding(
            padding: const EdgeInsets.all(2),
            child: Icon(
              filled ? Icons.star_rounded : Icons.star_outline_rounded,
              color: filled ? const Color(0xFFFBBF24) : c.muted.withValues(alpha: 0.8),
              size: 18,
            ),
          ),
        );
      }),
    );
  }
}

class KuratorSectionHeader extends StatelessWidget {
  const KuratorSectionHeader({
    super.key,
    required this.title,
    this.action,
  });

  final String title;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: TextStyle(
              color: c.fg,
              fontSize: 17,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        if (action != null) action!,
      ],
    );
  }
}
