package repository

import (
	"database/sql"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
)

func shelfAuthorPtr(username, displayName sql.NullString, avatar sql.NullString) *models.ShelfAuthor {
	if !username.Valid || strings.TrimSpace(username.String) == "" {
		return nil
	}
	a := &models.ShelfAuthor{
		Username:    strings.TrimSpace(username.String),
		DisplayName: strings.TrimSpace(displayName.String),
	}
	if avatar.Valid && strings.TrimSpace(avatar.String) != "" {
		s := strings.TrimSpace(avatar.String)
		a.AvatarURL = &s
	}
	return a
}
