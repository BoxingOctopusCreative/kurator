package service

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
)

const csvMaxImportRows = 20000

// ImportItemsResult is returned from CSV import (partial success allowed).
type ImportItemsResult struct {
	Created int                `json:"created"`
	Updated int                `json:"updated"`
	Errors  []ImportItemRowErr `json:"errors,omitempty"`
}

// ImportItemRowErr records a row that could not be imported (1-based data row; header is not counted).
type ImportItemRowErr struct {
	Row   int    `json:"row"`
	Error string `json:"error"`
}

// ExportCollectionItemsCSV returns UTF-8 CSV bytes with header id,title,category,metadata,rating,consumption_status.
func (s *ItemService) ExportCollectionItemsCSV(ctx context.Context, collectionID string) ([]byte, error) {
	items, err := s.repo.ListByCollectionExport(ctx, collectionID, 50000)
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

// ImportCollectionItemsFromCSV parses CSV (header required) and creates or updates items in the collection.
// Rows with an id update an existing item in this collection; rows without id create new items.
func (s *ItemService) ImportCollectionItemsFromCSV(ctx context.Context, collectionID string, viewer *int64, r io.Reader) (*ImportItemsResult, error) {
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
		// Strip UTF-8 BOM from first column name if present
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
	ratingIx, hasRatingCol := col["rating"]
	consumptionIx, hasConsumptionCol := col["consumption_status"]

	out := &ImportItemsResult{Errors: make([]ImportItemRowErr, 0)}
	rowNum := 1 // header
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

		var parseRating *int
		if hasRatingCol && ratingIx < len(rec) {
			rStr := strings.TrimSpace(rec[ratingIx])
			if rStr != "" {
				n, perr := strconv.Atoi(rStr)
				if perr != nil || n < 1 || n > 5 {
					out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: "invalid rating"})
					continue
				}
				parseRating = &n
			}
		}

		var parseConsumption *models.ConsumptionStatus
		if hasConsumptionCol && consumptionIx < len(rec) {
			cs := strings.TrimSpace(strings.ToLower(rec[consumptionIx]))
			if cs != "" {
				st := models.ConsumptionStatus(cs)
				if !st.Valid() {
					out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: "invalid consumption_status"})
					continue
				}
				parseConsumption = &st
			}
		}

		if hasID && idIx < len(rec) {
			idStr := strings.TrimSpace(rec[idIx])
			if idStr != "" {
				itemUUID, perr := uuid.Parse(strings.TrimSpace(idStr))
				if perr != nil {
					out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: "invalid id"})
					continue
				}
				itemID := itemUUID.String()
				existing, gerr := s.repo.GetByID(ctx, itemID, viewer)
				if gerr != nil {
					if errors.Is(gerr, repository.ErrItemNotFound) {
						out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: "item not found"})
					} else {
						out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: "lookup failed"})
					}
					continue
				}
				if existing.CollectionID == nil || *existing.CollectionID != collectionID {
					if existing.CollectionID == nil {
						out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: "item is not on a shelf"})
					} else {
						out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: "item belongs to another collection"})
					}
					continue
				}
				var ru *models.RatingUpdate
				if hasRatingCol && ratingIx < len(rec) {
					if parseRating == nil {
						ru = &models.RatingUpdate{SetNull: true}
					} else {
						ru = &models.RatingUpdate{SetNull: false, Stars: *parseRating}
					}
				}
				_, uerr := s.Update(ctx, itemID, UpdateItemInput{
					Title:       title2,
					Category:    category,
					Metadata:    meta2,
					Rating:      ru,
					Consumption: parseConsumption,
				})
				if uerr != nil {
					out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: uerr.Error()})
					continue
				}
				out.Updated++
				continue
			}
		}

		_, cerr := s.Create(ctx, CreateItemInput{
			Loose:        false,
			CollectionID: collectionID,
			Title:        title2,
			Category:     category,
			Metadata:     meta2,
			Rating:       parseRating,
			Consumption:  parseConsumption,
		})
		if cerr != nil {
			out.Errors = append(out.Errors, ImportItemRowErr{Row: rowNum, Error: cerr.Error()})
			continue
		}
		out.Created++
	}

	// Ensure JSON-friendly empty slice
	if len(out.Errors) == 0 {
		out.Errors = nil
	}
	return out, nil
}
