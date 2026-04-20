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
	"github": {}, "gitlab": {}, "linkedin": {}, "instagram": {}, "facebook": {},
	"youtube": {}, "twitch": {}, "discord": {}, "reddit": {}, "medium": {},
	"spotify": {}, "soundcloud": {}, "tiktok": {}, "pinterest": {}, "dribbble": {},
	"figma": {}, "mastodon": {}, "threads": {}, "bsky.app": {}, "linktree": {},
	"patreon": {}, "vimeo": {}, "dev.to": {}, "stackoverflow": {}, "slack": {},
	"substack": {}, "x": {}, "custom": {},
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
	case strings.Contains(host, "gitlab"):
		return "gitlab"
	case strings.Contains(host, "linkedin.com"):
		return "linkedin"
	case host == "x.com" || host == "twitter.com":
		return "x"
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
	case strings.Contains(host, "medium.com"):
		return "medium"
	case strings.Contains(host, "spotify.com"):
		return "spotify"
	case strings.Contains(host, "soundcloud.com"):
		return "soundcloud"
	case strings.Contains(host, "tiktok.com"):
		return "tiktok"
	case strings.Contains(host, "pinterest.com"):
		return "pinterest"
	case strings.Contains(host, "dribbble.com"):
		return "dribbble"
	case strings.Contains(host, "figma.com"):
		return "figma"
	case host == "threads.net":
		return "threads"
	case strings.Contains(host, "bsky.app"):
		return "bsky.app"
	case strings.Contains(host, "linktr.ee") || strings.Contains(host, "linktree.com"):
		return "linktree"
	case strings.Contains(host, "patreon.com"):
		return "patreon"
	case strings.Contains(host, "vimeo.com"):
		return "vimeo"
	case host == "dev.to":
		return "dev.to"
	case strings.Contains(host, "stackoverflow.com") || strings.Contains(host, "stackexchange.com"):
		return "stackoverflow"
	case strings.Contains(host, "slack.com"):
		return "slack"
	case strings.Contains(host, "substack.com"):
		return "substack"
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
	case "gitlab":
		return strings.Contains(host, "gitlab")
	case "linkedin":
		return strings.Contains(host, "linkedin.com")
	case "x":
		return host == "x.com" || host == "twitter.com"
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
	case "medium":
		return strings.Contains(host, "medium.com")
	case "spotify":
		return strings.Contains(host, "spotify.com")
	case "soundcloud":
		return strings.Contains(host, "soundcloud.com")
	case "tiktok":
		return strings.Contains(host, "tiktok.com")
	case "pinterest":
		return strings.Contains(host, "pinterest.com")
	case "dribbble":
		return strings.Contains(host, "dribbble.com")
	case "figma":
		return strings.Contains(host, "figma.com")
	case "threads":
		return host == "threads.net"
	case "bsky.app":
		return strings.Contains(host, "bsky.app")
	case "linktree":
		return strings.Contains(host, "linktr.ee") || strings.Contains(host, "linktree.com")
	case "patreon":
		return strings.Contains(host, "patreon.com")
	case "vimeo":
		return strings.Contains(host, "vimeo.com")
	case "dev.to":
		return host == "dev.to"
	case "stackoverflow":
		return strings.Contains(host, "stackoverflow.com") || strings.Contains(host, "stackexchange.com")
	case "slack":
		return strings.Contains(host, "slack.com")
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
