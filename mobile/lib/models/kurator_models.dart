// DTOs aligned with https://swagger.kuratorapp.cc (Kurator API).

class KuratorUser {
  const KuratorUser({
    required this.id,
    required this.email,
    this.displayName,
    this.bio,
    this.avatarUrl,
    this.twoFactorEnabled,
    this.createdAt,
    this.updatedAt,
  });

  final int id;
  final String email;
  final String? displayName;
  final String? bio;
  final String? avatarUrl;
  final bool? twoFactorEnabled;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  factory KuratorUser.fromJson(Map<String, dynamic> json) {
    return KuratorUser(
      id: (json['id'] as num).toInt(),
      email: json['email'] as String? ?? '',
      displayName: json['display_name'] as String?,
      bio: json['bio'] as String?,
      avatarUrl: json['avatar_url'] as String?,
      twoFactorEnabled: json['two_factor_enabled'] as bool?,
      createdAt: _parseDate(json['created_at'] as String?),
      updatedAt: _parseDate(json['updated_at'] as String?),
    );
  }

  String get primaryLabel =>
      (displayName != null && displayName!.trim().isNotEmpty)
          ? displayName!.trim()
          : email;
}

class KuratorCollection {
  const KuratorCollection({
    required this.id,
    required this.userId,
    required this.name,
    this.description,
    this.itemCount,
    this.createdAt,
    this.updatedAt,
  });

  final int id;
  final int userId;
  final String name;
  final String? description;
  final int? itemCount;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  factory KuratorCollection.fromJson(Map<String, dynamic> json) {
    return KuratorCollection(
      id: (json['id'] as num).toInt(),
      userId: (json['user_id'] as num).toInt(),
      name: json['name'] as String? ?? '',
      description: json['description'] as String?,
      itemCount: (json['item_count'] as num?)?.toInt(),
      createdAt: _parseDate(json['created_at'] as String?),
      updatedAt: _parseDate(json['updated_at'] as String?),
    );
  }
}

class KuratorItem {
  const KuratorItem({
    required this.id,
    required this.collectionId,
    required this.title,
    this.category,
    this.metadata,
    this.createdAt,
    this.updatedAt,
  });

  final int id;
  final int collectionId;
  final String title;
  final String? category;
  final Map<String, dynamic>? metadata;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  int get ratingStars {
    final m = metadata;
    if (m == null) return 0;
    final r = m['rating'] ?? m['stars'] ?? m['star_rating'];
    if (r is int) return r.clamp(0, 5);
    if (r is num) return r.round().clamp(0, 5);
    return 0;
  }

  String? get coverImageUrl {
    final m = metadata;
    if (m == null) return null;
    final u = m['cover_url'] ?? m['image_url'] ?? m['poster_url'] ?? m['thumbnail_url'];
    return u is String && u.isNotEmpty ? u : null;
  }

  factory KuratorItem.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic>? meta;
    final raw = json['metadata'];
    if (raw is Map<String, dynamic>) {
      meta = raw;
    } else if (raw is Map) {
      meta = Map<String, dynamic>.from(raw);
    }
    return KuratorItem(
      id: (json['id'] as num).toInt(),
      collectionId: (json['collection_id'] as num).toInt(),
      title: json['title'] as String? ?? '',
      category: json['category'] as String?,
      metadata: meta,
      createdAt: _parseDate(json['created_at'] as String?),
      updatedAt: _parseDate(json['updated_at'] as String?),
    );
  }
}

class KuratorPublicUser {
  const KuratorPublicUser({
    required this.id,
    this.username,
    this.displayName,
    this.firstName,
    this.lastName,
    this.location,
    this.bio,
    this.avatarUrl,
    this.bannerUrl,
    this.createdAt,
  });

  final int id;
  final String? username;
  final String? displayName;
  final String? firstName;
  final String? lastName;
  final String? location;
  final String? bio;
  final String? avatarUrl;
  final String? bannerUrl;
  final DateTime? createdAt;

  String get resolvedDisplayName {
    final d = displayName?.trim();
    if (d != null && d.isNotEmpty) return d;
    final u = username?.trim();
    if (u != null && u.isNotEmpty) return u;
    final parts = [firstName, lastName].whereType<String>().map((e) => e.trim()).where((e) => e.isNotEmpty);
    if (parts.isNotEmpty) return parts.join(' ');
    return 'User #$id';
  }

  String get initials {
    final name = resolvedDisplayName;
    final parts = name.split(RegExp(r'\s+')).where((e) => e.isNotEmpty).toList();
    if (parts.length >= 2) {
      final a = parts.first.isNotEmpty ? parts.first[0] : '';
      final b = parts[1].isNotEmpty ? parts[1][0] : '';
      return ('$a$b').toUpperCase();
    }
    if (name.length >= 2) return name.substring(0, 2).toUpperCase();
    if (name.isNotEmpty) return name[0].toUpperCase();
    return '?';
  }

  factory KuratorPublicUser.fromJson(Map<String, dynamic> json) {
    return KuratorPublicUser(
      id: (json['id'] as num).toInt(),
      username: json['username'] as String?,
      displayName: json['display_name'] as String?,
      firstName: json['first_name'] as String?,
      lastName: json['last_name'] as String?,
      location: json['location'] as String?,
      bio: json['bio'] as String?,
      avatarUrl: json['avatar_url'] as String?,
      bannerUrl: json['banner_url'] as String?,
      createdAt: _parseDate(json['created_at'] as String?),
    );
  }
}

DateTime? _parseDate(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  return DateTime.tryParse(raw);
}
