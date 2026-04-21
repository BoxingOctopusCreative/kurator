package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
)

// ExportWishlistEntriesCSV returns UTF-8 CSV bytes with header id,title,category,metadata (wishlist owner only).
func (s *WishlistService) ExportWishlistEntriesCSV(ctx context.Context, wishlistID string, userID int64) ([]byte, error) {
	if _, err := s.wishlist.GetByIDForUser(ctx, wishlistID, userID); err != nil {
		return nil, err
	}
	entries, err := s.wishlist.ListEntriesForOwnerExport(ctx, wishlistID, userID)
	if err != nil {
		return nil, err
	}
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write([]string{"id", "title", "category", "metadata"}); err != nil {
		return nil, err
	}
	for _, e := range entries {
		meta := strings.TrimSpace(string(e.Metadata))
		if meta == "" {
			meta = "{}"
		}
		if err := w.Write([]string{
			e.ID,
			e.Title,
			string(e.Category),
			meta,
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

// ImportWishlistEntriesFromCSV parses CSV (header required). Rows with id update that entry on this list; rows without id create entries.
// Extra columns (e.g. rating, consumption_status from a collection export) are ignored.
func (s *WishlistService) ImportWishlistEntriesFromCSV(ctx context.Context, wishlistID string, userID int64, r io.Reader) (*ImportItemsResult, error) {
	if _, err := s.wishlist.GetByIDForUser(ctx, wishlistID, userID); err != nil {
		return nil, err
	}

	cr := csv.NewReader(r)
	cr.ReuseRecord = false
	cr.LazyQuotes = true
	cr.FieldsPerRecord = -1

	header, err := cr.Read()
	if err != nil {
		if errors.Is(err, io.EOF) {
			return nil, fmt.Errorf("empty csv")
		}
		return nil, fmt.Errorf("read header: %w", err)
	}
	col := map[string]int{}
	for i, name := range header {
		key := strings.ToLower(strings.TrimSpace(name))
		if i == 0 {
			key = strings.TrimPrefix(key, "\ufeff")
		}
		col[key] = i
	}
	titleIx, ok1 := col["title"]
	catIx, ok2 := col["category"]
	if !ok1 || !ok2 {
		return nil, fmt.Errorf("csv must include title and category columns")
	}
	idIx, hasID := col["id"]
	metaIx, hasMeta := col["metadata"]

	out := &ImportItemsResult{Errors: make([]ImportItemRowErr, 0)}
	rowNum := 1
	dataRows := 0

	for {
		rec, err := cr.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("row %d: %w", rowNum+1, err)
		}
		rowNum++
		dataRows++
		if dataRows > csvMaxImportRows {
			out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: "import row limit reached"})
			break
		}

		if len(rec) <= titleIx || len(rec) <= catIx {
			out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: "row too short"})
			continue
		}
		title := strings.TrimSpace(rec[titleIx])
		catStr := strings.TrimSpace(strings.ToLower(rec[catIx]))
		category := models.Category(catStr)
		if !category.Valid() {
			out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: "invalid category"})
			continue
		}

		var metaBytes []byte
		if hasMeta && metaIx < len(rec) {
			raw := strings.TrimSpace(rec[metaIx])
			if raw == "" {
				metaBytes = []byte("{}")
			} else {
				metaBytes = []byte(raw)
			}
		} else {
			metaBytes = []byte("{}")
		}

		title2, err := validation.ItemTitle(title)
		if err != nil {
			out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: err.Error()})
			continue
		}
		meta2, err := validation.SanitizeItemMetadata(category, metaBytes)
		if err != nil {
			out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: err.Error()})
			continue
		}

		if hasID && idIx < len(rec) {
			idStr := strings.TrimSpace(rec[idIx])
			if idStr != "" {
				entryUUID, perr := uuid.Parse(strings.TrimSpace(idStr))
				if perr != nil {
					out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: "invalid id"})
					continue
				}
				entryID := entryUUID.String()
				if _, gerr := s.wishlist.GetEntryByIDForWishlistOwner(ctx, entryID, wishlistID, userID); gerr != nil {
					if errors.Is(gerr, repository.ErrWishlistEntryNotFound) {
						out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: "entry not found on this wishlist"})
					} else {
						out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: "lookup failed"})
					}
					continue
				}
				_, uerr := s.wishlist.UpdateEntry(ctx, wishlistID, entryID, userID, title2, category, meta2)
				if uerr != nil {
					out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: uerr.Error()})
					continue
				}
				out.Updated++
				continue
			}
		}

		_, cerr := s.wishlist.CreateEntry(ctx, wishlistID, userID, title2, category, meta2)
		if cerr != nil {
			out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: cerr.Error()})
			continue
		}
		out.Created++
	}

	if len(out.Errors) == 0 {
		out.Errors = nil
	}
	return out, nil
}
