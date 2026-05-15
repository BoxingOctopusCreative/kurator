package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"strconv"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/repository"
)

// ExportListItemsCSV returns UTF-8 CSV bytes with header id,title,category,metadata,rating,consumption_status (list owner only).
func (s *ListService) ExportListItemsCSV(ctx context.Context, listID string, userID int64) ([]byte, error) {
	l, err := s.list.GetByIDForViewer(ctx, listID, userID)
	if err != nil {
		return nil, err
	}
	if l.UserID != userID {
		return nil, repository.ErrListNotFound
	}
	items, err := s.list.ListItemsForViewer(ctx, listID, userID)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write([]string{"id", "title", "category", "metadata", "rating", "consumption_status"}); err != nil {
		return nil, err
	}
	for _, it := range items {
		meta := strings.TrimSpace(string(it.Metadata))
		if meta == "" {
			meta = "{}"
		}
		rating := ""
		if it.Rating != nil {
			rating = strconv.Itoa(*it.Rating)
		}
		consumption := ""
		if it.ConsumptionStatus != "" {
			consumption = string(it.ConsumptionStatus)
		}
		if err := w.Write([]string{
			it.ID,
			it.Title,
			string(it.Category),
			meta,
			rating,
			consumption,
		}); err != nil {
			return nil, err
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
