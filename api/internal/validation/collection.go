package validation

import (
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
)

// Visibility validates a tri-state visibility input ("private", "followers", "friends").
// Empty input is accepted and returned as the empty value so callers can apply a default.
func Visibility(s string) (models.Visibility, error) {
	v, ok := models.ParseVisibility(s)
	if !ok {
		return "", Invalidf("visibility must be one of: private, followers, friends")
	}
	return v, nil
}

// CollectionSort validates the sort query parameter for listing collections.
func CollectionSort(s string) (string, error) {
	t := strings.TrimSpace(s)
	if t == "" {
		return "name_asc", nil
	}
	switch t {
	case "name_asc", "name_desc", "updated_desc", "created_desc", "items_desc":
		return t, nil
	default:
		return "", Invalidf("invalid sort")
	}
}

// CollectionHasDesc validates the has_description filter ("", "yes", "no").
func CollectionHasDesc(s string) (string, error) {
	t := strings.TrimSpace(strings.ToLower(s))
	switch t {
	case "", "yes", "no":
		return t, nil
	default:
		return "", Invalidf("invalid has_description")
	}
}

// CollectionListScope validates scope query: "" (all) or "following".
func CollectionListScope(s string) (string, error) {
	t := strings.TrimSpace(strings.ToLower(s))
	switch t {
	case "", "all":
		return "", nil
	case "following":
		return "following", nil
	default:
		return "", Invalidf("invalid scope")
	}
}
