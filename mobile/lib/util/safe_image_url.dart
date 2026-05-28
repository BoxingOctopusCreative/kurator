/// Allowlisted hosts for arbitrary image URLs (parity with web `safeUrl` patterns).
bool isTrustedImageHost(String host) {
  final h = host.toLowerCase();
  return h == 'images.unsplash.com' ||
      h == 'assets.kuratorapp.cc' ||
      h == 'api.kuratorapp.cc' ||
      h.endsWith('.kuratorapp.cc');
}

/// Returns [url] only if scheme is https and host is trusted; otherwise null.
String? safeHttpsImageUrl(String? url) {
  if (url == null || url.isEmpty) return null;
  final uri = Uri.tryParse(url);
  if (uri == null || uri.scheme != 'https') return null;
  if (!isTrustedImageHost(uri.host)) return null;
  return uri.toString();
}
