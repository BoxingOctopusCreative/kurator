package models

// ExploreSearchHit is one row in unified explore search (shelves, boards, people, comments).
type ExploreSearchHit struct {
	Kind     string  `json:"kind"`
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	Subtitle *string `json:"subtitle,omitempty"`
	URL      string  `json:"url"`
}

// ExploreSearchResponse groups hits for GET /explore/search.
type ExploreSearchResponse struct {
	Query string             `json:"query"`
	Hits  []ExploreSearchHit `json:"hits"`
}
