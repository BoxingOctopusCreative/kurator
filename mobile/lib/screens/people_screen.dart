import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../models/kurator_models.dart';
import '../providers/session_provider.dart';
import '../theme/app_theme.dart';
import '../widgets/kurator_card.dart';
import '../widgets/page_hero_unsplash.dart';

class PeopleScreen extends StatefulWidget {
  const PeopleScreen({super.key});

  @override
  State<PeopleScreen> createState() => _PeopleScreenState();
}

class _PeopleScreenState extends State<PeopleScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;
  String _query = '';
  Future<List<KuratorPublicUser>>? _searchFuture;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onQueryChanged(SessionProvider session, String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      setState(() {
        _query = value.trim();
        _searchFuture = _query.isEmpty ? null : session.searchUsers(_query);
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final session = context.watch<SessionProvider>();
    return CustomScrollView(
      slivers: [
        const SliverToBoxAdapter(
          child: PageHeroUnsplash(
            routePath: '/people',
            title: 'People',
            subtitle: 'Search curators',
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.all(16),
          sliver: SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
        TextField(
          controller: _controller,
          decoration: InputDecoration(
            hintText: 'Search people…',
            prefixIcon: Icon(Icons.search, color: c.muted),
          ),
          onChanged: (v) => _onQueryChanged(session, v),
        ),
        const SizedBox(height: 20),
        if (_query.isEmpty)
          Text(
            'Type a name or username to search.',
            style: TextStyle(color: c.muted, fontSize: 13),
          )
        else if (_searchFuture == null)
          const SizedBox.shrink()
        else
          FutureBuilder<List<KuratorPublicUser>>(
            future: _searchFuture,
            builder: (context, snap) {
              if (snap.connectionState != ConnectionState.done) {
                return const Padding(
                  padding: EdgeInsets.all(24),
                  child: Center(child: CircularProgressIndicator()),
                );
              }
              if (snap.hasError) {
                return KuratorCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Search failed: ${snap.error}',
                        style: TextStyle(color: c.fg, fontSize: 13),
                      ),
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () => context.push('/login'),
                        child: Text('Try signing in', style: TextStyle(color: c.accent)),
                      ),
                    ],
                  ),
                );
              }
              final people = snap.data ?? [];
              if (people.isEmpty) {
                return Text(
                  'No users found for "$_query".',
                  style: TextStyle(color: c.muted, fontSize: 13),
                );
              }
              return Column(
                children: [
                  for (final person in people)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: _PersonCard(person: person),
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

class _PersonCard extends StatelessWidget {
  const _PersonCard({required this.person});
  final KuratorPublicUser person;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final url = person.avatarUrl;
    return KuratorCard(
      onTap: () {},
      child: Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundColor: c.border,
            backgroundImage: url != null && url.isNotEmpty ? NetworkImage(url) : null,
            child: url == null || url.isEmpty
                ? Text(
                    person.initials,
                    style: TextStyle(
                      color: c.fg,
                      fontWeight: FontWeight.w600,
                      fontSize: 15,
                    ),
                  )
                : null,
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  person.resolvedDisplayName,
                  style: TextStyle(
                    color: c.fg,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (person.bio != null && person.bio!.trim().isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    person.bio!.trim(),
                    style: TextStyle(color: c.muted, fontSize: 12),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
