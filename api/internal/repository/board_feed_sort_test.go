package repository

import "testing"

func TestBoardFeedOrderBy(t *testing.T) {
	t.Parallel()
	cases := []struct {
		sort string
		want string
	}{
		{"", "t.updated_at DESC"},
		{"updated", "t.updated_at DESC"},
		{"newest", "t.created_at DESC"},
		{"oldest", "t.created_at ASC"},
		{"active", "(SELECT COUNT(*)::bigint FROM board_replies r WHERE r.thread_id = t.id) DESC, t.updated_at DESC"},
	}
	for _, tc := range cases {
		got, err := boardFeedOrderBy(tc.sort)
		if err != nil {
			t.Fatalf("sort %q: %v", tc.sort, err)
		}
		if got != tc.want {
			t.Fatalf("sort %q: got %q want %q", tc.sort, got, tc.want)
		}
	}
	if _, err := boardFeedOrderBy("hot"); err != ErrInvalidBoardFeedSort {
		t.Fatalf("expected ErrInvalidBoardFeedSort, got %v", err)
	}
}
