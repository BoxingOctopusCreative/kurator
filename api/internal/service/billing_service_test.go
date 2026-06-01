package service

import (
	"encoding/json"
	"testing"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/stripe/stripe-go/v82"
)

func TestPlanFromSubscriptionStatus(t *testing.T) {
	t.Parallel()
	cases := []struct {
		status string
		want   string
	}{
		{string(stripe.SubscriptionStatusActive), models.PlanPro},
		{string(stripe.SubscriptionStatusTrialing), models.PlanPro},
		{string(stripe.SubscriptionStatusPastDue), models.PlanPro},
		{string(stripe.SubscriptionStatusCanceled), models.PlanFree},
		{string(stripe.SubscriptionStatusUnpaid), models.PlanFree},
		{"", models.PlanFree},
	}
	for _, tc := range cases {
		if got := planFromSubscriptionStatus(tc.status); got != tc.want {
			t.Errorf("planFromSubscriptionStatus(%q) = %q, want %q", tc.status, got, tc.want)
		}
	}
}

func TestIsActiveSubscriptionStatus(t *testing.T) {
	t.Parallel()
	if !isActiveSubscriptionStatus(string(stripe.SubscriptionStatusActive)) {
		t.Fatal("expected active")
	}
	if isActiveSubscriptionStatus(string(stripe.SubscriptionStatusCanceled)) {
		t.Fatal("expected canceled to be inactive")
	}
}

func TestStripeInvoiceSubscriptionID(t *testing.T) {
	t.Parallel()
	if got := stripeInvoiceSubscriptionID(nil); got != "" {
		t.Fatalf("nil invoice: got %q", got)
	}
	inv := &stripe.Invoice{
		Parent: &stripe.InvoiceParent{
			SubscriptionDetails: &stripe.InvoiceParentSubscriptionDetails{
				Subscription: &stripe.Subscription{ID: "sub_123"},
			},
		},
	}
	if got := stripeInvoiceSubscriptionID(inv); got != "sub_123" {
		t.Fatalf("got %q, want sub_123", got)
	}
}

func TestStringIDFromRaw(t *testing.T) {
	t.Parallel()
	raw := json.RawMessage(`{"customer":"cus_abc","subscription":"sub_xyz"}`)
	if got := stringIDFromRaw(raw, "customer"); got != "cus_abc" {
		t.Fatalf("customer string: got %q", got)
	}
	if got := stringIDFromRaw(raw, "subscription"); got != "sub_xyz" {
		t.Fatalf("subscription string: got %q", got)
	}
	expanded := json.RawMessage(`{"customer":{"id":"cus_obj"}}`)
	if got := stringIDFromRaw(expanded, "customer"); got != "cus_obj" {
		t.Fatalf("customer object: got %q", got)
	}
}

func TestNormalizeBillingInterval(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"monthly", models.BillingIntervalMonthly, true},
		{"MONTH", models.BillingIntervalMonthly, true},
		{"annual", models.BillingIntervalAnnual, true},
		{"yearly", models.BillingIntervalAnnual, true},
		{"weekly", "", false},
	}
	s := &BillingService{
		proMonthlyPriceID: "price_monthly",
		proAnnualPriceID:  "price_annual",
	}
	for _, tc := range cases {
		got, err := normalizeBillingInterval(tc.in)
		if tc.ok {
			if err != nil || got != tc.want {
				t.Errorf("normalizeBillingInterval(%q) = %q, %v; want %q", tc.in, got, err, tc.want)
			}
		} else if err == nil {
			t.Errorf("normalizeBillingInterval(%q) expected error", tc.in)
		}
	}
	if got := s.intervalFromPriceID("price_monthly"); got != models.BillingIntervalMonthly {
		t.Fatalf("monthly price: got %q", got)
	}
	if got := s.intervalFromPriceID("price_annual"); got != models.BillingIntervalAnnual {
		t.Fatalf("annual price: got %q", got)
	}
	if got := s.intervalFromPriceID("price_other"); got != "" {
		t.Fatalf("unknown price: got %q", got)
	}
}

func TestSubscriptionPrimaryPriceID(t *testing.T) {
	t.Parallel()
	sub := &stripe.Subscription{
		Items: &stripe.SubscriptionItemList{
			Data: []*stripe.SubscriptionItem{
				{ID: "si_1", Price: &stripe.Price{ID: "price_abc"}},
			},
		},
	}
	if got := subscriptionPrimaryPriceID(sub); got != "price_abc" {
		t.Fatalf("got %q", got)
	}
	if got := subscriptionPrimaryItemID(sub); got != "si_1" {
		t.Fatalf("item id: got %q", got)
	}
}

func TestUserIDFromCheckoutSession(t *testing.T) {
	t.Parallel()
	id, err := userIDFromCheckoutSession(&stripe.CheckoutSession{
		Metadata: map[string]string{"user_id": "42"},
	})
	if err != nil || id != 42 {
		t.Fatalf("metadata: id=%d err=%v", id, err)
	}
	id, err = userIDFromCheckoutSession(&stripe.CheckoutSession{ClientReferenceID: "99"})
	if err != nil || id != 99 {
		t.Fatalf("client_reference_id: id=%d err=%v", id, err)
	}
	_, err = userIDFromCheckoutSession(&stripe.CheckoutSession{})
	if err == nil {
		t.Fatal("expected error when user id missing")
	}
}
