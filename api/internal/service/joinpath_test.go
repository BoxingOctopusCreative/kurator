package service

import (
	"net/url"
	"testing"
)

func TestJoinPathPublicImageURL(t *testing.T) {
	base := "http://localhost:9000/kurator-covers"
	key := "avatars/abc-def.jpg"
	out, err := url.JoinPath(base, key)
	if err != nil {
		t.Fatal(err)
	}
	want := "http://localhost:9000/kurator-covers/avatars/abc-def.jpg"
	if out != want {
		t.Fatalf("got %q want %q", out, want)
	}
}
