package validation

import (
	"encoding/json"
	"net/url"
	"strings"
)

type flexibleSocialLink struct {
	Platform string `json:"platform"`
	Label    string `json:"label"`
	URL      string `json:"url"`
}

type normalizedSocialLink struct {
	Platform string `json:"platform"`
	URL      string `json:"url"`
}

var allowedSocialPlatforms = map[string]struct{}{
	"github": {}, "instagram": {}, "facebook": {},
	"youtube": {}, "twitch": {}, "discord": {}, "reddit": {},
	"spotify": {}, "soundcloud": {}, "tiktok": {},
	"threads": {}, "bsky.app": {}, "mastodon": {}, "linktree": {},
	"patreon": {}, "substack": {},
	"goodreads": {}, "imdb": {}, "discogs": {}, "hey.cafe": {}, "ehnw.ca": {},
	"custom": {},
}

func allowedSocialPlatform(p string) bool {
	_, ok := allowedSocialPlatforms[strings.ToLower(strings.TrimSpace(p))]
	return ok
}

func inferPlatformFromURL(u *url.URL) string {
	host := strings.ToLower(strings.TrimPrefix(u.Hostname(), "www."))
	switch {
	case strings.HasSuffix(host, "github.com") || host == "gist.github.com":
		return "github"
	case strings.Contains(host, "instagram.com"):
		return "instagram"
	case strings.Contains(host, "facebook.com") || host == "fb.com" || host == "m.facebook.com":
		return "facebook"
	case strings.Contains(host, "youtube.com") || host == "youtu.be":
		return "youtube"
	case strings.Contains(host, "twitch.tv"):
		return "twitch"
	case strings.Contains(host, "discord."):
		return "discord"
	case strings.Contains(host, "reddit.com"):
		return "reddit"
	case strings.Contains(host, "spotify.com"):
		return "spotify"
	case strings.Contains(host, "soundcloud.com"):
		return "soundcloud"
	case strings.Contains(host, "tiktok.com"):
		return "tiktok"
	case host == "threads.net":
		return "threads"
	case strings.Contains(host, "bsky.app"):
		return "bsky.app"
	case strings.Contains(host, "linktr.ee") || strings.Contains(host, "linktree.com"):
		return "linktree"
	case strings.Contains(host, "patreon.com"):
		return "patreon"
	case strings.Contains(host, "substack.com"):
		return "substack"
	case host == "hey.cafe":
		return "hey.cafe"
	case host == "ehnw.ca":
		return "ehnw.ca"
	case strings.Contains(host, "goodreads.com"):
		return "goodreads"
	case strings.Contains(host, "imdb.com"):
		return "imdb"
	case strings.Contains(host, "discogs.com"):
		return "discogs"
	case strings.Contains(host, "mastodon"):
		return "mastodon"
	default:
		return "custom"
	}
}

func platformMatchesURL(platform string, u *url.URL) bool {
	p := strings.ToLower(strings.TrimSpace(platform))
	host := strings.ToLower(strings.TrimPrefix(u.Hostname(), "www."))
	inferred := inferPlatformFromURL(u)

	switch p {
	case "custom":
		return true
	case "mastodon":
		return inferred == "mastodon" || inferred == "custom"
	case "github":
		return strings.HasSuffix(host, "github.com") || host == "gist.github.com"
	case "instagram":
		return strings.Contains(host, "instagram.com")
	case "facebook":
		return strings.Contains(host, "facebook.com") || host == "fb.com" || host == "m.facebook.com"
	case "youtube":
		return strings.Contains(host, "youtube.com") || host == "youtu.be"
	case "twitch":
		return strings.Contains(host, "twitch.tv")
	case "discord":
		return strings.Contains(host, "discord.")
	case "reddit":
		return strings.Contains(host, "reddit.com")
	case "spotify":
		return strings.Contains(host, "spotify.com")
	case "soundcloud":
		return strings.Contains(host, "soundcloud.com")
	case "tiktok":
		return strings.Contains(host, "tiktok.com")
	case "threads":
		return host == "threads.net"
	case "bsky.app":
		return strings.Contains(host, "bsky.app")
	case "linktree":
		return strings.Contains(host, "linktr.ee") || strings.Contains(host, "linktree.com")
	case "patreon":
		return strings.Contains(host, "patreon.com")
	case "goodreads":
		return strings.Contains(host, "goodreads.com")
	case "imdb":
		return strings.Contains(host, "imdb.com")
	case "discogs":
		return strings.Contains(host, "discogs.com")
	case "hey.cafe":
		return host == "hey.cafe"
	case "ehnw.ca":
		return host == "ehnw.ca"
	case "substack":
		return strings.Contains(host, "substack.com")
	default:
		return inferred == p
	}
}

// SocialLinksJSON validates and normalizes social_links JSON to {platform,url} objects (max 12, https only).
func SocialLinksJSON(raw []byte) ([]byte, error) {
	if len(raw) == 0 {
		return []byte("[]"), nil
	}
	var items []flexibleSocialLink
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, Invalidf("social_links must be a JSON array")
	}
	if len(items) > 12 {
		return nil, Invalidf("at most 12 social links")
	}
	out := make([]normalizedSocialLink, 0, len(items))
	for _, it := range items {
		urlStr := strings.TrimSpace(it.URL)
		if urlStr == "" {
			continue
		}
		canonical, err := HTTPOrHTTPSURL(urlStr, "Link URL")
		if err != nil {
			return nil, err
		}
		parsed, err := url.Parse(canonical)
		if err != nil {
			return nil, Invalidf("invalid link URL")
		}
		platform := strings.TrimSpace(strings.ToLower(it.Platform))
		if platform == "" {
			platform = inferPlatformFromURL(parsed)
		}
		if !allowedSocialPlatform(platform) {
			return nil, Invalidf("unknown social platform: %s", platform)
		}
		if plat, err := StrictPlainText(platform, 32, "Platform", false); err != nil {
			return nil, err
		} else {
			platform = plat
		}
		if !platformMatchesURL(platform, parsed) {
			return nil, Invalidf("URL does not match selected platform %s", platform)
		}
		out = append(out, normalizedSocialLink{Platform: platform, URL: canonical})
	}
	b, err := json.Marshal(out)
	if err != nil {
		return nil, err
	}
	return b, nil
}
