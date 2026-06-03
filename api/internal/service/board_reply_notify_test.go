package service

import "testing"

func TestBoardReplyNotificationRecipients(t *testing.T) {
	t.Parallel()
	const actor int64 = 10
	const threadAuthor int64 = 1
	const owner int64 = 2
	const parentAuthor int64 = 3

	top := boardReplyNotificationRecipients(
		true,
		actor,
		threadAuthor,
		owner,
		0,
		[]int64{4, 5, owner, threadAuthor},
	)
	if len(top) != 4 {
		t.Fatalf("top-level: got %v want 4 distinct recipients", top)
	}

	nested := boardReplyNotificationRecipients(
		false,
		actor,
		threadAuthor,
		owner,
		parentAuthor,
		[]int64{threadAuthor, owner, 99},
	)
	if len(nested) != 1 || nested[0] != parentAuthor {
		t.Fatalf("nested: got %v want [%d]", nested, parentAuthor)
	}

	if len(boardReplyNotificationRecipients(true, actor, actor, actor, 0, nil)) != 0 {
		t.Fatal("expected no recipients when actor is only participant")
	}
}
