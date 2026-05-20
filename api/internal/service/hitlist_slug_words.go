package service

import (
	"crypto/rand"
	"encoding/binary"
	"fmt"
)

var hitlistSlugNouns = []string{
	"atlas", "comet", "canyon", "delta", "ember", "fjord", "galaxy", "harbor",
	"island", "jungle", "kettle", "meadow", "nebula", "oracle", "prism", "quasar",
	"ripple", "summit", "thunder", "valley", "whisper", "zenith",
}

var hitlistSlugVerbs = []string{
	"climb", "dance", "drift", "forge", "glide", "ignite", "kindle", "leap",
	"march", "nest", "orbit", "pulse", "quest", "roam", "spark", "trek",
	"unite", "wander", "zoom", "browse",
}

var hitlistSlugAdverbs = []string{
	"boldly", "briskly", "clearly", "deeply", "eagerly", "freely", "gladly",
	"lightly", "nearly", "openly", "plainly", "quietly", "rapidly", "softly",
	"swiftly", "warmly", "wildly", "bravely", "gently", "keenly",
}

var hitlistCelebritySurnames = []string{
	"hepburn", "monroe", "pacino", "streep", "deniro", "garland", "chaplin",
	"bronte", "hawking", "curie", "armstrong", "ellington", "holiday", "sinatra",
	"beckham", "marley", "chan", "wong", "khan", "taylor", "turner", "novak",
}

func randomHitlistSlugIndex(n int) (int, error) {
	if n < 1 {
		return 0, fmt.Errorf("randomHitlistSlugIndex: empty set")
	}
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return 0, err
	}
	return int(binary.BigEndian.Uint64(b[:]) % uint64(n)), nil
}

func randomHitlistSlugWord() (string, error) {
	kind, err := randomHitlistSlugIndex(3)
	if err != nil {
		return "", err
	}
	switch kind {
	case 0:
		i, err := randomHitlistSlugIndex(len(hitlistSlugNouns))
		if err != nil {
			return "", err
		}
		return hitlistSlugNouns[i], nil
	case 1:
		i, err := randomHitlistSlugIndex(len(hitlistSlugVerbs))
		if err != nil {
			return "", err
		}
		return hitlistSlugVerbs[i], nil
	default:
		i, err := randomHitlistSlugIndex(len(hitlistSlugAdverbs))
		if err != nil {
			return "", err
		}
		return hitlistSlugAdverbs[i], nil
	}
}

func randomHitlistCelebritySurname() (string, error) {
	i, err := randomHitlistSlugIndex(len(hitlistCelebritySurnames))
	if err != nil {
		return "", err
	}
	return hitlistCelebritySurnames[i], nil
}

// hitlistMemorableSlugCandidate returns base-word-surname (each segment slug-safe).
func hitlistMemorableSlugCandidate(base, word, surname string) string {
	return base + "-" + word + "-" + surname
}
