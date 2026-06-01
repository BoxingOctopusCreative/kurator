package service

import (
	"testing"

	"github.com/boxingoctopus/kurator/api/internal/models"
)

func TestNeedsOnboarding(t *testing.T) {
	u := &models.User{OnboardingCompleted: false, OnboardingStep: 1}
	if !NeedsOnboarding(u, false) {
		t.Fatal("expected onboarding for new user without shelves")
	}
	if NeedsOnboarding(u, true) {
		t.Fatal("existing shelves should skip onboarding")
	}
	u.OnboardingCompleted = true
	if NeedsOnboarding(u, false) {
		t.Fatal("completed onboarding should not show overlay")
	}
}

func TestEffectiveOnboardingStep(t *testing.T) {
	if effectiveOnboardingStep(&models.User{OnboardingStep: 0}) != 1 {
		t.Fatal("step 0 should map to 1")
	}
	if effectiveOnboardingStep(&models.User{OnboardingStep: 3}) != 3 {
		t.Fatal("expected step 3")
	}
}
