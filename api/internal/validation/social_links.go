package validation

import (
	"encoding/json"
	"strings"
)

type socialLinkIn struct {
	Label string `json:"label"`
	URL   string `json:"url"`
}

// SocialLinksJSON validates and normalizes a JSON array of {label, url} (max 12 links, http(s) URLs only).
func SocialLinksJSON(raw []byte) ([]byte, error) {
	if len(raw) == 0 {
		return []byte("[]"), nil
	}
	var items []socialLinkIn
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, Invalidf("social_links must be a JSON array")
	}
	if len(items) > 12 {
		return nil, Invalidf("at most 12 social links")
	}
	out := make([]socialLinkIn, 0, len(items))
	for _, it := range items {
		label := strings.TrimSpace(it.Label)
		url := strings.TrimSpace(it.URL)
		if url == "" {
			continue
		}
		u, err := HTTPOrHTTPSURL(url, "Link URL")
		if err != nil {
			return nil, err
		}
		l, err := StrictPlainText(label, 64, "Label", true)
		if err != nil {
			return nil, err
		}
		out = append(out, socialLinkIn{Label: l, URL: u})
	}
	b, err := json.Marshal(out)
	if err != nil {
		return nil, err
	}
	return b, nil
}
