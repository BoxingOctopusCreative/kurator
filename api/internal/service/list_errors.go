package service

import "errors"

// ErrPublicHitlistRequiresSlug is returned when visibility is public but no permalink slug was provided.
var ErrPublicHitlistRequiresSlug = errors.New("public lists require a link address")
