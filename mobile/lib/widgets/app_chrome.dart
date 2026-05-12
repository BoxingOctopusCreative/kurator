import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';

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
    final currentIdx = _currentIndex;

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
            onPressed: () {},
            tooltip: 'Account',
          ),
          const SizedBox(width: 4),
        ],
      ),
      body: child,
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
            style: TextStyle(
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
      style: TextStyle(
        color: color,
        fontSize: 20,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.5,
      ),
    );
  }
}
