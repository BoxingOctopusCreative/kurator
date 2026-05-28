import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../providers/session_provider.dart';
import '../theme/app_fonts.dart';
import '../theme/app_theme.dart';
import 'unsplash_marketing_shell.dart';

const double _kWideChromeBreakpoint = 840;
const double _kRailExtendedBreakpoint = 1100;

class _NavDestination {
  const _NavDestination({
    required this.path,
    required this.label,
    required this.icon,
    required this.selectedIcon,
  });
  final String path;
  final String label;
  final IconData icon;
  final IconData selectedIcon;
}

const _destinations = [
  _NavDestination(
    path: '/',
    label: 'Home',
    icon: Icons.grid_view_outlined,
    selectedIcon: Icons.grid_view,
  ),
  _NavDestination(
    path: '/collections',
    label: 'Collections',
    icon: Icons.layers_outlined,
    selectedIcon: Icons.layers,
  ),
  _NavDestination(
    path: '/people',
    label: 'People',
    icon: Icons.people_outline,
    selectedIcon: Icons.people,
  ),
  _NavDestination(
    path: '/wishlists',
    label: 'Wishlists',
    icon: Icons.favorite_outline,
    selectedIcon: Icons.favorite,
  ),
  _NavDestination(
    path: '/lists',
    label: 'Lists',
    icon: Icons.format_list_numbered_outlined,
    selectedIcon: Icons.format_list_numbered,
  ),
];

class AppChrome extends StatelessWidget {
  const AppChrome({super.key, required this.child, required this.location});

  final Widget child;
  final String location;

  int get _currentIndex {
    for (var i = _destinations.length - 1; i >= 0; i--) {
      final d = _destinations[i];
      if (d.path == '/') {
        if (location == '/') return i;
      } else if (location == d.path || location.startsWith('${d.path}/')) {
        return i;
      }
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final session = context.watch<SessionProvider>();
    final currentIdx = _currentIndex;
    final hideChrome = location == '/' && !session.isLoggedIn;

    if (hideChrome) {
      return Scaffold(
        backgroundColor: c.bg,
        body: child,
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= _kWideChromeBreakpoint;
        if (wide) {
          final extended = constraints.maxWidth >= _kRailExtendedBreakpoint;
          return Scaffold(
            backgroundColor: c.bg,
            body: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _KuratorNavigationRail(
                  extended: extended,
                  currentIndex: currentIdx,
                  onDestinationSelected: (i) => context.go(_destinations[i].path),
                ),
                VerticalDivider(width: 1, thickness: 1, color: c.border),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _ChromeTopBar(
                        showWordmark: !extended,
                        onSettings: () => context.push('/settings'),
                      ),
                      Divider(height: 1, thickness: 1, color: c.border),
                      Expanded(
                        child: ColoredBox(
                          color: c.main,
                          child: child,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            floatingActionButton: FloatingActionButton(
              onPressed: () => context.go('/add'),
              backgroundColor: c.accent,
              foregroundColor: c.onAccent,
              elevation: 2,
              tooltip: 'Add Item',
              child: const Icon(Icons.add),
            ),
          );
        }

        return Scaffold(
          backgroundColor: c.bg,
          appBar: AppBar(
            backgroundColor: c.surface.withValues(alpha: 0.95),
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(1),
              child: Divider(height: 1, color: c.border),
            ),
            title: _KuratorWordmark(color: c.fg),
            actions: [
              IconButton(
                icon: Icon(Icons.notifications_none_outlined, color: c.muted),
                onPressed: () {},
                tooltip: 'Notifications',
              ),
              IconButton(
                icon: Icon(Icons.account_circle_outlined, color: c.muted),
                onPressed: () => context.push('/settings'),
                tooltip: 'Account',
              ),
              const SizedBox(width: 4),
            ],
          ),
          body: ColoredBox(color: c.main, child: child),
          bottomNavigationBar: _KuratorBottomNav(
            destinations: _destinations,
            currentIndex: currentIdx,
            onDestinationSelected: (i) => context.go(_destinations[i].path),
          ),
          floatingActionButton: FloatingActionButton(
            onPressed: () => context.go('/add'),
            backgroundColor: c.accent,
            foregroundColor: c.onAccent,
            elevation: 2,
            tooltip: 'Add Item',
            child: const Icon(Icons.add),
          ),
        );
      },
    );
  }
}

class _KuratorNavigationRail extends StatelessWidget {
  const _KuratorNavigationRail({
    required this.extended,
    required this.currentIndex,
    required this.onDestinationSelected,
  });

  final bool extended;
  final int currentIndex;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return NavigationRail(
      extended: extended,
      minExtendedWidth: 224,
      backgroundColor: c.surface,
      selectedIndex: currentIndex,
      onDestinationSelected: onDestinationSelected,
      indicatorColor: c.accent.withValues(alpha: 0.15),
      selectedIconTheme: IconThemeData(color: c.accent, size: 22),
      unselectedIconTheme: IconThemeData(color: c.muted, size: 22),
      selectedLabelTextStyle: kuratorFuturaPt(
        color: c.accent,
        fontSize: 13,
        fontWeight: FontWeight.w600,
      ),
      unselectedLabelTextStyle: kuratorFuturaPt(
        color: c.muted,
        fontSize: 13,
        fontWeight: FontWeight.w500,
      ),
      leading: Padding(
        padding: const EdgeInsets.fromLTRB(8, 12, 8, 16),
        child: extended
            ? Align(
                alignment: Alignment.centerLeft,
                child: kuratorWideLogoWithShadow(width: 140),
              )
            : Icon(Icons.collections_bookmark_rounded, color: c.accent, size: 28),
      ),
      destinations: [
        for (final d in _destinations)
          NavigationRailDestination(
            icon: Icon(d.icon),
            selectedIcon: Icon(d.selectedIcon),
            label: Text(d.label),
          ),
      ],
      trailing: Expanded(
        child: Align(
          alignment: Alignment.bottomCenter,
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: IconButton(
              icon: Icon(Icons.settings_outlined, color: c.muted),
              tooltip: 'Settings',
              onPressed: () => context.push('/settings'),
            ),
          ),
        ),
      ),
    );
  }
}

class _ChromeTopBar extends StatelessWidget {
  const _ChromeTopBar({
    required this.showWordmark,
    required this.onSettings,
  });

  final bool showWordmark;
  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return SizedBox(
      height: kToolbarHeight,
      child: Material(
        color: c.surface.withValues(alpha: 0.95),
        child: Row(
          children: [
            if (showWordmark)
              Expanded(
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Padding(
                    padding: const EdgeInsets.only(left: 16),
                    child: _KuratorWordmark(color: c.fg),
                  ),
                ),
              )
            else
              const Spacer(),
            IconButton(
              icon: Icon(Icons.notifications_none_outlined, color: c.muted),
              onPressed: () {},
              tooltip: 'Notifications',
            ),
            IconButton(
              icon: Icon(Icons.account_circle_outlined, color: c.muted),
              onPressed: onSettings,
              tooltip: 'Account',
            ),
            const SizedBox(width: 4),
          ],
        ),
      ),
    );
  }
}

class _KuratorBottomNav extends StatelessWidget {
  const _KuratorBottomNav({
    required this.destinations,
    required this.currentIndex,
    required this.onDestinationSelected,
  });

  final List<_NavDestination> destinations;
  final int currentIndex;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    return Container(
      decoration: BoxDecoration(
        color: c.surface.withValues(alpha: 0.95),
        border: Border(top: BorderSide(color: c.border)),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            children: [
              for (var i = 0; i < destinations.length; i++)
                Expanded(
                  child: _BottomNavItem(
                    destination: destinations[i],
                    selected: i == currentIndex,
                    onTap: () => onDestinationSelected(i),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BottomNavItem extends StatelessWidget {
  const _BottomNavItem({
    required this.destination,
    required this.selected,
    required this.onTap,
  });

  final _NavDestination destination;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.kColors;
    final color = selected ? c.accent : c.muted;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            selected ? destination.selectedIcon : destination.icon,
            color: color,
            size: 22,
          ),
          const SizedBox(height: 4),
          Text(
            destination.label,
            style: kuratorFuturaPt(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _KuratorWordmark extends StatelessWidget {
  const _KuratorWordmark({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Text(
      'Kurator',
      style: kuratorFuturaPt(
        color: color,
        fontSize: 20,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.3,
      ),
    );
  }
}
