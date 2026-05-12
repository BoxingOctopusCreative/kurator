import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'screens/home_screen.dart';
import 'screens/collections_screen.dart';
import 'screens/people_screen.dart';
import 'screens/wishlists_screen.dart';
import 'screens/lists_screen.dart';
import 'screens/settings_screen.dart';
import 'widgets/app_chrome.dart';

final router = GoRouter(
  initialLocation: '/',
  routes: [
    ShellRoute(
      builder: (context, state, child) => AppChrome(
        location: state.uri.path,
        child: child,
      ),
      routes: [
        GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
        GoRoute(path: '/collections', builder: (_, __) => const CollectionsScreen()),
        GoRoute(path: '/people', builder: (_, __) => const PeopleScreen()),
        GoRoute(path: '/wishlists', builder: (_, __) => const WishlistsScreen()),
        GoRoute(path: '/lists', builder: (_, __) => const ListsScreen()),
      ],
    ),
    GoRoute(path: '/settings', builder: (_, __) => const SettingsScreen()),
  ],
);
