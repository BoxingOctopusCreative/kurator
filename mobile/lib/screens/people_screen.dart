import 'package:flutter/material.dart';
import '../theme/app_theme.dart';
import '../widgets/kurator_card.dart';

class PeopleScreen extends StatelessWidget {
  const PeopleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          'People',
          style: TextStyle(
            color: c.fg,
            fontSize: 22,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Follow curators whose taste you trust.',
          style: TextStyle(color: c.muted, fontSize: 14),
        ),
        const SizedBox(height: 20),
        TextField(
          decoration: InputDecoration(
            hintText: 'Search people…',
            prefixIcon: Icon(Icons.search, color: c.muted),
          ),
        ),
        const SizedBox(height: 20),
        for (final person in _demoPeople)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: _PersonCard(person: person),
          ),
      ],
    );
  }
}

class _PersonCard extends StatelessWidget {
  const _PersonCard({required this.person});
  final Map<String, dynamic> person;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return KuratorCard(
      onTap: () {},
      child: Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: c.border,
            child: Text(
              person['initials'] as String,
              style: TextStyle(
                color: c.fg,
                fontWeight: FontWeight.w600,
                fontSize: 15,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  person['name'] as String,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${person['items']} items · ${person['collections']} collections',
                  style: TextStyle(color: c.muted, fontSize: 12),
                ),
              ],
            ),
          ),
          _FollowButton(following: person['following'] as bool),
        ],
      ),
    );
  }
}

class _FollowButton extends StatefulWidget {
  const _FollowButton({required this.following});
  final bool following;

  @override
  State<_FollowButton> createState() => _FollowButtonState();
}

class _FollowButtonState extends State<_FollowButton> {
  late bool _following;

  @override
  void initState() {
    super.initState();
    _following = widget.following;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return OutlinedButton(
      onPressed: () => setState(() => _following = !_following),
      style: OutlinedButton.styleFrom(
        foregroundColor: _following ? c.fg : c.accent,
        side: BorderSide(color: _following ? c.border : c.accent),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
      ),
      child: Text(_following ? 'Following' : 'Follow'),
    );
  }
}

const _demoPeople = [
  {'name': 'Maya Kim', 'initials': 'MK', 'items': 312, 'collections': 14, 'following': true},
  {'name': 'James Okafor', 'initials': 'JO', 'items': 89, 'collections': 6, 'following': false},
  {'name': 'Priya Sharma', 'initials': 'PS', 'items': 204, 'collections': 11, 'following': true},
  {'name': 'Lena Müller', 'initials': 'LM', 'items': 156, 'collections': 9, 'following': false},
];
