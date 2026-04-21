package service

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
)

// ItemEnrichment is live text from external catalogs (plot, synopsis, deck) for display on item pages.
type ItemEnrichment struct {
	Synopsis    string `json:"synopsis,omitempty"`
	Source      string `json:"source,omitempty"`
	SourceURL   string `json:"source_url,omitempty"`
	Note        string `json:"note,omitempty"` // e.g. when API key missing or rate limited
}

var htmlTagPattern = regexp.MustCompile(`<[^>]*>`)

func stripHTMLDescription(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = htmlTagPattern.ReplaceAllString(s, " ")
	s = html.UnescapeString(s)
	return strings.TrimSpace(strings.Join(strings.Fields(s), " "))
}

func metaStr(m map[string]interface{}, key string) string {
	v, ok := m[key]
	if !ok || v == nil {
		return ""
	}
	switch t := v.(type) {
	case string:
		return strings.TrimSpace(t)
	case float64:
		if t == float64(int64(t)) {
			return strconv.FormatInt(int64(t), 10)
		}
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	default:
		return strings.TrimSpace(fmt.Sprint(t))
	}
}

// EnrichItem returns synopsis/plot text from external APIs using catalog ids in metadata, title search fallback,
// and finally English Wikipedia when other sources have no text.
// title is the item title (stored on the item row, not always duplicated in metadata JSON).
func (s *MetadataService) EnrichItem(ctx context.Context, category models.Category, raw json.RawMessage, title string) ItemEnrichment {
	var m map[string]interface{}
	if len(raw) > 0 && string(raw) != "null" {
		_ = json.Unmarshal(raw, &m)
	}
	e1 := s.enrichFromCatalog(ctx, category, m)
	if strings.TrimSpace(e1.Synopsis) != "" {
		return e1
	}
	e2 := enrichFallback(s, ctx, category, strings.TrimSpace(title), m)
	if strings.TrimSpace(e2.Synopsis) != "" {
		return e2
	}
	if w := s.enrichWikipedia(ctx, category, strings.TrimSpace(title), m); strings.TrimSpace(w.Synopsis) != "" {
		return w
	}
	if e2.Note != "" {
		return e2
	}
	if strings.TrimSpace(e1.Note) != "" {
		return e1
	}
	return ItemEnrichment{
		Note: "No summary available. Try choosing a match from search when you add an item, or ask whoever runs this site to enable lookups.",
	}
}

func enrichFallback(s *MetadataService, ctx context.Context, category models.Category, title string, m map[string]interface{}) ItemEnrichment {
	q := strings.TrimSpace(title)
	if q == "" {
		return ItemEnrichment{}
	}
	if m != nil {
		if a := metaStr(m, "author"); a != "" && (category == models.CategoryBook || category == models.CategoryManga) {
			q = q + " " + a
		}
	}
	prov := metadataProviderForCategory(category)
	res := s.Lookup(ctx, prov, q)
	if res.Stub || len(res.Results) == 0 {
		if res.Message != "" {
			return ItemEnrichment{Note: res.Message}
		}
		return ItemEnrichment{}
	}
	h := res.Results[0]
	// TMDB overview in Extra
	if ov, ok := h.Extra["overview"].(string); ok && strings.TrimSpace(ov) != "" {
		return ItemEnrichment{
			Synopsis:  strings.TrimSpace(ov),
			Source:    "The Movie Database",
			SourceURL: "https://www.themoviedb.org/",
		}
	}
	// Synthesize ids from first hit and fetch detail
	tmp := map[string]interface{}{}
	if h.ExternalID != "" {
		switch category {
		case models.CategoryGame:
			tmp["catalog_gamesdb_id"] = h.ExternalID
		case models.CategoryManga:
			tmp["catalog_mal_id"] = h.ExternalID
		case models.CategoryBook:
			if h.Source == "googlebooks" {
				tmp["catalog_google_books_id"] = h.ExternalID
			} else if h.Source == "openlibrary" {
				k := h.ExternalID
				if k == "" {
					if x, ok := h.Extra["open_library_key"].(string); ok {
						k = x
					}
				}
				if k != "" {
					tmp["catalog_open_library_key"] = k
				}
			}
		case models.CategoryComicBook:
			if h.Source == "comicvine" {
				tmp["catalog_comicvine_id"] = h.ExternalID
				if r, ok := h.Extra["comicvine_resource"].(string); ok {
					tmp["catalog_comicvine_resource"] = r
				}
			} else if h.Source == "googlebooks" {
				tmp["catalog_google_books_id"] = h.ExternalID
			} else if h.Source == "openlibrary" {
				k := h.ExternalID
				if k == "" {
					if x, ok := h.Extra["open_library_key"].(string); ok {
						k = x
					}
				}
				if k != "" {
					tmp["catalog_open_library_key"] = k
				}
			}
		case models.CategoryMovies, models.CategoryTV, models.CategoryAnime:
			tmp["catalog_tmdb_id"] = h.ExternalID
			if mt, ok := h.Extra["media_type"].(string); ok {
				tmp["catalog_tmdb_media_type"] = mt
			}
		}
	}
	return s.enrichFromCatalog(ctx, category, tmp)
}

func metadataProviderForCategory(c models.Category) string {
	switch c {
	case models.CategoryMusic:
		return "discogs"
	case models.CategoryGame:
		return "thegamesdb"
	case models.CategoryBook:
		return "book"
	case models.CategoryMovies, models.CategoryTV, models.CategoryAnime:
		return "tmdb"
	case models.CategoryComicBook:
		return "comic"
	case models.CategoryManga:
		return "jikan"
	default:
		return "auto"
	}
}

func (s *MetadataService) enrichFromCatalog(ctx context.Context, category models.Category, m map[string]interface{}) ItemEnrichment {
	if m == nil {
		return ItemEnrichment{}
	}
	switch category {
	case models.CategoryMovies, models.CategoryTV, models.CategoryAnime:
		return s.enrichTMDBDetail(ctx, metaStr(m, "catalog_tmdb_id"), metaStr(m, "catalog_tmdb_media_type"))
	case models.CategoryGame:
		return s.enrichTheGamesDBDetail(ctx, metaStr(m, "catalog_gamesdb_id"))
	case models.CategoryBook:
		if gb := metaStr(m, "catalog_google_books_id"); gb != "" {
			return s.enrichGoogleBooksVolume(ctx, gb)
		}
		if ol := metaStr(m, "catalog_open_library_key"); ol != "" {
			return s.enrichOpenLibraryWork(ctx, ol)
		}
	case models.CategoryManga:
		if mal := metaStr(m, "catalog_mal_id"); mal != "" {
			return s.enrichJikanMangaDetail(ctx, mal)
		}
		if gb := metaStr(m, "catalog_google_books_id"); gb != "" {
			return s.enrichGoogleBooksVolume(ctx, gb)
		}
		if ol := metaStr(m, "catalog_open_library_key"); ol != "" {
			return s.enrichOpenLibraryWork(ctx, ol)
		}
	case models.CategoryComicBook:
		if cv := metaStr(m, "catalog_comicvine_id"); cv != "" {
			return s.enrichComicVineDetail(ctx, cv, metaStr(m, "catalog_comicvine_resource"))
		}
		if gb := metaStr(m, "catalog_google_books_id"); gb != "" {
			return s.enrichGoogleBooksVolume(ctx, gb)
		}
		if ol := metaStr(m, "catalog_open_library_key"); ol != "" {
			return s.enrichOpenLibraryWork(ctx, ol)
		}
	}
	return ItemEnrichment{}
}

func (s *MetadataService) enrichTMDBDetail(ctx context.Context, id, mediaType string) ItemEnrichment {
	id = strings.TrimSpace(id)
	mediaType = strings.TrimSpace(strings.ToLower(mediaType))
	if id == "" || strings.TrimSpace(s.cfg.TMDBAPIKey) == "" {
		if id != "" {
			return ItemEnrichment{Note: "Movie & TV summaries aren’t available until this site’s admin enables them."}
		}
		return ItemEnrichment{}
	}
	if mediaType != "tv" {
		mediaType = "movie"
	}
	u, _ := url.Parse(fmt.Sprintf("https://api.themoviedb.org/3/%s/%s", mediaType, id))
	q := u.Query()
	q.Set("api_key", s.cfg.TMDBAPIKey)
	u.RawQuery = q.Encode()
	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil || status < 200 || status >= 300 {
		return ItemEnrichment{Note: "Couldn’t load a summary right now. Try again in a moment."}
	}
	var parsed struct {
		Overview string `json:"overview"`
		Homepage string `json:"homepage"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return ItemEnrichment{}
	}
	syn := strings.TrimSpace(parsed.Overview)
	if syn == "" {
		return ItemEnrichment{Note: "No summary listed for this title."}
	}
	srcURL := "https://www.themoviedb.org/"
	if mediaType == "movie" {
		srcURL = fmt.Sprintf("https://www.themoviedb.org/movie/%s", id)
	} else {
		srcURL = fmt.Sprintf("https://www.themoviedb.org/tv/%s", id)
	}
	return ItemEnrichment{
		Synopsis:  syn,
		Source:    "The Movie Database",
		SourceURL: srcURL,
	}
}

func (s *MetadataService) enrichJikanMangaDetail(ctx context.Context, id string) ItemEnrichment {
	id = strings.TrimSpace(id)
	if id == "" {
		return ItemEnrichment{}
	}
	u := fmt.Sprintf("https://api.jikan.moe/v4/manga/%s/full", url.PathEscape(id))
	body, status, err := s.doGET(ctx, u, nil)
	if err != nil || status == 429 {
		return ItemEnrichment{Note: "Too many requests—try again in a few seconds."}
	}
	if status < 200 || status >= 300 {
		return ItemEnrichment{}
	}
	var wrap struct {
		Data struct {
			Synopsis string `json:"synopsis"`
			URL      string `json:"url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &wrap); err != nil {
		return ItemEnrichment{}
	}
	syn := strings.TrimSpace(html.UnescapeString(wrap.Data.Synopsis))
	syn = stripHTMLDescription(syn)
	if syn == "" {
		return ItemEnrichment{Note: "No summary listed for this title."}
	}
	srcURL := strings.TrimSpace(wrap.Data.URL)
	if srcURL == "" {
		srcURL = "https://myanimelist.net/"
	}
	return ItemEnrichment{
		Synopsis:  syn,
		Source:    "MyAnimeList",
		SourceURL: srcURL,
	}
}

func (s *MetadataService) enrichGoogleBooksVolume(ctx context.Context, volumeID string) ItemEnrichment {
	volumeID = strings.TrimSpace(volumeID)
	if volumeID == "" || strings.TrimSpace(s.cfg.GoogleBooksKey) == "" {
		if volumeID != "" {
			return ItemEnrichment{Note: "Book summaries aren’t available until this site’s admin enables them."}
		}
		return ItemEnrichment{}
	}
	u, _ := url.Parse(fmt.Sprintf("https://www.googleapis.com/books/v1/volumes/%s", url.PathEscape(volumeID)))
	q := u.Query()
	q.Set("key", s.cfg.GoogleBooksKey)
	u.RawQuery = q.Encode()
	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil || status < 200 || status >= 300 {
		return ItemEnrichment{}
	}
	var parsed struct {
		VolumeInfo struct {
			Description string `json:"description"`
			PreviewLink string `json:"previewLink"`
			InfoLink    string `json:"infoLink"`
		} `json:"volumeInfo"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return ItemEnrichment{}
	}
	syn := stripHTMLDescription(parsed.VolumeInfo.Description)
	if syn == "" {
		return ItemEnrichment{Note: "No description available for this book."}
	}
	link := strings.TrimSpace(parsed.VolumeInfo.InfoLink)
	if link == "" {
		link = strings.TrimSpace(parsed.VolumeInfo.PreviewLink)
	}
	return ItemEnrichment{
		Synopsis:  syn,
		Source:    "Google Books",
		SourceURL: link,
	}
}

func (s *MetadataService) enrichTheGamesDBDetail(ctx context.Context, gameID string) ItemEnrichment {
	gameID = strings.TrimSpace(gameID)
	if gameID == "" || strings.TrimSpace(s.cfg.TheGamesDBAPIKey) == "" {
		if gameID != "" {
			return ItemEnrichment{Note: "Game summaries aren’t available until this site’s admin enables them."}
		}
		return ItemEnrichment{}
	}
	u, _ := url.Parse("https://api.thegamesdb.net/v1/Games/ByGameID")
	q := u.Query()
	q.Set("apikey", s.cfg.TheGamesDBAPIKey)
	q.Set("id", gameID)
	u.RawQuery = q.Encode()
	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil || status < 200 || status >= 300 {
		return ItemEnrichment{}
	}
	var parsed struct {
		Data struct {
			Games []struct {
				Overview string `json:"overview"`
			} `json:"games"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return ItemEnrichment{}
	}
	if len(parsed.Data.Games) == 0 {
		return ItemEnrichment{}
	}
	syn := strings.TrimSpace(parsed.Data.Games[0].Overview)
	if syn == "" {
		return ItemEnrichment{Note: "No summary listed for this game."}
	}
	return ItemEnrichment{
		Synopsis:  stripHTMLDescription(syn),
		Source:    "Games database",
		SourceURL: "https://thegamesdb.net/",
	}
}

func (s *MetadataService) enrichComicVineDetail(ctx context.Context, id, resource string) ItemEnrichment {
	id = strings.TrimSpace(id)
	resource = strings.TrimSpace(strings.ToLower(resource))
	if id == "" || strings.TrimSpace(s.cfg.ComicVineAPIKey) == "" {
		if id != "" {
			return ItemEnrichment{Note: "Comic summaries aren’t available until this site’s admin enables them."}
		}
		return ItemEnrichment{}
	}
	if resource != "issue" {
		resource = "volume"
	}
	pathPrefix := "4050"
	if resource == "issue" {
		pathPrefix = "4000"
	}
	u, _ := url.Parse(fmt.Sprintf("https://comicvine.gamespot.com/api/%s/%s-%s/", resource, pathPrefix, url.PathEscape(id)))
	q := u.Query()
	q.Set("api_key", s.cfg.ComicVineAPIKey)
	q.Set("format", "json")
	q.Set("field_list", "description,deck,site_detail_url")
	u.RawQuery = q.Encode()
	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil || status < 200 || status >= 300 {
		return ItemEnrichment{}
	}
	var top struct {
		StatusCode int             `json:"status_code"`
		Results    json.RawMessage `json:"results"`
	}
	if err := json.Unmarshal(body, &top); err != nil || top.StatusCode != 1 || len(top.Results) == 0 {
		return ItemEnrichment{}
	}
	var detail struct {
		Description   string `json:"description"`
		Deck          string `json:"deck"`
		SiteDetailURL string `json:"site_detail_url"`
	}
	if err := json.Unmarshal(top.Results, &detail); err != nil {
		return ItemEnrichment{}
	}
	syn := stripHTMLDescription(detail.Description)
	if syn == "" {
		syn = strings.TrimSpace(detail.Deck)
	}
	if syn == "" {
		return ItemEnrichment{Note: "No description available for this comic."}
	}
	link := strings.ReplaceAll(strings.TrimSpace(detail.SiteDetailURL), "http://", "https://")
	return ItemEnrichment{
		Synopsis:  syn,
		Source:    "Comics database",
		SourceURL: link,
	}
}

func (s *MetadataService) enrichOpenLibraryWork(ctx context.Context, workKey string) ItemEnrichment {
	workKey = strings.TrimSpace(workKey)
	if workKey == "" {
		return ItemEnrichment{}
	}
	// Accept "OL123W" or "/works/OL123W"
	key := workKey
	if !strings.HasPrefix(key, "/") {
		key = "/works/" + strings.TrimPrefix(key, "/works/")
	}
	u := "https://openlibrary.org" + key + ".json"
	body, status, err := s.doGET(ctx, u, nil)
	if err != nil || status < 200 || status >= 300 {
		return ItemEnrichment{}
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(body, &raw); err != nil {
		return ItemEnrichment{}
	}
	var syn string
	if d, ok := raw["description"]; ok {
		switch t := d.(type) {
		case string:
			syn = t
		case map[string]interface{}:
			if v, ok := t["value"].(string); ok {
				syn = v
			}
		}
	}
	syn = strings.TrimSpace(syn)
	if syn == "" {
		return ItemEnrichment{Note: "No description available for this book."}
	}
	page := "https://openlibrary.org" + key
	return ItemEnrichment{
		Synopsis:  stripHTMLDescription(syn),
		Source:    "Open Library",
		SourceURL: page,
	}
}

const wikipediaAPI = "https://en.wikipedia.org/w/api.php"
const wikipediaREST = "https://en.wikipedia.org/api/rest_v1/page/summary"

// enrichWikipedia uses the English Wikipedia REST summary API after a title search. No API key required.
func (s *MetadataService) enrichWikipedia(ctx context.Context, category models.Category, title string, m map[string]interface{}) ItemEnrichment {
	q := wikipediaSearchQuery(category, title, m)
	if q == "" {
		return ItemEnrichment{}
	}
	titles, err := s.wikipediaSearchTitles(ctx, q, 6)
	if err != nil || len(titles) == 0 {
		return ItemEnrichment{}
	}
	for _, pageTitle := range titles {
		out := s.wikipediaPageSummary(ctx, pageTitle)
		if strings.TrimSpace(out.Synopsis) != "" {
			return out
		}
	}
	return ItemEnrichment{}
}

func wikipediaSearchQuery(category models.Category, title string, m map[string]interface{}) string {
	title = strings.TrimSpace(title)
	if title == "" {
		return ""
	}
	if m != nil {
		if a := metaStr(m, "author"); a != "" && (category == models.CategoryBook || category == models.CategoryManga) {
			return title + " " + a
		}
	}
	return title
}

func (s *MetadataService) wikipediaSearchTitles(ctx context.Context, q string, limit int) ([]string, error) {
	if limit < 1 {
		limit = 5
	}
	u, err := url.Parse(wikipediaAPI)
	if err != nil {
		return nil, err
	}
	qu := u.Query()
	qu.Set("action", "query")
	qu.Set("list", "search")
	qu.Set("srsearch", q)
	qu.Set("format", "json")
	qu.Set("srlimit", strconv.Itoa(limit))
	u.RawQuery = qu.Encode()
	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil || status != http.StatusOK {
		return nil, err
	}
	var wrap struct {
		Query *struct {
			Search []struct {
				Title string `json:"title"`
			} `json:"search"`
		} `json:"query"`
	}
	if err := json.Unmarshal(body, &wrap); err != nil || wrap.Query == nil {
		return nil, err
	}
	var titles []string
	for _, hit := range wrap.Query.Search {
		t := strings.TrimSpace(hit.Title)
		if t != "" {
			titles = append(titles, t)
		}
	}
	return titles, nil
}

func (s *MetadataService) wikipediaPageSummary(ctx context.Context, pageTitle string) ItemEnrichment {
	seg := strings.ReplaceAll(pageTitle, " ", "_")
	u := wikipediaREST + "/" + url.PathEscape(seg)
	body, status, err := s.doGET(ctx, u, nil)
	if err != nil || status != http.StatusOK {
		return ItemEnrichment{}
	}
	var parsed struct {
		Type    string `json:"type"`
		Extract string `json:"extract"`
		ContentURLs *struct {
			Desktop *struct {
				Page string `json:"page"`
			} `json:"desktop"`
		} `json:"content_urls"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return ItemEnrichment{}
	}
	ext := strings.TrimSpace(parsed.Extract)
	if ext == "" {
		return ItemEnrichment{}
	}
	// Skip disambiguation pages with no usable lede (search will try the next hit).
	if parsed.Type == "disambiguation" && len(ext) < 80 {
		return ItemEnrichment{}
	}
	syn := stripHTMLDescription(ext)
	if syn == "" {
		return ItemEnrichment{}
	}
	pageURL := "https://en.wikipedia.org/wiki/" + url.PathEscape(seg)
	if parsed.ContentURLs != nil && parsed.ContentURLs.Desktop != nil {
		if p := strings.TrimSpace(parsed.ContentURLs.Desktop.Page); p != "" {
			pageURL = p
		}
	}
	return ItemEnrichment{
		Synopsis:  syn,
		Source:    "Wikipedia",
		SourceURL: pageURL,
	}
}
