package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// MetadataHit is one searchable match from an external catalog.
type MetadataHit struct {
	Source     string         `json:"source"`
	Title      string         `json:"title"`
	Subtitle   string         `json:"subtitle,omitempty"`
	Year       *int           `json:"year,omitempty"`
	ThumbURL   string         `json:"thumb_url,omitempty"`
	ExternalID string         `json:"external_id,omitempty"`
	Artist     string         `json:"artist,omitempty"`
	Album      string         `json:"album,omitempty"`
	Platform   string         `json:"platform,omitempty"`
	Author     string         `json:"author,omitempty"`
	Publisher  string         `json:"publisher,omitempty"`
	ISBN       string         `json:"isbn,omitempty"`
	Genre      string         `json:"genre,omitempty"`
	Extra      map[string]any `json:"extra,omitempty"`
}

// MetadataLookupResult is returned by GET /api/v1/metadata/lookup.
type MetadataLookupResult struct {
	Source  string         `json:"source"`
	Query   string         `json:"query"`
	Stub    bool           `json:"stub"`
	Message string         `json:"message,omitempty"`
	Results []MetadataHit  `json:"results,omitempty"`
	Preview map[string]any `json:"preview,omitempty"`
}

// MetadataConfig holds optional API keys and identity for outbound HTTP.
type MetadataConfig struct {
	UserAgent        string
	DiscogsToken     string
	TheGamesDBAPIKey string
	GoogleBooksKey   string
	TMDBAPIKey       string
	ComicVineAPIKey  string
}

type MetadataService struct {
	cfg    MetadataConfig
	client *http.Client

	tgdbMu            sync.Mutex
	tgdbPlatformNames map[int]string // TheGamesDB platform id -> display name
	tgdbPlatformAt    time.Time

	tmdbMu          sync.Mutex
	tmdbMovieGenres map[int]string
	tmdbTVGenres    map[int]string
	tmdbGenresAt    time.Time
}

const tgdbPlatformCacheTTL = 24 * time.Hour
const tmdbGenreCacheTTL = 24 * time.Hour

func NewMetadataService(cfg MetadataConfig) *MetadataService {
	ua := strings.TrimSpace(cfg.UserAgent)
	if ua == "" {
		ua = "Kurator/1.0 +https://github.com/boxingoctopus/kurator"
	}
	cfg.UserAgent = ua
	return &MetadataService{
		cfg: cfg,
		client: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// Lookup queries external catalogs (Discogs, TheGamesDB, books/comics, TMDB, ComicVine, Jikan).
// provider: discogs | thegamesdb | book | tmdb | comic | comicvine | jikan | auto (stub).
func (s *MetadataService) Lookup(ctx context.Context, provider, q string) MetadataLookupResult {
	q = strings.TrimSpace(q)
	p := strings.ToLower(strings.TrimSpace(provider))
	base := MetadataLookupResult{Query: q, Source: p}

	if q == "" {
		base.Stub = true
		base.Message = "Enter a search query."
		return base
	}

	switch p {
	case "discogs", "music":
		return s.lookupDiscogs(ctx, q)
	case "thegamesdb", "gamesdb", "game":
		return s.lookupTheGamesDB(ctx, q)
	case "book", "books", "goodreads", "openlibrary":
		return s.lookupBooks(ctx, q)
	case "tmdb", "video":
		return s.lookupTMDB(ctx, q)
	case "comic", "comic_book":
		return s.lookupComic(ctx, q)
	case "comicvine":
		return s.lookupComicVine(ctx, q)
	case "jikan", "manga":
		return s.lookupJikanManga(ctx, q)
	case "auto":
		base.Stub = true
		base.Message = "Specify category (music, game, book, video, comic_book, manga) or provider=discogs|thegamesdb|book|tmdb|comic|comicvine|jikan."
		return base
	default:
		base.Stub = true
		base.Message = fmt.Sprintf("Unknown provider %q.", provider)
		return base
	}
}

func (s *MetadataService) doGET(ctx context.Context, rawURL string, header http.Header) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, 0, err
	}
	if header != nil {
		req.Header = header.Clone()
	}
	if req.Header.Get("User-Agent") == "" {
		req.Header.Set("User-Agent", s.cfg.UserAgent)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, resp.StatusCode, err
	}
	return b, resp.StatusCode, nil
}

func (s *MetadataService) lookupDiscogs(ctx context.Context, q string) MetadataLookupResult {
	out := MetadataLookupResult{Source: "discogs", Query: q}
	if strings.TrimSpace(s.cfg.DiscogsToken) == "" {
		out.Stub = true
		out.Message = "Discogs search requires DISCOGS_PERSONAL_TOKEN (create at discogs.com/settings/developers)."
		return out
	}

	u, _ := url.Parse("https://api.discogs.com/database/search")
	qry := u.Query()
	qry.Set("q", q)
	qry.Set("type", "release")
	qry.Set("per_page", "10")
	u.RawQuery = qry.Encode()

	h := make(http.Header)
	h.Set("User-Agent", s.cfg.UserAgent)
	h.Set("Authorization", "Discogs token="+s.cfg.DiscogsToken)

	body, status, err := s.doGET(ctx, u.String(), h)
	if err != nil {
		out.Stub = true
		out.Message = err.Error()
		return out
	}
	if status < 200 || status >= 300 {
		out.Stub = true
		if status == http.StatusUnauthorized {
			out.Message = "Discogs rejected the token (HTTP 401). Regenerate DISCOGS_PERSONAL_TOKEN at discogs.com/settings/developers."
		} else {
			out.Message = fmt.Sprintf("Discogs HTTP %d", status)
		}
		return out
	}

	var parsed struct {
		Results []struct {
			Type  string `json:"type"`
			Title string `json:"title"`
			Year  string `json:"year"`
			Thumb string `json:"thumb"`
			ID    int    `json:"id"`
			URI   string `json:"uri"`
		} `json:"results"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		out.Stub = true
		out.Message = "Invalid Discogs response."
		return out
	}

	for _, r := range parsed.Results {
		if r.Type != "" && r.Type != "release" {
			continue
		}
		if strings.TrimSpace(r.Title) == "" {
			continue
		}
		hit := MetadataHit{
			Source:     "discogs",
			Title:      r.Title,
			ThumbURL:   r.Thumb,
			ExternalID: strconv.Itoa(r.ID),
			Extra: map[string]any{
				"uri": r.URI,
			},
		}
		if y, err := strconv.Atoi(strings.TrimSpace(r.Year)); err == nil && y >= 1000 && y <= 9999 {
			hit.Year = &y
		}
		// Often "Artist - Title"
		if parts := strings.SplitN(r.Title, " - ", 2); len(parts) == 2 {
			hit.Artist = strings.TrimSpace(parts[0])
			hit.Album = strings.TrimSpace(parts[1])
			hit.Title = strings.TrimSpace(parts[1])
		}
		out.Results = append(out.Results, hit)
	}
	if len(out.Results) == 0 {
		out.Message = "No releases found."
	}
	return out
}

// theGamesDBPlatformNames loads GET /v1/Platforms (cached ~24h) for id -> name resolution.
func (s *MetadataService) theGamesDBPlatformNames(ctx context.Context, apiKey string) map[int]string {
	s.tgdbMu.Lock()
	defer s.tgdbMu.Unlock()
	if len(s.tgdbPlatformNames) > 0 && time.Since(s.tgdbPlatformAt) < tgdbPlatformCacheTTL {
		return s.tgdbPlatformNames
	}

	u, _ := url.Parse("https://api.thegamesdb.net/v1/Platforms")
	qry := u.Query()
	qry.Set("apikey", apiKey)
	u.RawQuery = qry.Encode()

	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil || status < 200 || status >= 300 {
		if len(s.tgdbPlatformNames) > 0 {
			return s.tgdbPlatformNames
		}
		return nil
	}

	var wrap struct {
		Data struct {
			Platforms map[string]struct {
				ID   int    `json:"id"`
				Name string `json:"name"`
			} `json:"platforms"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &wrap); err != nil {
		if len(s.tgdbPlatformNames) > 0 {
			return s.tgdbPlatformNames
		}
		return nil
	}

	m := make(map[int]string, len(wrap.Data.Platforms))
	for _, p := range wrap.Data.Platforms {
		if p.ID != 0 && strings.TrimSpace(p.Name) != "" {
			m[p.ID] = strings.TrimSpace(p.Name)
		}
	}
	if len(m) == 0 {
		return nil
	}
	s.tgdbPlatformNames = m
	s.tgdbPlatformAt = time.Now()
	return s.tgdbPlatformNames
}

func tgdbCoercePlatformID(v interface{}) int {
	switch x := v.(type) {
	case float64:
		return int(x)
	case int:
		return x
	case int64:
		return int(x)
	case json.Number:
		n, err := x.Int64()
		if err != nil {
			return 0
		}
		return int(n)
	default:
		return 0
	}
}

type tgdbImageEntry struct {
	Type     string  `json:"type"`
	Side     *string `json:"side"`
	Filename string  `json:"filename"`
}

func tgdbJoinImageBase(base, filename string) string {
	base = strings.TrimSuffix(strings.TrimSpace(base), "/")
	filename = strings.TrimSpace(filename)
	if base == "" || filename == "" {
		return ""
	}
	return base + "/" + strings.TrimPrefix(filename, "/")
}

// tgdbPickBoxArtURL picks the best cover URL from GET /Games/Images (front box art preferred).
func tgdbPickBoxArtURL(baseMedium, baseThumb string, list []tgdbImageEntry) string {
	base := baseMedium
	if base == "" {
		base = baseThumb
	}
	var boxFront, boxAny, clearlogo, banner, first string
	for _, im := range list {
		u := tgdbJoinImageBase(base, im.Filename)
		if u == "" {
			continue
		}
		if first == "" {
			first = u
		}
		switch im.Type {
		case "boxart":
			if im.Side != nil && *im.Side == "front" && boxFront == "" {
				boxFront = u
			}
			if boxAny == "" {
				boxAny = u
			}
		case "clearlogo":
			if clearlogo == "" {
				clearlogo = u
			}
		case "banner":
			if banner == "" {
				banner = u
			}
		}
	}
	if boxFront != "" {
		return boxFront
	}
	if boxAny != "" {
		return boxAny
	}
	if clearlogo != "" {
		return clearlogo
	}
	if banner != "" {
		return banner
	}
	return first
}

func (s *MetadataService) theGamesDBFetchImageURLs(ctx context.Context, apiKey string, gameIDs []string) map[string]string {
	if len(gameIDs) == 0 {
		return nil
	}
	u, _ := url.Parse("https://api.thegamesdb.net/v1/Games/Images")
	qry := u.Query()
	qry.Set("apikey", apiKey)
	qry.Set("games_id", strings.Join(gameIDs, ","))
	u.RawQuery = qry.Encode()

	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil || status < 200 || status >= 300 {
		return nil
	}
	var wrap struct {
		Data struct {
			BaseURL struct {
				Medium string `json:"medium"`
				Thumb  string `json:"thumb"`
			} `json:"base_url"`
			Images map[string][]tgdbImageEntry `json:"images"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &wrap); err != nil {
		return nil
	}
	baseM := wrap.Data.BaseURL.Medium
	baseT := wrap.Data.BaseURL.Thumb
	out := make(map[string]string)
	for idStr, list := range wrap.Data.Images {
		u := tgdbPickBoxArtURL(baseM, baseT, list)
		if u != "" {
			out[idStr] = u
		}
	}
	return out
}

func (s *MetadataService) theGamesDBAttachBoxArt(ctx context.Context, apiKey string, results *[]MetadataHit) {
	if results == nil || len(*results) == 0 {
		return
	}
	ids := make([]string, 0, len(*results))
	for _, h := range *results {
		if h.ExternalID != "" {
			ids = append(ids, h.ExternalID)
		}
	}
	if len(ids) == 0 {
		return
	}
	const chunk = 40
	urlByID := make(map[string]string)
	for i := 0; i < len(ids); i += chunk {
		end := i + chunk
		if end > len(ids) {
			end = len(ids)
		}
		part := ids[i:end]
		m := s.theGamesDBFetchImageURLs(ctx, apiKey, part)
		for k, v := range m {
			urlByID[k] = v
		}
	}
	res := *results
	for i := range res {
		if u := urlByID[res[i].ExternalID]; u != "" {
			res[i].ThumbURL = u
		}
	}
	*results = res
}

func (s *MetadataService) lookupTheGamesDB(ctx context.Context, q string) MetadataLookupResult {
	out := MetadataLookupResult{Source: "thegamesdb", Query: q}
	if strings.TrimSpace(s.cfg.TheGamesDBAPIKey) == "" {
		out.Stub = true
		out.Message = "TheGamesDB requires THEGAMESDB_API_KEY (request at thegamesdb.net forums)."
		return out
	}

	u, _ := url.Parse("https://api.thegamesdb.net/v1.1/Games/ByGameName")
	qry := u.Query()
	qry.Set("name", q)
	qry.Set("apikey", s.cfg.TheGamesDBAPIKey)
	u.RawQuery = qry.Encode()

	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil {
		out.Stub = true
		out.Message = err.Error()
		return out
	}
	if status < 200 || status >= 300 {
		out.Stub = true
		out.Message = fmt.Sprintf("TheGamesDB HTTP %d", status)
		return out
	}

	var parsed struct {
		Data struct {
			Games []struct {
				ID          interface{} `json:"id"`
				GameTitle   string      `json:"game_title"`
				ReleaseDate string      `json:"release_date"`
				// API returns numeric platform IDs (e.g. 7); unmarshaling into string fails.
				Platform interface{} `json:"platform"`
			} `json:"games"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		out.Stub = true
		out.Message = "Invalid TheGamesDB response."
		return out
	}

	platformNames := s.theGamesDBPlatformNames(ctx, s.cfg.TheGamesDBAPIKey)

	for _, g := range parsed.Data.Games {
		idStr := formatTGDBID(g.ID)
		pid := tgdbCoercePlatformID(g.Platform)
		platformLabel := ""
		if pid != 0 && platformNames != nil {
			platformLabel = platformNames[pid]
		}
		if platformLabel == "" {
			if pid != 0 {
				platformLabel = fmt.Sprintf("%d", pid)
			} else {
				platformLabel = strings.TrimSpace(fmt.Sprint(g.Platform))
			}
		}
		hit := MetadataHit{
			Source:     "thegamesdb",
			Title:      g.GameTitle,
			Platform:   platformLabel,
			ExternalID: idStr,
			Extra: map[string]any{
				"release_date": g.ReleaseDate,
			},
		}
		rd := strings.TrimSpace(g.ReleaseDate)
		// TGDB often uses 1970-01-01 as an unknown placeholder; omit year in that case.
		if !strings.HasPrefix(rd, "1970-01-01") {
			if y := parseYearPrefix(g.ReleaseDate); y != nil {
				hit.Year = y
			}
		}
		out.Results = append(out.Results, hit)
	}
	s.theGamesDBAttachBoxArt(ctx, s.cfg.TheGamesDBAPIKey, &out.Results)
	if len(out.Results) == 0 {
		out.Message = "No games found."
	}
	return out
}

func (s *MetadataService) lookupBooks(ctx context.Context, q string) MetadataLookupResult {
	return s.lookupBookFamily(ctx, q, false)
}

func cvCoerceStartYear(v interface{}) *int {
	switch x := v.(type) {
	case nil:
		return nil
	case float64:
		y := int(x)
		if y >= 1000 && y <= 9999 {
			return &y
		}
	case string:
		s := strings.TrimSpace(x)
		if len(s) >= 4 {
			if y, err := strconv.Atoi(s[:4]); err == nil && y >= 1000 && y <= 9999 {
				return &y
			}
		}
	}
	return nil
}

func cvPickImageURL(icon, thumb, medium, super string) string {
	for _, u := range []string{medium, super, thumb, icon} {
		if u = strings.TrimSpace(u); u != "" {
			return strings.ReplaceAll(u, "http://", "https://")
		}
	}
	return ""
}

// Comic Vine often puts the creator name on a nested "person" object; role sits beside it.
type cvPersonCredit struct {
	Name   string `json:"name"`
	Role   string `json:"role"`
	Person *struct {
		Name string `json:"name"`
	} `json:"person"`
}

func (p cvPersonCredit) creditName() string {
	if n := strings.TrimSpace(p.Name); n != "" {
		return n
	}
	if p.Person != nil {
		return strings.TrimSpace(p.Person.Name)
	}
	return ""
}

func cvDedupeCommaNames(names []string) string {
	seen := make(map[string]bool)
	var out []string
	for _, n := range names {
		n = strings.TrimSpace(n)
		if n == "" {
			continue
		}
		k := strings.ToLower(n)
		if seen[k] {
			continue
		}
		seen[k] = true
		out = append(out, n)
	}
	return strings.Join(out, ", ")
}

func cvWriterArtistFromCredits(credits []cvPersonCredit) (writer, artist string) {
	var writers []string
	var artists []string
	for _, p := range credits {
		n := p.creditName()
		if n == "" {
			continue
		}
		r := strings.ToLower(strings.TrimSpace(p.Role))
		switch {
		case r == "writer" || r == "co-writer" || strings.Contains(r, "writer"):
			writers = append(writers, n)
		case strings.Contains(r, "pencil") || strings.Contains(r, "penciller") ||
			r == "inker" || strings.Contains(r, "colorist") ||
			(strings.Contains(r, "artist") && !strings.Contains(r, "writer")) ||
			strings.Contains(r, "cover"):
			artists = append(artists, n)
		}
	}
	return cvDedupeCommaNames(writers), cvDedupeCommaNames(artists)
}

func cvStringifyIssueNumber(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(x)
	case float64:
		if x == float64(int(x)) {
			return strconv.Itoa(int(x))
		}
		return strconv.FormatFloat(x, 'f', -1, 64)
	default:
		return strings.TrimSpace(fmt.Sprint(x))
	}
}

func (s *MetadataService) comicVineFetchResource(ctx context.Context, path string, q url.Values) ([]byte, error) {
	if q == nil {
		q = url.Values{}
	}
	q.Set("api_key", s.cfg.ComicVineAPIKey)
	q.Set("format", "json")
	u, err := url.Parse("https://comicvine.gamespot.com/api/" + strings.TrimPrefix(path, "/"))
	if err != nil {
		return nil, err
	}
	u.RawQuery = q.Encode()
	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil {
		return nil, err
	}
	if status < 200 || status >= 300 {
		return nil, fmt.Errorf("HTTP %d", status)
	}
	return body, nil
}

func (s *MetadataService) comicVineEnrichVolumeCredits(ctx context.Context, hit *MetadataHit, volumeID int) {
	// Omit field_list so person_credits include nested "person" { name } (field_list can strip it).
	body, err := s.comicVineFetchResource(ctx, fmt.Sprintf("volume/4050-%d/", volumeID), url.Values{})
	if err != nil {
		return
	}
	var wrap struct {
		StatusCode int `json:"status_code"`
		Results    struct {
			PersonCredits []cvPersonCredit `json:"person_credits"`
		} `json:"results"`
	}
	if err := json.Unmarshal(body, &wrap); err != nil || wrap.StatusCode != 1 {
		return
	}
	w, a := cvWriterArtistFromCredits(wrap.Results.PersonCredits)
	hit.Author = w
	hit.Artist = a
}

func (s *MetadataService) comicVineEnrichIssueDetail(ctx context.Context, hit *MetadataHit, issueID int) {
	body, err := s.comicVineFetchResource(ctx, fmt.Sprintf("issue/4000-%d/", issueID), url.Values{})
	if err != nil {
		return
	}
	var wrap struct {
		StatusCode int `json:"status_code"`
		Results    struct {
			PersonCredits []cvPersonCredit `json:"person_credits"`
			CoverDate     string           `json:"cover_date"`
			IssueNumber   any              `json:"issue_number"`
			Name          string           `json:"name"`
			Image         struct {
				IconURL   string `json:"icon_url"`
				ThumbURL  string `json:"thumb_url"`
				MediumURL string `json:"medium_url"`
				SuperURL  string `json:"super_url"`
			} `json:"image"`
			Volume *struct {
				Publisher *struct {
					Name string `json:"name"`
				} `json:"publisher"`
			} `json:"volume"`
		} `json:"results"`
	}
	if err := json.Unmarshal(body, &wrap); err != nil || wrap.StatusCode != 1 {
		return
	}
	r := wrap.Results
	w, a := cvWriterArtistFromCredits(r.PersonCredits)
	hit.Author = w
	hit.Artist = a
	if r.Volume != nil && r.Volume.Publisher != nil {
		if p := strings.TrimSpace(r.Volume.Publisher.Name); p != "" {
			hit.Publisher = p
		}
	}
	if y := parseYearPrefix(r.CoverDate); y != nil {
		hit.Year = y
	}
	inum := cvStringifyIssueNumber(r.IssueNumber)
	if inum != "" {
		hit.Extra["issue_number"] = inum
	}
	if img := cvPickImageURL(r.Image.IconURL, r.Image.ThumbURL, r.Image.MediumURL, r.Image.SuperURL); img != "" {
		hit.ThumbURL = img
	}
	if t := strings.TrimSpace(r.Name); t != "" {
		hit.Title = t
	}
}

func (s *MetadataService) lookupComicVine(ctx context.Context, q string) MetadataLookupResult {
	out := MetadataLookupResult{Source: "comicvine", Query: q}
	if strings.TrimSpace(s.cfg.ComicVineAPIKey) == "" {
		out.Stub = true
		out.Message = "Comic Vine requires COMICVINE_API_KEY (register at comicvine.gamespot.com/api)."
		return out
	}

	u, _ := url.Parse("https://comicvine.gamespot.com/api/search/")
	qry := u.Query()
	qry.Set("api_key", s.cfg.ComicVineAPIKey)
	qry.Set("format", "json")
	qry.Set("query", q)
	qry.Set("resources", "volume,issue")
	qry.Set("limit", "10")
	u.RawQuery = qry.Encode()

	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil {
		out.Stub = true
		out.Message = err.Error()
		return out
	}
	if status < 200 || status >= 300 {
		out.Stub = true
		out.Message = fmt.Sprintf("Comic Vine HTTP %d", status)
		return out
	}

	var parsed struct {
		StatusCode int               `json:"status_code"`
		Error      string            `json:"error"`
		Results    []json.RawMessage `json:"results"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		out.Stub = true
		out.Message = "Invalid Comic Vine response."
		return out
	}
	if parsed.StatusCode != 1 {
		out.Stub = true
		if parsed.Error != "" {
			out.Message = parsed.Error
		} else {
			out.Message = fmt.Sprintf("Comic Vine error (status_code %d).", parsed.StatusCode)
		}
		return out
	}

	for _, raw := range parsed.Results {
		var head struct {
			ResourceType string `json:"resource_type"`
		}
		if err := json.Unmarshal(raw, &head); err != nil {
			continue
		}
		rt := strings.ToLower(strings.TrimSpace(head.ResourceType))
		switch rt {
		case "volume":
			var r struct {
				ID        int    `json:"id"`
				Name      string `json:"name"`
				Deck      string `json:"deck"`
				StartYear any    `json:"start_year"`
				Image     struct {
					IconURL   string `json:"icon_url"`
					ThumbURL  string `json:"thumb_url"`
					MediumURL string `json:"medium_url"`
					SuperURL  string `json:"super_url"`
				} `json:"image"`
				Publisher *struct {
					Name string `json:"name"`
				} `json:"publisher"`
				SiteDetailURL string `json:"site_detail_url"`
			}
			if err := json.Unmarshal(raw, &r); err != nil {
				continue
			}
			title := strings.TrimSpace(r.Name)
			if title == "" {
				continue
			}
			hit := MetadataHit{
				Source:     "comicvine",
				Title:      title,
				ExternalID: strconv.Itoa(r.ID),
				Extra: map[string]any{
					"comicvine_resource": "volume",
					"single_issue":       false,
				},
			}
			if d := strings.TrimSpace(r.Deck); d != "" {
				hit.Subtitle = d
				if len(d) > 120 {
					hit.Subtitle = d[:117] + "..."
				}
			}
			if r.Publisher != nil {
				if p := strings.TrimSpace(r.Publisher.Name); p != "" {
					hit.Publisher = p
				}
			}
			if y := cvCoerceStartYear(r.StartYear); y != nil {
				hit.Year = y
			}
			if img := cvPickImageURL(r.Image.IconURL, r.Image.ThumbURL, r.Image.MediumURL, r.Image.SuperURL); img != "" {
				hit.ThumbURL = img
			}
			if u := strings.TrimSpace(r.SiteDetailURL); u != "" {
				hit.Extra["site_detail_url"] = strings.ReplaceAll(u, "http://", "https://")
			}
			s.comicVineEnrichVolumeCredits(ctx, &hit, r.ID)
			out.Results = append(out.Results, hit)

		case "issue":
			var r struct {
				ID          int    `json:"id"`
				Name        string `json:"name"`
				IssueNumber any    `json:"issue_number"`
				Deck        string `json:"deck"`
				Image       struct {
					IconURL   string `json:"icon_url"`
					ThumbURL  string `json:"thumb_url"`
					MediumURL string `json:"medium_url"`
					SuperURL  string `json:"super_url"`
				} `json:"image"`
				Volume *struct {
					ID   int    `json:"id"`
					Name string `json:"name"`
				} `json:"volume"`
				SiteDetailURL string `json:"site_detail_url"`
			}
			if err := json.Unmarshal(raw, &r); err != nil {
				continue
			}
			inum := cvStringifyIssueNumber(r.IssueNumber)
			volName := ""
			if r.Volume != nil {
				volName = strings.TrimSpace(r.Volume.Name)
			}
			title := strings.TrimSpace(r.Name)
			if title == "" && volName != "" && inum != "" {
				title = fmt.Sprintf("%s #%s", volName, inum)
			}
			if title == "" {
				continue
			}
			hit := MetadataHit{
				Source:     "comicvine",
				Title:      title,
				ExternalID: strconv.Itoa(r.ID),
				Extra: map[string]any{
					"comicvine_resource": "issue",
					"single_issue":       true,
					"issue_number":       inum,
				},
			}
			if d := strings.TrimSpace(r.Deck); d != "" {
				hit.Subtitle = d
				if len(d) > 120 {
					hit.Subtitle = d[:117] + "..."
				}
			}
			if img := cvPickImageURL(r.Image.IconURL, r.Image.ThumbURL, r.Image.MediumURL, r.Image.SuperURL); img != "" {
				hit.ThumbURL = img
			}
			if u := strings.TrimSpace(r.SiteDetailURL); u != "" {
				hit.Extra["site_detail_url"] = strings.ReplaceAll(u, "http://", "https://")
			}
			s.comicVineEnrichIssueDetail(ctx, &hit, r.ID)
			out.Results = append(out.Results, hit)
		}
	}
	if len(out.Results) == 0 {
		out.Message = "No matching comic volumes or issues found."
	}
	return out
}

func (s *MetadataService) lookupComic(ctx context.Context, q string) MetadataLookupResult {
	if strings.TrimSpace(s.cfg.ComicVineAPIKey) != "" {
		cv := s.lookupComicVine(ctx, q)
		if cv.Stub {
			if strings.Contains(strings.ToLower(cv.Message), "invalid api key") {
				return cv
			}
		} else if len(cv.Results) > 0 {
			cv.Message = "Results from Comic Vine."
			return cv
		}
	}
	return s.lookupBookFamily(ctx, q, true)
}

func (s *MetadataService) lookupBookFamily(ctx context.Context, q string, comic bool) MetadataLookupResult {
	bookDisclaimer := "Goodreads does not offer a public search API."
	comicDisclaimer := "There is no single public comic-database API."
	disclaimer := bookDisclaimer
	if comic {
		disclaimer = comicDisclaimer
	}

	if strings.TrimSpace(s.cfg.GoogleBooksKey) != "" {
		g := s.lookupGoogleBooks(ctx, q)
		if !g.Stub && len(g.Results) > 0 {
			if comic {
				g.Source = "comic"
			} else {
				g.Source = "book"
			}
			g.Query = q
			g.Message = disclaimer + " Results are from Google Books."
			return g
		}
	}

	ol := s.lookupOpenLibrary(ctx, q)
	if comic {
		ol.Source = "comic"
	} else {
		ol.Source = "book"
	}
	ol.Query = q
	if ol.Stub {
		return ol
	}
	if ol.Message == "No books found." && comic {
		ol.Message = "No matching comics found in Open Library."
	}
	if ol.Message == "" {
		ol.Message = disclaimer + " Results are from Open Library."
	} else {
		ol.Message = disclaimer + " " + ol.Message
	}
	return ol
}

func (s *MetadataService) fetchTMDBGenreList(ctx context.Context, kind string) map[int]string {
	u, _ := url.Parse(fmt.Sprintf("https://api.themoviedb.org/3/genre/%s/list", kind))
	qry := u.Query()
	qry.Set("api_key", s.cfg.TMDBAPIKey)
	u.RawQuery = qry.Encode()
	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil || status < 200 || status >= 300 {
		return nil
	}
	var wrap struct {
		Genres []struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
		} `json:"genres"`
	}
	if err := json.Unmarshal(body, &wrap); err != nil {
		return nil
	}
	m := make(map[int]string, len(wrap.Genres))
	for _, g := range wrap.Genres {
		if g.ID != 0 && strings.TrimSpace(g.Name) != "" {
			m[g.ID] = strings.TrimSpace(g.Name)
		}
	}
	return m
}

// tmdbGenreMaps returns cached TMDB id→name maps for movie and TV genres.
func (s *MetadataService) tmdbGenreMaps(ctx context.Context) (map[int]string, map[int]string) {
	s.tmdbMu.Lock()
	stale := len(s.tmdbMovieGenres) == 0 || len(s.tmdbTVGenres) == 0 || time.Since(s.tmdbGenresAt) >= tmdbGenreCacheTTL
	if !stale {
		mg, tg := s.tmdbMovieGenres, s.tmdbTVGenres
		s.tmdbMu.Unlock()
		return mg, tg
	}
	s.tmdbMu.Unlock()

	movie := s.fetchTMDBGenreList(ctx, "movie")
	tv := s.fetchTMDBGenreList(ctx, "tv")

	s.tmdbMu.Lock()
	defer s.tmdbMu.Unlock()
	if len(movie) > 0 {
		s.tmdbMovieGenres = movie
	}
	if len(tv) > 0 {
		s.tmdbTVGenres = tv
	}
	if len(s.tmdbMovieGenres) > 0 && len(s.tmdbTVGenres) > 0 {
		s.tmdbGenresAt = time.Now()
	}
	return s.tmdbMovieGenres, s.tmdbTVGenres
}

func (s *MetadataService) lookupTMDB(ctx context.Context, q string) MetadataLookupResult {
	out := MetadataLookupResult{Source: "tmdb", Query: q}
	if strings.TrimSpace(s.cfg.TMDBAPIKey) == "" {
		out.Stub = true
		out.Message = "TMDB search requires TMDB_API_KEY (themoviedb.org → Settings → API)."
		return out
	}

	movieGenres, tvGenres := s.tmdbGenreMaps(ctx)

	u, _ := url.Parse("https://api.themoviedb.org/3/search/multi")
	qry := u.Query()
	qry.Set("api_key", s.cfg.TMDBAPIKey)
	qry.Set("query", q)
	qry.Set("include_adult", "false")
	u.RawQuery = qry.Encode()

	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil {
		out.Stub = true
		out.Message = err.Error()
		return out
	}
	if status < 200 || status >= 300 {
		out.Stub = true
		out.Message = fmt.Sprintf("TMDB HTTP %d", status)
		return out
	}

	var parsed struct {
		Results []struct {
			MediaType    string  `json:"media_type"`
			Title        string  `json:"title"`
			Name         string  `json:"name"`
			ReleaseDate  string  `json:"release_date"`
			FirstAirDate string  `json:"first_air_date"`
			PosterPath   string  `json:"poster_path"`
			GenreIDs     []int   `json:"genre_ids"`
			ID           float64 `json:"id"`
			Overview     string  `json:"overview"`
		} `json:"results"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		out.Stub = true
		out.Message = "Invalid TMDB response."
		return out
	}

	for _, r := range parsed.Results {
		mt := strings.ToLower(strings.TrimSpace(r.MediaType))
		if mt == "person" {
			continue
		}
		title := strings.TrimSpace(r.Title)
		if mt == "tv" {
			title = strings.TrimSpace(r.Name)
		}
		if title == "" {
			continue
		}
		var subtitle string
		switch mt {
		case "movie":
			subtitle = "Movie"
		case "tv":
			subtitle = "TV"
		default:
			subtitle = strings.TrimSpace(r.MediaType)
		}
		hit := MetadataHit{
			Source:   "tmdb",
			Title:    title,
			Subtitle: subtitle,
			Extra: map[string]any{
				"media_type": mt,
				"tmdb_id":    r.ID,
			},
		}
		if r.Overview != "" {
			hit.Extra["overview"] = r.Overview
		}
		date := r.ReleaseDate
		if mt == "tv" {
			date = r.FirstAirDate
		}
		if y := parseYearPrefix(date); y != nil {
			hit.Year = y
		}
		if p := strings.TrimSpace(r.PosterPath); p != "" {
			hit.ThumbURL = "https://image.tmdb.org/t/p/w185" + p
		}
		var genreNames []string
		if mt == "movie" && movieGenres != nil {
			for _, gid := range r.GenreIDs {
				if n := movieGenres[gid]; n != "" {
					genreNames = append(genreNames, n)
				}
			}
		} else if mt == "tv" && tvGenres != nil {
			for _, gid := range r.GenreIDs {
				if n := tvGenres[gid]; n != "" {
					genreNames = append(genreNames, n)
				}
			}
		}
		if len(genreNames) > 0 {
			hit.Genre = strings.Join(genreNames, ", ")
		}
		hit.ExternalID = formatTGDBID(r.ID)
		out.Results = append(out.Results, hit)
	}
	if len(out.Results) == 0 {
		out.Message = "No movies or TV shows found."
	}
	return out
}

func (s *MetadataService) lookupJikanManga(ctx context.Context, q string) MetadataLookupResult {
	out := MetadataLookupResult{Source: "jikan", Query: q}

	u, _ := url.Parse("https://api.jikan.moe/v4/manga")
	qry := u.Query()
	qry.Set("q", q)
	qry.Set("limit", "10")
	qry.Set("sfw", "true")
	u.RawQuery = qry.Encode()

	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil {
		out.Stub = true
		out.Message = err.Error()
		return out
	}
	if status == 429 {
		out.Stub = true
		out.Message = "Jikan rate limit: wait a few seconds and try again."
		return out
	}
	if status < 200 || status >= 300 {
		out.Stub = true
		out.Message = fmt.Sprintf("Jikan HTTP %d", status)
		return out
	}

	var parsed struct {
		Data []struct {
			MalID  int    `json:"mal_id"`
			Title  string `json:"title"`
			Year   *int   `json:"year"`
			Images struct {
				JPG struct {
					ImageURL      string `json:"image_url"`
					LargeImageURL string `json:"large_image_url"`
				} `json:"jpg"`
			} `json:"images"`
			Authors []struct {
				Name string `json:"name"`
			} `json:"authors"`
			Published *struct {
				From *string `json:"from"`
			} `json:"published"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		out.Stub = true
		out.Message = "Invalid Jikan response."
		return out
	}

	for _, d := range parsed.Data {
		t := strings.TrimSpace(d.Title)
		if t == "" {
			continue
		}
		hit := MetadataHit{
			Source: "jikan",
			Title:  t,
			Extra: map[string]any{
				"mal_id": d.MalID,
			},
		}
		if len(d.Authors) > 0 {
			hit.Author = strings.TrimSpace(d.Authors[0].Name)
		}
		if d.Year != nil && *d.Year >= 1000 && *d.Year <= 9999 {
			y := *d.Year
			hit.Year = &y
		} else if d.Published != nil && d.Published.From != nil {
			hit.Year = parseYearPrefix(*d.Published.From)
		}
		if u := strings.TrimSpace(d.Images.JPG.ImageURL); u != "" {
			hit.ThumbURL = u
		} else if u := strings.TrimSpace(d.Images.JPG.LargeImageURL); u != "" {
			hit.ThumbURL = u
		}
		hit.ExternalID = strconv.Itoa(d.MalID)
		out.Results = append(out.Results, hit)
	}
	if len(out.Results) == 0 {
		out.Message = "No manga found."
	}
	return out
}

func (s *MetadataService) lookupOpenLibrary(ctx context.Context, q string) MetadataLookupResult {
	out := MetadataLookupResult{Source: "openlibrary", Query: q}

	u, _ := url.Parse("https://openlibrary.org/search.json")
	qry := u.Query()
	qry.Set("q", q)
	qry.Set("limit", "10")
	u.RawQuery = qry.Encode()

	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil {
		out.Stub = true
		out.Message = err.Error()
		return out
	}
	if status < 200 || status >= 300 {
		out.Stub = true
		out.Message = fmt.Sprintf("Open Library HTTP %d", status)
		return out
	}

	var parsed struct {
		Docs []struct {
			Title            string   `json:"title"`
			AuthorName       []string `json:"author_name"`
			Publisher        []string `json:"publisher"`
			Isbn             []string `json:"isbn"`
			FirstPublishYear int      `json:"first_publish_year"`
			CoverI           int      `json:"cover_i"`
		} `json:"docs"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		out.Stub = true
		out.Message = "Invalid Open Library response."
		return out
	}

	for _, d := range parsed.Docs {
		hit := MetadataHit{
			Source: "openlibrary",
			Title:  d.Title,
		}
		if len(d.AuthorName) > 0 {
			hit.Author = d.AuthorName[0]
		}
		if len(d.Publisher) > 0 {
			if p := strings.TrimSpace(d.Publisher[0]); p != "" {
				hit.Publisher = p
			}
		}
		if d.FirstPublishYear >= 1000 && d.FirstPublishYear <= 9999 {
			y := d.FirstPublishYear
			hit.Year = &y
		}
		if d.CoverI > 0 {
			hit.ThumbURL = fmt.Sprintf("https://covers.openlibrary.org/b/id/%d-M.jpg", d.CoverI)
		}
		if isbn := pickISBNFromStrings(d.Isbn); isbn != "" {
			hit.ISBN = isbn
		}
		out.Results = append(out.Results, hit)
	}
	if len(out.Results) == 0 {
		out.Message = "No books found."
	}
	return out
}

func (s *MetadataService) lookupGoogleBooks(ctx context.Context, q string) MetadataLookupResult {
	out := MetadataLookupResult{Source: "googlebooks", Query: q}

	u, _ := url.Parse("https://www.googleapis.com/books/v1/volumes")
	qry := u.Query()
	qry.Set("q", q)
	qry.Set("maxResults", "10")
	qry.Set("key", s.cfg.GoogleBooksKey)
	u.RawQuery = qry.Encode()

	body, status, err := s.doGET(ctx, u.String(), nil)
	if err != nil {
		out.Stub = true
		out.Message = err.Error()
		return out
	}
	if status < 200 || status >= 300 {
		out.Stub = true
		out.Message = fmt.Sprintf("Google Books HTTP %d", status)
		return out
	}

	var parsed struct {
		Items []struct {
			ID         string `json:"id"`
			VolumeInfo struct {
				Title               string   `json:"title"`
				Subtitle            string   `json:"subtitle"`
				Authors             []string `json:"authors"`
				Publisher           string   `json:"publisher"`
				PublishedDate       string   `json:"publishedDate"`
				IndustryIdentifiers []struct {
					Type       string `json:"type"`
					Identifier string `json:"identifier"`
				} `json:"industryIdentifiers"`
				ImageLinks struct {
					Thumbnail string `json:"thumbnail"`
				} `json:"imageLinks"`
			} `json:"volumeInfo"`
		} `json:"items"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		out.Stub = true
		out.Message = "Invalid Google Books response."
		return out
	}

	for _, it := range parsed.Items {
		v := it.VolumeInfo
		hit := MetadataHit{
			Source:     "googlebooks",
			Title:      v.Title,
			Subtitle:   v.Subtitle,
			ThumbURL:   strings.ReplaceAll(v.ImageLinks.Thumbnail, "http://", "https://"),
			ExternalID: it.ID,
		}
		if len(v.Authors) > 0 {
			hit.Author = v.Authors[0]
		}
		if p := strings.TrimSpace(v.Publisher); p != "" {
			hit.Publisher = p
		}
		if y := parseYearPrefix(v.PublishedDate); y != nil {
			hit.Year = y
		}
		if isbn := pickISBNFromIndustryIdentifiers(v.IndustryIdentifiers); isbn != "" {
			hit.ISBN = isbn
		}
		out.Results = append(out.Results, hit)
	}
	if len(out.Results) == 0 {
		out.Message = "No books found."
	}
	return out
}

func formatTGDBID(id interface{}) string {
	switch v := id.(type) {
	case float64:
		return strconv.FormatInt(int64(v), 10)
	case string:
		return v
	default:
		return fmt.Sprint(v)
	}
}

func parseYearPrefix(s string) *int {
	s = strings.TrimSpace(s)
	if len(s) < 4 {
		return nil
	}
	y, err := strconv.Atoi(s[:4])
	if err != nil || y < 1000 || y > 9999 {
		return nil
	}
	return &y
}

func pickISBNFromIndustryIdentifiers(ids []struct {
	Type       string `json:"type"`
	Identifier string `json:"identifier"`
}) string {
	var isbn13, isbn10 string
	for _, id := range ids {
		v := strings.TrimSpace(id.Identifier)
		if v == "" {
			continue
		}
		switch id.Type {
		case "ISBN_13":
			isbn13 = v
		case "ISBN_10":
			isbn10 = v
		}
	}
	if isbn13 != "" {
		return isbn13
	}
	return isbn10
}

// pickISBNFromStrings prefers ISBN-13, then ISBN-10, from Open Library–style lists.
func pickISBNFromStrings(list []string) string {
	norm := func(s string) string {
		var b strings.Builder
		for _, r := range s {
			if r >= '0' && r <= '9' {
				b.WriteRune(r)
			} else if (r == 'X' || r == 'x') && b.Len() == 9 {
				b.WriteRune('X')
			}
		}
		return b.String()
	}
	for _, raw := range list {
		s := strings.TrimSpace(raw)
		if s == "" {
			continue
		}
		if t := norm(s); len(t) == 13 {
			return t
		}
	}
	for _, raw := range list {
		s := strings.TrimSpace(raw)
		if s == "" {
			continue
		}
		if t := norm(s); len(t) == 10 {
			return t
		}
	}
	for _, raw := range list {
		if s := strings.TrimSpace(raw); s != "" {
			return s
		}
	}
	return ""
}
