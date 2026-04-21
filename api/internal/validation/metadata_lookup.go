package validation

import "strings"

// MetadataCategory validates the category query for metadata lookup.
func MetadataCategory(c string) (string, error) {
	t := strings.ToLower(strings.TrimSpace(c))
	switch t {
	case "", "music", "game", "book", "movies", "tv", "anime", "comic_book", "manga":
		return t, nil
	default:
		return "", Invalidf("invalid category")
	}
}

// Aliases must match MetadataService.Lookup switch cases.
var metadataProviders = map[string]struct{}{
	"":            {},
	"auto":        {},
	"discogs":     {},
	"music":       {},
	"thegamesdb":  {},
	"gamesdb":     {},
	"game":        {},
	"book":        {},
	"books":       {},
	"goodreads":   {},
	"openlibrary": {},
	"tmdb":        {},
	"video":       {},
	"movies":      {},
	"tv":          {},
	"anime":       {},
	"comic":       {},
	"comic_book":  {},
	"comicvine":   {},
	"jikan":       {},
	"manga":       {},
}

// MetadataLookupQuery validates the q/query parameter for external metadata search (empty allowed; service returns a stub).
func MetadataLookupQuery(s string, field string) (string, error) {
	t := strings.TrimSpace(s)
	if t == "" {
		return "", nil
	}
	return StrictPlainText(t, MaxMetadataLookupQuery, field, false)
}

// MetadataProvider normalizes and validates the provider query parameter.
func MetadataProvider(p string) (string, error) {
	t := strings.ToLower(strings.TrimSpace(p))
	if _, ok := metadataProviders[t]; !ok {
		return "", Invalidf("invalid provider")
	}
	return t, nil
}
