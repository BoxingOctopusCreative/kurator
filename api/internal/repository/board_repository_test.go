package repository

import (
	"testing"

	"github.com/boxingoctopus/kurator/api/internal/models"
)

func TestApplyThreadViewerPerms(t *testing.T) {
	t.Parallel()
	ownerID := int64(1)
	authorID := int64(2)
	modID := int64(3)
	otherID := int64(4)

	cases := []struct {
		name              string
		viewer            int64
		threadUser        int64
		viewerIsModerator bool
		wantFlair         bool
		wantDelete        bool
		wantEdit          bool
		wantLock          bool
		wantHistory       bool
	}{
		{"owner", ownerID, authorID, false, true, true, false, true, true},
		{"author", authorID, authorID, false, true, true, true, false, false},
		{"moderator", modID, authorID, true, false, true, false, true, true},
		{"other", otherID, authorID, false, false, false, false, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			thread := models.BoardThread{UserID: tc.threadUser}
			v := tc.viewer
			applyThreadViewerPerms(&thread, ownerID, &v, tc.viewerIsModerator)
			if thread.MaySetFlair != tc.wantFlair {
				t.Fatalf("MaySetFlair = %v, want %v", thread.MaySetFlair, tc.wantFlair)
			}
			if thread.MayDelete != tc.wantDelete {
				t.Fatalf("MayDelete = %v, want %v", thread.MayDelete, tc.wantDelete)
			}
			if thread.MayEdit != tc.wantEdit {
				t.Fatalf("MayEdit = %v, want %v", thread.MayEdit, tc.wantEdit)
			}
			if thread.MayLock != tc.wantLock {
				t.Fatalf("MayLock = %v, want %v", thread.MayLock, tc.wantLock)
			}
			if thread.MayViewHistory != tc.wantHistory {
				t.Fatalf("MayViewHistory = %v, want %v", thread.MayViewHistory, tc.wantHistory)
			}
		})
	}
}

func TestApplyReplyViewerPerms(t *testing.T) {
	t.Parallel()
	ownerID := int64(1)
	authorID := int64(2)
	modID := int64(3)
	otherID := int64(4)

	cases := []struct {
		name              string
		viewer            int64
		replyUser         int64
		viewerIsModerator bool
		wantDelete        bool
		wantEdit          bool
	}{
		{"owner", ownerID, authorID, false, true, false},
		{"author", authorID, authorID, false, true, true},
		{"moderator", modID, authorID, true, true, false},
		{"other", otherID, authorID, false, false, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			rep := models.BoardReply{UserID: tc.replyUser}
			v := tc.viewer
			applyReplyViewerPerms(&rep, ownerID, &v, tc.viewerIsModerator)
			if rep.MayDelete != tc.wantDelete {
				t.Fatalf("MayDelete = %v, want %v", rep.MayDelete, tc.wantDelete)
			}
			if rep.MayEdit != tc.wantEdit {
				t.Fatalf("MayEdit = %v, want %v", rep.MayEdit, tc.wantEdit)
			}
		})
	}
}

func TestBoardAuthorTags(t *testing.T) {
	t.Parallel()
	modIDs := map[int64]struct{}{3: {}, 5: {}}
	cases := []struct {
		name       string
		author     int64
		owner      int64
		threadAuth int64
		want       []string
	}{
		{"owner op", 1, 1, 1, []string{"OWNER", "OP"}},
		{"mod reply", 3, 1, 2, []string{"MOD"}},
		{"op only", 2, 1, 2, []string{"OP"}},
		{"mod op", 3, 1, 3, []string{"MOD", "OP"}},
		{"plain", 4, 1, 2, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := boardAuthorTags(tc.author, tc.owner, tc.threadAuth, modIDs)
			if len(got) != len(tc.want) {
				t.Fatalf("got %v want %v", got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("got %v want %v", got, tc.want)
				}
			}
		})
	}
}
