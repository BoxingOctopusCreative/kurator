package service

import (
	"context"
	"encoding/json"
	"log"

	"github.com/boxingoctopus/kurator/api/internal/models"
)

// boardReplyNotificationRecipients returns user IDs to notify for a new reply.
// Top-level thread replies notify the thread author, board owner, and prior participants.
// Nested replies notify only the parent reply author.
func boardReplyNotificationRecipients(
	topLevel bool,
	actorID, threadAuthorID, boardOwnerID, parentAuthorID int64,
	participantIDs []int64,
) []int64 {
	seen := make(map[int64]struct{})
	add := func(id int64) {
		if id < 1 || id == actorID {
			return
		}
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
	}
	if topLevel {
		add(threadAuthorID)
		add(boardOwnerID)
		for _, id := range participantIDs {
			add(id)
		}
	} else {
		add(parentAuthorID)
	}
	out := make([]int64, 0, len(seen))
	for id := range seen {
		out = append(out, id)
	}
	return out
}

func (s *BoardService) notifyBoardReply(
	ctx context.Context,
	actorID int64,
	boardID, threadID, replyID string,
	parentReplyID *string,
) {
	if s.notif == nil {
		return
	}
	ownerID, slug, boardName, threadTitle, threadAuthorID, err := s.boards.LoadThreadNotificationMeta(ctx, boardID, threadID)
	if err != nil {
		log.Printf("board reply notify: load meta: %v", err)
		return
	}

	topLevel := parentReplyID == nil || *parentReplyID == ""
	kind := models.NotificationKindBoardReplyReply
	if topLevel {
		kind = models.NotificationKindBoardThreadReply
	}

	var parentAuthorID int64
	participantIDs := []int64(nil)
	if topLevel {
		participantIDs, err = s.boards.ListThreadParticipantUserIDs(ctx, threadID)
		if err != nil {
			log.Printf("board reply notify: participants: %v", err)
			return
		}
	} else {
		parentAuthorID, err = s.boards.GetReplyUserID(ctx, threadID, *parentReplyID)
		if err != nil {
			log.Printf("board reply notify: parent author: %v", err)
			return
		}
	}

	recipients := boardReplyNotificationRecipients(
		topLevel,
		actorID,
		threadAuthorID,
		ownerID,
		parentAuthorID,
		participantIDs,
	)
	if len(recipients) == 0 {
		return
	}

	payload, err := json.Marshal(map[string]any{
		"board_id":     boardID,
		"board_slug":   slug,
		"board_name":   boardName,
		"thread_id":    threadID,
		"thread_title": threadTitle,
		"reply_id":     replyID,
	})
	if err != nil {
		log.Printf("board reply notify: marshal: %v", err)
		return
	}
	for _, recipientID := range recipients {
		if err := s.notif.InsertOne(ctx, recipientID, actorID, kind, payload); err != nil {
			log.Printf("board reply notify: insert: %v", err)
		}
	}
}
