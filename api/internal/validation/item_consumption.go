package validation

import (
	"fmt"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
)

// ItemListConsumptionFilter normalizes the items list query filter. Empty return means no filter.
func ItemListConsumptionFilter(raw string) (string, error) {
	s := strings.TrimSpace(strings.ToLower(raw))
	if s == "" || s == "all" {
		return "", nil
	}
	if s == "pending" || s == "done" {
		return s, nil
	}
	return "", fmt.Errorf("consumption_status must be pending, done, or all")
}

// OptionalConsumptionStatus validates an optional create/update value.
func OptionalConsumptionStatus(p *models.ConsumptionStatus) (*models.ConsumptionStatus, error) {
	if p == nil {
		return nil, nil
	}
	if !(*p).Valid() {
		return nil, fmt.Errorf("consumption_status must be pending or done")
	}
	return p, nil
}
