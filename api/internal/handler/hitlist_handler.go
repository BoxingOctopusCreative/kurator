package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"strconv"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/httpx"
	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type HitlistHandler struct {
	hit    *service.HitlistService
	auth   *service.AuthService
	fanout *service.ActivityFanout
	share  *service.ShelfShareService
}

func NewHitlistHandler(hit *service.HitlistService, auth *service.AuthService, fanout *service.ActivityFanout, share *service.ShelfShareService) *HitlistHandler {
	return &HitlistHandler{hit: hit, auth: auth, fanout: fanout, share: share}
}

func viewerPtr(c *fiber.Ctx) *int64 {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return nil
	}
	return &uid
}

type hitlistDetailResponse struct {
	models.List
	MayEditEntries bool `json:"may_edit_entries"`
}

type hitlistVoteStatsResponse struct {
	VoteCount      int64 `json:"vote_count"`
	ViewerHasVoted bool  `json:"viewer_has_voted"`
}

func (h *HitlistHandler) detail(ctx context.Context, l *models.List, viewer *int64) (*hitlistDetailResponse, error) {
	vc, vv, err := h.hit.VoteStats(ctx, l.ID, viewer)
	if err != nil {
		return nil, err
	}
	l2 := *l
	l2.VoteCount = vc
	l2.ViewerHasVoted = vv
	resp := &hitlistDetailResponse{List: l2}
	if viewer != nil {
		ok, err := h.hit.UserMayMutateListContent(ctx, l.ID, *viewer)
		if err == nil {
			resp.MayEditEntries = ok
		}
	}
	return resp, nil
}

type suggestSlugBody struct {
	Stem          string `json:"stem"`
	ExcludeListID string `json:"exclude_list_id"`
	Alternate     bool   `json:"alternate"`
}

func (h *HitlistHandler) SuggestSlug(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	var body suggestSlugBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	out, err := h.hit.SuggestSlug(c.Context(), body.Stem, body.ExcludeListID, body.Alternate)
	if err != nil {
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.JSON(out)
}

type createHitlistBody struct {
	Name            string  `json:"name"`
	Description     string  `json:"description"`
	Visibility      *string `json:"visibility"`
	IsPublic        *bool   `json:"is_public"`
	IsShared        bool    `json:"is_shared"`
	InviteUserIDs   []int64 `json:"invite_user_ids"`
	Slug            *string `json:"slug"`
	CommentsEnabled *bool   `json:"comments_enabled"`
	EntriesNumbered *bool   `json:"entries_numbered"`
}

func (h *HitlistHandler) Create(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	var body createHitlistBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	vis, verr := resolveVisibility(body.Visibility, body.IsPublic)
	if verr != nil {
		return verr
	}
	if len(body.InviteUserIDs) > 0 && !body.IsShared {
		return fiber.NewError(fiber.StatusBadRequest, "invite_user_ids requires is_shared")
	}
	l, err := h.hit.CreateHitlist(c.Context(), uid, body.Name, body.Description, vis, body.IsShared, body.Slug, body.CommentsEnabled, body.EntriesNumbered)
	if err != nil {
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	if h.share != nil && body.IsShared && len(body.InviteUserIDs) > 0 {
		if err := h.share.InviteToShelf(c.Context(), uid, repository.ShelfKindList, l.ID, body.InviteUserIDs); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
	}
	if h.fanout != nil {
		h.fanout.NotifyListCreated(c.Context(), uid, l.Visibility, l.ID, l.Name, l.Slug)
	}
	d, err := h.detail(c.Context(), l, &uid)
	if err != nil {
		return httpx.ServiceError(fiber.StatusInternalServerError, err)
	}
	return c.Status(fiber.StatusCreated).JSON(d)
}

func (h *HitlistHandler) Get(c *fiber.Ctx) error {
	v := viewerPtr(c)
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	l, err := h.hit.GetVisible(c.Context(), id, v)
	if errors.Is(err, repository.ErrListNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	d, err := h.detail(c.Context(), l, v)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	h.hit.IncrementListView(c.Context(), l.ID)
	return c.JSON(d)
}

func (h *HitlistHandler) GetBySlug(c *fiber.Ctx) error {
	v := viewerPtr(c)
	slug := c.Params("slug")
	l, err := h.hit.GetBySlugVisible(c.Context(), slug, v)
	if errors.Is(err, repository.ErrListNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	d, err := h.detail(c.Context(), l, v)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	h.hit.IncrementListView(c.Context(), l.ID)
	return c.JSON(d)
}

type updateHitlistBody struct {
	Name            string  `json:"name"`
	Description     string  `json:"description"`
	Visibility      *string `json:"visibility"`
	IsPublic        *bool   `json:"is_public"`
	CoverArtURL     *string `json:"cover_art_url"`
	IsShared        *bool   `json:"is_shared"`
	InviteUserIDs   []int64 `json:"invite_user_ids"`
	Slug            *string `json:"slug"`
	CommentsEnabled *bool   `json:"comments_enabled"`
	EntriesNumbered *bool   `json:"entries_numbered"`
}

func (h *HitlistHandler) Update(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	raw := c.Body()
	var hasSlugKey, hasCommentsKey, hasEntriesNumberedKey bool
	var body updateHitlistBody
	if len(bytes.TrimSpace(raw)) > 0 {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(raw, &m); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid json")
		}
		_, hasSlugKey = m["slug"]
		_, hasCommentsKey = m["comments_enabled"]
		_, hasEntriesNumberedKey = m["entries_numbered"]
		if err := json.Unmarshal(raw, &body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid json")
		}
	}
	vis, verr := resolveVisibility(body.Visibility, body.IsPublic)
	if verr != nil {
		return verr
	}
	if len(body.InviteUserIDs) > 0 && body.IsShared != nil && !*body.IsShared {
		return fiber.NewError(fiber.StatusBadRequest, "invite_user_ids requires is_shared")
	}
	l, err := h.hit.UpdateHitlist(c.Context(), uid, id, body.Name, body.Description, vis, body.CoverArtURL, body.IsShared, body.Slug, hasSlugKey, body.CommentsEnabled, hasCommentsKey, body.EntriesNumbered, hasEntriesNumberedKey)
	if errors.Is(err, repository.ErrListNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	if len(body.InviteUserIDs) > 0 {
		if !l.IsShared {
			return fiber.NewError(fiber.StatusBadRequest, "invite_user_ids requires a shared list; set is_shared true")
		}
		if h.share != nil {
			if err := h.share.InviteToShelf(c.Context(), uid, repository.ShelfKindList, l.ID, body.InviteUserIDs); err != nil {
				return fiber.NewError(fiber.StatusBadRequest, err.Error())
			}
		}
	}
	d, err := h.detail(c.Context(), l, &uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(d)
}

// DeleteListBody matches v1 list delete payload.
type hitlistDeleteBody struct {
	MoveEntriesTo  *string `json:"move_entries_to"`
	DiscardEntries bool    `json:"discard_entries"`
}

func (h *HitlistHandler) Delete(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body hitlistDeleteBody
	raw := c.Body()
	if len(bytes.TrimSpace(raw)) > 0 {
		if err := json.Unmarshal(raw, &body); err != nil {
			return fiber.NewError(fiber.StatusBadRequest, "invalid json")
		}
	}
	err = h.hit.Delete(c.Context(), uid, id, body.MoveEntriesTo, body.DiscardEntries)
	var conflict *service.ListDeleteConflict
	if errors.As(err, &conflict) && conflict != nil {
		return c.Status(fiber.StatusConflict).JSON(fiber.Map{
			"error":                 "list_has_entries",
			"entry_count":           conflict.EntryCount,
			"eligible_move_targets": conflict.EligibleMoveTargets,
		})
	}
	if errors.Is(err, repository.ErrListNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *HitlistHandler) ListEntries(c *fiber.Ctx) error {
	v := viewerPtr(c)
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if _, err := h.hit.GetVisible(c.Context(), id, v); err != nil {
		if errors.Is(err, repository.ErrListNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	entries, err := h.hit.AssembleHitlistEntries(c.Context(), id, v)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(entries)
}

type addHitlistEntryBody struct {
	ItemID      *string         `json:"item_id"`
	Title       *string         `json:"title"`
	Category    *string         `json:"category"`
	Metadata    json.RawMessage `json:"metadata"`
	Description *string         `json:"description"`
}

type reorderHitlistEntriesBody struct {
	EntryIDs []string `json:"entry_ids"`
}

func (h *HitlistHandler) ReorderEntries(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	listID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body reorderHitlistEntriesBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.hit.ReorderHitlistEntries(c.Context(), uid, listID, body.EntryIDs); err != nil {
		if errors.Is(err, service.ErrHitlistReorderForbidden) {
			return fiber.NewError(fiber.StatusForbidden, err.Error())
		}
		if errors.Is(err, repository.ErrListReorderInvalid) {
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *HitlistHandler) AddEntry(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	listID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body addHitlistEntryBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if body.ItemID != nil && strings.TrimSpace(*body.ItemID) != "" {
		if err := h.hit.AddItem(c.Context(), uid, listID, *body.ItemID); err != nil {
			if errors.Is(err, repository.ErrListDuplicateEntry) {
				return fiber.NewError(fiber.StatusConflict, err.Error())
			}
			if errors.Is(err, repository.ErrItemNotFound) {
				return fiber.NewError(fiber.StatusNotFound, "item not found")
			}
			if errors.Is(err, service.ErrListAddForbidden) {
				return fiber.NewError(fiber.StatusForbidden, err.Error())
			}
			return fiber.NewError(fiber.StatusBadRequest, err.Error())
		}
		return c.SendStatus(fiber.StatusNoContent)
	}
	if body.Title == nil || body.Category == nil {
		return fiber.NewError(fiber.StatusBadRequest, "title and category required for stub entries")
	}
	cat := models.Category(*body.Category)
	if !cat.Valid() {
		return fiber.NewError(fiber.StatusBadRequest, "invalid category")
	}
	meta := body.Metadata
	if len(meta) == 0 {
		meta = json.RawMessage(`{}`)
	}
	if err := h.hit.AddHitlistStubEntry(c.Context(), uid, listID, *body.Title, cat, meta, body.Description); err != nil {
		if errors.Is(err, repository.ErrListNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *HitlistHandler) PatchEntry(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	listID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid list id")
	}
	entryID, err := httpx.PathUUID(c.Params("entryId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid entry id")
	}
	var body struct {
		Description string `json:"description"`
	}
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.hit.UpdateHitlistEntryDescription(c.Context(), uid, listID, entryID, body.Description); err != nil {
		if errors.Is(err, service.ErrHitlistReorderForbidden) {
			return fiber.NewError(fiber.StatusForbidden, err.Error())
		}
		if errors.Is(err, repository.ErrListEntryNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *HitlistHandler) RemoveEntry(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	listID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid list id")
	}
	entryID, err := httpx.PathUUID(c.Params("entryId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid entry id")
	}
	if err := h.hit.RemoveHitlistEntry(c.Context(), uid, listID, entryID); err != nil {
		if errors.Is(err, repository.ErrListEntryNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *HitlistHandler) Vote(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.hit.Vote(c.Context(), id, uid); err != nil {
		if errors.Is(err, repository.ErrListNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	vc, vv, err := h.hit.VoteStats(c.Context(), id, &uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(hitlistVoteStatsResponse{VoteCount: vc, ViewerHasVoted: vv})
}

func (h *HitlistHandler) Unvote(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.hit.Unvote(c.Context(), id, uid); err != nil {
		if errors.Is(err, repository.ErrListNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	vc, vv, err := h.hit.VoteStats(c.Context(), id, &uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(hitlistVoteStatsResponse{VoteCount: vc, ViewerHasVoted: vv})
}

func (h *HitlistHandler) ListComments(c *fiber.Ctx) error {
	v := viewerPtr(c)
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	limit := 50
	if q := c.Query("limit"); q != "" {
		n, err := strconv.Atoi(q)
		if err == nil {
			limit = n
		}
	}
	items, err := h.hit.ListComments(c.Context(), id, v, limit)
	if err != nil {
		if errors.Is(err, repository.ErrListNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(items)
}

type addCommentBody struct {
	Body string `json:"body"`
}

func (h *HitlistHandler) AddComment(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body addCommentBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	cm, err := h.hit.AddComment(c.Context(), id, uid, body.Body)
	if err != nil {
		if errors.Is(err, repository.ErrListNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.Status(fiber.StatusCreated).JSON(cm)
}

func (h *HitlistHandler) DeleteComment(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	listID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid list id")
	}
	commentID, err := httpx.PathUUID(c.Params("commentId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid comment id")
	}
	if err := h.hit.DeleteComment(c.Context(), listID, commentID, uid); err != nil {
		if errors.Is(err, repository.ErrHitlistCommentNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return fiber.NewError(fiber.StatusBadRequest, err.Error())
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *HitlistHandler) ListMine(c *fiber.Ctx) error {
	v := viewerPtr(c)
	if ou := c.Query("owner_user_id"); ou != "" {
		n, err := strconv.ParseInt(ou, 10, 64)
		if err != nil || n < 1 {
			return fiber.NewError(fiber.StatusBadRequest, "invalid owner_user_id")
		}
		items, err := h.hit.ListByOwnerForViewer(c.Context(), n, v)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		return c.JSON(items)
	}
	sort := strings.TrimSpace(strings.ToLower(c.Query("sort")))
	if sort == "" {
		sort = "recent"
	}
	items, err := h.hit.ListDiscover(c.Context(), v, sort)
	if err != nil {
		if errors.Is(err, repository.ErrInvalidHitlistDiscoverSort) {
			return fiber.NewError(fiber.StatusBadRequest, "invalid sort")
		}
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(items)
}
