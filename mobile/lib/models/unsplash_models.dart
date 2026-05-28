/// Payload from `/api/unsplash-background` and similar (see web `unsplash-background.types.ts`).
class UnsplashBackgroundPayload {
  const UnsplashBackgroundPayload({
    required this.url,
    required this.photographer,
    this.photographerUrl,
    this.photoPageUrl,
    this.query,
  });

  final String url;
  final String photographer;
  final String? photographerUrl;
  final String? photoPageUrl;
  final String? query;

  factory UnsplashBackgroundPayload.fromJson(Map<String, dynamic> json) {
    return UnsplashBackgroundPayload(
      url: json['url'] as String? ?? '',
      photographer: json['photographer'] as String? ?? 'Photographer',
      photographerUrl: json['photographerUrl'] as String?,
      photoPageUrl: json['photoPageUrl'] as String?,
      query: json['query'] as String?,
    );
  }
}
