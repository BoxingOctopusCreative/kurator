package handler

import (
	"errors"
	"strconv"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/httpx"
	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/service"
	"github.com/gofiber/fiber/v2"
)

type BoardHandler struct {
	boards *service.BoardService
}

func NewBoardHandler(boards *service.BoardService) *BoardHandler {
	return &BoardHandler{boards: boards}
}

type suggestBoardSlugBody struct {
	Stem          string `json:"stem"`
	ExcludeBoardID string `json:"exclude_board_id"`
	Alternate     bool   `json:"alternate"`
}

func (h *BoardHandler) SuggestSlug(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	var body suggestBoardSlugBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	out, err := h.boards.SuggestSlug(c.Context(), body.Stem, body.ExcludeBoardID, body.Alternate)
	if err != nil {
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.JSON(out)
}

type createBoardBody struct {
	Name          string  `json:"name"`
	Description   string  `json:"description"`
	Visibility    string  `json:"visibility"`
	Slug          string  `json:"slug"`
	InviteUserIDs []int64 `json:"invite_user_ids"`
}

func (h *BoardHandler) Create(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	var body createBoardBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if len(body.InviteUserIDs) > 0 && strings.ToLower(strings.TrimSpace(body.Visibility)) != "private" {
		return fiber.NewError(fiber.StatusBadRequest, "invite_user_ids requires private visibility")
	}
	b, err := h.boards.Create(c.Context(), uid, body.Name, body.Description, body.Visibility, body.Slug, body.InviteUserIDs)
	if err != nil {
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.Status(fiber.StatusCreated).JSON(b)
}

func (h *BoardHandler) ListFeed(c *fiber.Ctx) error {
	sort := strings.TrimSpace(c.Query("sort", "updated"))
	q := strings.TrimSpace(c.Query("q", ""))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	threads, err := h.boards.ListPublicFeed(c.Context(), sort, q, limit, viewerPtr(c))
	if errors.Is(err, repository.ErrInvalidBoardFeedSort) {
		return fiber.NewError(fiber.StatusBadRequest, "invalid sort")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(threads)
}

func (h *BoardHandler) List(c *fiber.Ctx) error {
	tab := repository.BoardListTab(strings.ToLower(strings.TrimSpace(c.Query("tab", "discover"))))
	uid, ok := c.Locals("userID").(int64)
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	if tab == repository.BoardListDiscover && (!ok || uid < 1) {
		boards, err := h.boards.ListDiscoverPublic(c.Context(), limit)
		if err != nil {
			return fiber.NewError(fiber.StatusInternalServerError, err.Error())
		}
		return c.JSON(boards)
	}
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	switch tab {
	case repository.BoardListMine, repository.BoardListMember, repository.BoardListDiscover:
	default:
		tab = repository.BoardListDiscover
	}
	boards, err := h.boards.List(c.Context(), tab, uid, limit)
	if err != nil {
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.JSON(boards)
}

func (h *BoardHandler) Get(c *fiber.Ctx) error {
	ref := strings.TrimSpace(c.Params("id"))
	if ref == "" {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	viewer := viewerPtr(c)
	var b *models.Board
	var err error
	if id, perr := httpx.PathUUID(ref); perr == nil {
		b, err = h.boards.Get(c.Context(), id, viewer)
	} else {
		b, err = h.boards.GetBySlug(c.Context(), ref, viewer)
	}
	if errors.Is(err, repository.ErrBoardNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(b)
}

func (h *BoardHandler) GetBySlug(c *fiber.Ctx) error {
	slug := strings.TrimSpace(c.Params("slug"))
	if slug == "" {
		return fiber.NewError(fiber.StatusBadRequest, "invalid slug")
	}
	b, err := h.boards.GetBySlug(c.Context(), slug, viewerPtr(c))
	if errors.Is(err, repository.ErrBoardNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(b)
}

type patchBoardBody struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	Visibility  *string `json:"visibility"`
	Slug        *string `json:"slug"`
	BannerURL   *string `json:"banner_url"`
	IconURL     *string `json:"icon_url"`
}

func (h *BoardHandler) Patch(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body patchBoardBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	b, err := h.boards.Update(c.Context(), uid, id, body.Name, body.Description, body.Visibility, body.Slug, body.BannerURL, body.IconURL)
	if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, service.ErrBoardNotOwner) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.JSON(b)
}

func (h *BoardHandler) Delete(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.boards.Delete(c.Context(), uid, id); err != nil {
		if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, service.ErrBoardNotOwner) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

type inviteBoardBody struct {
	InviteUserIDs []int64 `json:"invite_user_ids"`
}

func (h *BoardHandler) Invite(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	id, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body inviteBoardBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.boards.Invite(c.Context(), uid, id, body.InviteUserIDs); err != nil {
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *BoardHandler) ListMyInvites(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	invites, err := h.boards.ListMyInvites(c.Context(), uid)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(invites)
}

func (h *BoardHandler) AcceptInvite(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	rid, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || rid < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.boards.AcceptInvite(c.Context(), uid, rid); err != nil {
		return boardInviteError(err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

func (h *BoardHandler) DismissInvite(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	rid, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || rid < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	if err := h.boards.DismissInvite(c.Context(), uid, rid); err != nil {
		return boardInviteError(err)
	}
	return c.JSON(fiber.Map{"ok": true})
}

func boardInviteError(err error) error {
	if errors.Is(err, repository.ErrBoardInviteNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if errors.Is(err, repository.ErrBoardInviteNotPending) {
		return fiber.NewError(fiber.StatusConflict, "invite is not pending")
	}
	return httpx.ServiceError(fiber.StatusBadRequest, err)
}

func (h *BoardHandler) ListFlairs(c *fiber.Ctx) error {
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	flairs, err := h.boards.ListFlairs(c.Context(), boardID, viewerPtr(c))
	if errors.Is(err, repository.ErrBoardNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(flairs)
}

type createBoardFlairBody struct {
	Label string `json:"label"`
}

func (h *BoardHandler) CreateFlair(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body createBoardFlairBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	f, err := h.boards.CreateFlair(c.Context(), uid, boardID, body.Label)
	if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, service.ErrBoardNotOwner) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.Status(fiber.StatusCreated).JSON(f)
}

func (h *BoardHandler) DeleteFlair(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	flairID, err := httpx.PathUUID(c.Params("flairId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid flair id")
	}
	if err := h.boards.DeleteFlair(c.Context(), uid, boardID, flairID); err != nil {
		if errors.Is(err, repository.ErrBoardFlairNotFound) || errors.Is(err, service.ErrBoardNotOwner) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *BoardHandler) ListThreads(c *fiber.Ctx) error {
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	threads, err := h.boards.ListThreads(c.Context(), boardID, viewerPtr(c), limit)
	if errors.Is(err, repository.ErrBoardNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(threads)
}

func (h *BoardHandler) GetThread(c *fiber.Ctx) error {
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	threadID, err := httpx.PathUUID(c.Params("threadId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid thread id")
	}
	t, err := h.boards.GetThread(c.Context(), boardID, threadID, viewerPtr(c))
	if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, repository.ErrBoardThreadNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(t)
}

type createBoardThreadBody struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

func (h *BoardHandler) CreateThread(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body createBoardThreadBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	t, err := h.boards.CreateThread(c.Context(), boardID, uid, body.Title, body.Body)
	if errors.Is(err, repository.ErrBoardNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if errors.Is(err, service.ErrBoardCannotPost) {
		return fiber.NewError(fiber.StatusForbidden, err.Error())
	}
	if err != nil {
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.Status(fiber.StatusCreated).JSON(t)
}

type patchBoardThreadBody struct {
	Title   *string `json:"title"`
	Body    *string `json:"body"`
	FlairID *string `json:"flair_id"`
	Locked  *bool   `json:"locked"`
}

func (h *BoardHandler) PatchThread(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	threadID, err := httpx.PathUUID(c.Params("threadId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid thread id")
	}
	var body patchBoardThreadBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if body.Locked != nil {
		t, err := h.boards.SetThreadLocked(c.Context(), uid, boardID, threadID, *body.Locked)
		if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, repository.ErrBoardThreadNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		if errors.Is(err, service.ErrBoardCannotLock) {
			return fiber.NewError(fiber.StatusForbidden, err.Error())
		}
		if err != nil {
			return httpx.ServiceError(fiber.StatusBadRequest, err)
		}
		return c.JSON(t)
	}
	if body.Title != nil || body.Body != nil {
		t, err := h.boards.UpdateThreadContent(c.Context(), uid, boardID, threadID, body.Title, body.Body)
		if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, repository.ErrBoardThreadNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		if errors.Is(err, service.ErrBoardNotAuthor) {
			return fiber.NewError(fiber.StatusForbidden, err.Error())
		}
		if err != nil {
			return httpx.ServiceError(fiber.StatusBadRequest, err)
		}
		return c.JSON(t)
	}
	t, err := h.boards.SetThreadFlair(c.Context(), uid, boardID, threadID, body.FlairID)
	if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, repository.ErrBoardThreadNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if errors.Is(err, service.ErrBoardFlairNotAllowed) {
		return fiber.NewError(fiber.StatusForbidden, err.Error())
	}
	if err != nil {
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.JSON(t)
}

func (h *BoardHandler) DeleteThread(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	threadID, err := httpx.PathUUID(c.Params("threadId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid thread id")
	}
	if err := h.boards.DeleteThread(c.Context(), boardID, threadID, uid); err != nil {
		if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, repository.ErrBoardThreadNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *BoardHandler) ListReplies(c *fiber.Ctx) error {
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	threadID, err := httpx.PathUUID(c.Params("threadId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid thread id")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "200"))
	replies, err := h.boards.ListReplies(c.Context(), boardID, threadID, viewerPtr(c), limit)
	if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, repository.ErrBoardThreadNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(replies)
}

type createBoardReplyBody struct {
	Body           string  `json:"body"`
	ParentReplyID  *string `json:"parent_reply_id"`
}

func (h *BoardHandler) CreateReply(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	threadID, err := httpx.PathUUID(c.Params("threadId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid thread id")
	}
	var body createBoardReplyBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	rep, err := h.boards.CreateReply(c.Context(), boardID, threadID, uid, body.Body, body.ParentReplyID)
	if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, repository.ErrBoardThreadNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if errors.Is(err, service.ErrBoardThreadLocked) {
		return fiber.NewError(fiber.StatusForbidden, err.Error())
	}
	if errors.Is(err, service.ErrBoardCannotPost) {
		return fiber.NewError(fiber.StatusForbidden, err.Error())
	}
	if err != nil {
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.Status(fiber.StatusCreated).JSON(rep)
}

func (h *BoardHandler) DeleteReply(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	threadID, err := httpx.PathUUID(c.Params("threadId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid thread id")
	}
	replyID, err := httpx.PathUUID(c.Params("replyId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid reply id")
	}
	if err := h.boards.DeleteReply(c.Context(), boardID, threadID, replyID, uid); err != nil {
		if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, repository.ErrBoardReplyNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

type patchBoardReplyBody struct {
	Body string `json:"body"`
}

func (h *BoardHandler) PatchReply(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	threadID, err := httpx.PathUUID(c.Params("threadId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid thread id")
	}
	replyID, err := httpx.PathUUID(c.Params("replyId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid reply id")
	}
	var body patchBoardReplyBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	rep, err := h.boards.UpdateReplyBody(c.Context(), uid, boardID, threadID, replyID, body.Body)
	if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, repository.ErrBoardThreadNotFound) || errors.Is(err, repository.ErrBoardReplyNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if errors.Is(err, service.ErrBoardNotAuthor) {
		return fiber.NewError(fiber.StatusForbidden, err.Error())
	}
	if err != nil {
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.JSON(rep)
}

func (h *BoardHandler) ListThreadEdits(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	threadID, err := httpx.PathUUID(c.Params("threadId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid thread id")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	edits, err := h.boards.ListThreadEdits(c.Context(), uid, boardID, threadID, limit)
	if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, repository.ErrBoardThreadNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if errors.Is(err, service.ErrBoardCannotViewHistory) {
		return fiber.NewError(fiber.StatusForbidden, err.Error())
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(edits)
}

func (h *BoardHandler) ListReplyEdits(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	threadID, err := httpx.PathUUID(c.Params("threadId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid thread id")
	}
	replyID, err := httpx.PathUUID(c.Params("replyId"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid reply id")
	}
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	edits, err := h.boards.ListReplyEdits(c.Context(), uid, boardID, threadID, replyID, limit)
	if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, repository.ErrBoardThreadNotFound) || errors.Is(err, repository.ErrBoardReplyNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if errors.Is(err, service.ErrBoardCannotViewHistory) {
		return fiber.NewError(fiber.StatusForbidden, err.Error())
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(edits)
}

func (h *BoardHandler) ListModerators(c *fiber.Ctx) error {
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	mods, err := h.boards.ListModerators(c.Context(), boardID, viewerPtr(c))
	if errors.Is(err, repository.ErrBoardNotFound) {
		return fiber.NewError(fiber.StatusNotFound, "not found")
	}
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, err.Error())
	}
	return c.JSON(mods)
}

type boardModeratorsBody struct {
	UserIDs []int64 `json:"user_ids"`
}

func (h *BoardHandler) AddModerators(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	var body boardModeratorsBody
	if err := c.BodyParser(&body); err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid json")
	}
	if err := h.boards.AddModerators(c.Context(), uid, boardID, body.UserIDs); err != nil {
		if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, service.ErrBoardNotOwner) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *BoardHandler) RemoveModerator(c *fiber.Ctx) error {
	uid, ok := c.Locals("userID").(int64)
	if !ok || uid < 1 {
		return fiber.NewError(fiber.StatusUnauthorized, "unauthorized")
	}
	boardID, err := httpx.PathUUID(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	moderatorID, err := strconv.ParseInt(c.Params("userId"), 10, 64)
	if err != nil || moderatorID < 1 {
		return fiber.NewError(fiber.StatusBadRequest, "invalid user id")
	}
	if err := h.boards.RemoveModerator(c.Context(), uid, boardID, moderatorID); err != nil {
		if errors.Is(err, repository.ErrBoardNotFound) || errors.Is(err, service.ErrBoardNotOwner) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		if errors.Is(err, repository.ErrBoardModeratorNotFound) {
			return fiber.NewError(fiber.StatusNotFound, "not found")
		}
		return httpx.ServiceError(fiber.StatusBadRequest, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}
