import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../theme/app_typography.dart';
import '../theme/kurator_elevation.dart';
import '../util/safe_image_url.dart';

class KuratorCard extends StatelessWidget {
  const KuratorCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.useSurfaceShadow = true,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final bool useSurfaceShadow;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final shadows = useSurfaceShadow ? context.kuratorSurfaceShadow : const <BoxShadow>[];
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          decoration: BoxDecoration(
            color: c.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: c.border),
            boxShadow: shadows,
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
        child: () {
          final safe = safeHttpsImageUrl(imageUrl);
          if (safe != null) {
            return Image.network(
              safe,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => _Placeholder(c: c, title: title),
            );
          }
          return _Placeholder(c: c, title: title);
        }(),
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
            style: kuratorSectionTitleStyle(c.fg),
          ),
        ),
        if (action != null) action!,
      ],
    );
  }
}
