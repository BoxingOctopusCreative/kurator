package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/boxingoctopus/kurator/api/internal/models"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/stripe/stripe-go/v82"
	billingportal "github.com/stripe/stripe-go/v82/billingportal/session"
	checkoutsession "github.com/stripe/stripe-go/v82/checkout/session"
	"github.com/stripe/stripe-go/v82/subscription"
	"github.com/stripe/stripe-go/v82/webhook"
)

var (
	ErrBillingNotConfigured  = errors.New("billing is not configured")
	ErrBillingAlreadyPro     = errors.New("you already have an active Kurator Pro subscription; manage it in the billing portal")
	ErrBillingNoCustomer     = errors.New("no Stripe customer on file; subscribe first")
	ErrBillingNoSubscription = errors.New("no active subscription on file")
	ErrBillingSameInterval   = errors.New("subscription is already on that billing interval")
	ErrBillingCannotSwitch   = errors.New("subscription cannot be changed in its current status")
)

type BillingService struct {
	users              repository.UserRepository
	publicWebBaseURL   string
	secretKey          string
	webhookSecret      string
	proMonthlyPriceID  string
	proAnnualPriceID   string
}

func NewBillingService(
	users repository.UserRepository,
	publicWebBaseURL, secretKey, webhookSecret, proMonthlyPriceID, proAnnualPriceID string,
) *BillingService {
	return &BillingService{
		users:             users,
		publicWebBaseURL:  strings.TrimRight(strings.TrimSpace(publicWebBaseURL), "/"),
		secretKey:         strings.TrimSpace(secretKey),
		webhookSecret:     strings.TrimSpace(webhookSecret),
		proMonthlyPriceID: strings.TrimSpace(proMonthlyPriceID),
		proAnnualPriceID:  strings.TrimSpace(proAnnualPriceID),
	}
}

func (s *BillingService) Enabled() bool {
	return s.secretKey != "" && s.proMonthlyPriceID != "" && s.proAnnualPriceID != ""
}

func (s *BillingService) WebhookEnabled() bool {
	return s.Enabled() && s.webhookSecret != ""
}

func (s *BillingService) ensureStripe() error {
	if !s.Enabled() {
		return ErrBillingNotConfigured
	}
	stripe.Key = s.secretKey
	return nil
}

func billingReturnBase(publicWeb string) string {
	if publicWeb != "" {
		return publicWeb
	}
	return "http://localhost:3000"
}

// CreateCheckoutSession starts Stripe Checkout for Kurator Pro (monthly or annual).
func (s *BillingService) CreateCheckoutSession(ctx context.Context, userID int64, interval string) (string, error) {
	if err := s.ensureStripe(); err != nil {
		return "", err
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return "", err
	}
	if models.HasProPlan(u) && isActiveSubscriptionStatus(u.SubscriptionStatus) {
		return "", ErrBillingAlreadyPro
	}

	priceID, _, err := s.priceIDForInterval(interval)
	if err != nil {
		return "", err
	}

	base := billingReturnBase(s.publicWebBaseURL)
	successURL := base + "/settings/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}"
	cancelURL := base + "/settings/billing?checkout=cancelled"

	userIDStr := strconv.FormatInt(userID, 10)
	params := &stripe.CheckoutSessionParams{
		Mode:              stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		ClientReferenceID: stripe.String(userIDStr),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{Price: stripe.String(priceID), Quantity: stripe.Int64(1)},
		},
		SuccessURL: stripe.String(successURL),
		CancelURL:  stripe.String(cancelURL),
		Metadata: map[string]string{
			"user_id": userIDStr,
		},
		SubscriptionData: &stripe.CheckoutSessionSubscriptionDataParams{
			Metadata: map[string]string{
				"user_id": userIDStr,
			},
			BillingMode: &stripe.CheckoutSessionSubscriptionDataBillingModeParams{
				Type: stripe.String("flexible"),
			},
		},
	}
	if u.StripeCustomerID != nil && strings.TrimSpace(*u.StripeCustomerID) != "" {
		params.Customer = stripe.String(strings.TrimSpace(*u.StripeCustomerID))
	} else {
		params.CustomerEmail = stripe.String(u.Email)
	}

	sess, err := checkoutsession.New(params)
	if err != nil {
		return "", err
	}
	if sess.URL == "" {
		return "", errors.New("stripe checkout session missing url")
	}
	return sess.URL, nil
}

// SwitchSubscriptionInterval changes an active Pro subscription between monthly and annual pricing.
func (s *BillingService) SwitchSubscriptionInterval(ctx context.Context, userID int64, interval string) error {
	if err := s.ensureStripe(); err != nil {
		return err
	}
	newPriceID, newInterval, err := s.priceIDForInterval(interval)
	if err != nil {
		return err
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if u.SubscriptionID == nil || strings.TrimSpace(*u.SubscriptionID) == "" {
		return ErrBillingNoSubscription
	}
	if !isActiveSubscriptionStatus(u.SubscriptionStatus) {
		return ErrBillingCannotSwitch
	}
	if iv := strings.TrimSpace(u.SubscriptionInterval); iv != "" && iv == newInterval {
		return ErrBillingSameInterval
	}

	subID := strings.TrimSpace(*u.SubscriptionID)
	sub, err := subscription.Get(subID, nil)
	if err != nil {
		return err
	}
	itemID := subscriptionPrimaryItemID(sub)
	if itemID == "" {
		return errors.New("subscription has no items")
	}

	updated, err := subscription.Update(subID, &stripe.SubscriptionParams{
		CancelAtPeriodEnd: stripe.Bool(false),
		Items: []*stripe.SubscriptionItemsParams{
			{
				ID:    stripe.String(itemID),
				Price: stripe.String(newPriceID),
			},
		},
	})
	if err != nil {
		return err
	}
	return s.syncSubscription(ctx, updated)
}

// CreatePortalSession opens the Stripe Customer Portal for the signed-in user.
func (s *BillingService) CreatePortalSession(ctx context.Context, userID int64) (string, error) {
	if err := s.ensureStripe(); err != nil {
		return "", err
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return "", err
	}
	if u.StripeCustomerID == nil || strings.TrimSpace(*u.StripeCustomerID) == "" {
		return "", ErrBillingNoCustomer
	}

	base := billingReturnBase(s.publicWebBaseURL)
	returnURL := base + "/settings/billing"

	sess, err := billingportal.New(&stripe.BillingPortalSessionParams{
		Customer:  stripe.String(strings.TrimSpace(*u.StripeCustomerID)),
		ReturnURL: stripe.String(returnURL),
	})
	if err != nil {
		return "", err
	}
	if sess.URL == "" {
		return "", errors.New("stripe portal session missing url")
	}
	return sess.URL, nil
}

// HandleWebhook verifies the Stripe signature and applies subscription state to users.
func (s *BillingService) HandleWebhook(payload []byte, signatureHeader string) error {
	if !s.WebhookEnabled() {
		return ErrBillingNotConfigured
	}
	event, err := webhook.ConstructEventWithOptions(
		payload,
		signatureHeader,
		s.webhookSecret,
		webhook.ConstructEventOptions{
			// Stripe CLI / Dashboard may send a newer API version than stripe-go embeds.
			IgnoreAPIVersionMismatch: true,
		},
	)
	if err != nil {
		return fmt.Errorf("stripe webhook signature: %w", err)
	}

	ctx := context.Background()
	switch event.Type {
	case "checkout.session.completed":
		return s.onCheckoutSessionCompleted(ctx, event)
	case "customer.subscription.created", "customer.subscription.updated":
		return s.onSubscriptionUpdated(ctx, event)
	case "customer.subscription.deleted":
		return s.onSubscriptionDeleted(ctx, event)
	case "invoice.paid":
		return s.onInvoicePaid(ctx, event)
	case "invoice.payment_failed":
		return s.onInvoicePaymentFailed(ctx, event)
	default:
		return nil
	}
}

func (s *BillingService) onCheckoutSessionCompleted(ctx context.Context, event stripe.Event) error {
	var sess stripe.CheckoutSession
	if err := unmarshalEventData(event, &sess); err != nil {
		return err
	}
	if sess.Mode != stripe.CheckoutSessionModeSubscription {
		return nil
	}

	userID, err := userIDFromCheckoutSession(&sess)
	if err != nil {
		return err
	}

	customerID := checkoutSessionCustomerID(&sess, event.Data.Raw)
	subID := checkoutSessionSubscriptionID(&sess, event.Data.Raw)
	if subID == "" {
		return errors.New("checkout.session.completed missing subscription id")
	}

	if err := s.ensureStripe(); err != nil {
		return err
	}
	sub, err := subscription.Get(subID, nil)
	if err != nil {
		return err
	}
	return s.applySubscription(ctx, userID, customerID, sub)
}

func (s *BillingService) onSubscriptionUpdated(ctx context.Context, event stripe.Event) error {
	var sub stripe.Subscription
	if err := unmarshalEventData(event, &sub); err != nil {
		return err
	}
	return s.syncSubscription(ctx, &sub)
}

func (s *BillingService) onSubscriptionDeleted(ctx context.Context, event stripe.Event) error {
	var sub stripe.Subscription
	if err := unmarshalEventData(event, &sub); err != nil {
		return err
	}
	userID, err := s.resolveUserIDForSubscription(ctx, &sub)
	if err != nil {
		return err
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	cust := u.StripeCustomerID
	if id := stripeCustomerID(sub.Customer); id != "" {
		cust = strPtr(id)
	}
	return s.users.UpdateStripeBilling(ctx, userID, cust, nil, string(stripe.SubscriptionStatusCanceled), "", models.PlanFree)
}

func (s *BillingService) onInvoicePaid(ctx context.Context, event stripe.Event) error {
	var inv stripe.Invoice
	if err := unmarshalEventData(event, &inv); err != nil {
		return err
	}
	subID := stripeInvoiceSubscriptionID(&inv)
	if subID == "" {
		return nil
	}
	if err := s.ensureStripe(); err != nil {
		return err
	}
	sub, err := subscription.Get(subID, nil)
	if err != nil {
		return err
	}
	return s.syncSubscription(ctx, sub)
}

func (s *BillingService) onInvoicePaymentFailed(ctx context.Context, event stripe.Event) error {
	var inv stripe.Invoice
	if err := unmarshalEventData(event, &inv); err != nil {
		return err
	}
	subID := stripeInvoiceSubscriptionID(&inv)
	if subID == "" {
		return nil
	}
	userID, err := s.users.GetUserIDBySubscriptionID(ctx, subID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			if cid := stripeCustomerID(inv.Customer); cid != "" {
				userID, err = s.users.GetUserIDByStripeCustomerID(ctx, cid)
			}
		}
		if err != nil {
			return err
		}
	}
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	cust := u.StripeCustomerID
	if id := stripeCustomerID(inv.Customer); id != "" {
		cust = strPtr(id)
	}
	subPtr := strPtr(subID)
	plan := models.PlanPro
	if u.Plan != "" {
		plan = strings.TrimSpace(u.Plan)
	}
	interval := strings.TrimSpace(u.SubscriptionInterval)
	return s.users.UpdateStripeBilling(ctx, userID, cust, subPtr, string(stripe.SubscriptionStatusPastDue), interval, plan)
}

func (s *BillingService) syncSubscription(ctx context.Context, sub *stripe.Subscription) error {
	userID, err := s.resolveUserIDForSubscription(ctx, sub)
	if err != nil {
		return err
	}
	customerID := stripeCustomerID(sub.Customer)
	return s.applySubscription(ctx, userID, customerID, sub)
}

func (s *BillingService) applySubscription(ctx context.Context, userID int64, customerID string, sub *stripe.Subscription) error {
	status := string(sub.Status)
	plan := planFromSubscriptionStatus(status)
	interval := s.intervalFromSubscription(sub)
	if plan == models.PlanFree {
		interval = ""
	}
	cust := strPtr(customerID)
	subPtr := strPtr(sub.ID)
	if plan == models.PlanFree {
		subPtr = nil
	}
	return s.users.UpdateStripeBilling(ctx, userID, cust, subPtr, status, interval, plan)
}

func (s *BillingService) priceIDForInterval(interval string) (priceID, normalized string, err error) {
	normalized, err = normalizeBillingInterval(interval)
	if err != nil {
		return "", "", err
	}
	switch normalized {
	case models.BillingIntervalMonthly:
		return s.proMonthlyPriceID, normalized, nil
	case models.BillingIntervalAnnual:
		return s.proAnnualPriceID, normalized, nil
	default:
		return "", "", fmt.Errorf("interval must be monthly or annual")
	}
}

func (s *BillingService) intervalFromPriceID(priceID string) string {
	priceID = strings.TrimSpace(priceID)
	switch priceID {
	case s.proMonthlyPriceID:
		return models.BillingIntervalMonthly
	case s.proAnnualPriceID:
		return models.BillingIntervalAnnual
	default:
		return ""
	}
}

func (s *BillingService) intervalFromSubscription(sub *stripe.Subscription) string {
	return s.intervalFromPriceID(subscriptionPrimaryPriceID(sub))
}

func normalizeBillingInterval(interval string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(interval)) {
	case "monthly", "month":
		return models.BillingIntervalMonthly, nil
	case "annual", "yearly", "year":
		return models.BillingIntervalAnnual, nil
	default:
		return "", fmt.Errorf("interval must be monthly or annual")
	}
}

func subscriptionPrimaryPriceID(sub *stripe.Subscription) string {
	if sub == nil || sub.Items == nil || len(sub.Items.Data) == 0 {
		return ""
	}
	item := sub.Items.Data[0]
	if item.Price != nil && strings.TrimSpace(item.Price.ID) != "" {
		return strings.TrimSpace(item.Price.ID)
	}
	if item.Plan != nil && strings.TrimSpace(item.Plan.ID) != "" {
		return strings.TrimSpace(item.Plan.ID)
	}
	return ""
}

func subscriptionPrimaryItemID(sub *stripe.Subscription) string {
	if sub == nil || sub.Items == nil || len(sub.Items.Data) == 0 {
		return ""
	}
	return strings.TrimSpace(sub.Items.Data[0].ID)
}

func (s *BillingService) resolveUserIDForSubscription(ctx context.Context, sub *stripe.Subscription) (int64, error) {
	if sub.Metadata != nil {
		if raw := strings.TrimSpace(sub.Metadata["user_id"]); raw != "" {
			if id, err := strconv.ParseInt(raw, 10, 64); err == nil {
				return id, nil
			}
		}
	}
	if sub.ID != "" {
		if id, err := s.users.GetUserIDBySubscriptionID(ctx, sub.ID); err == nil {
			return id, nil
		}
	}
	if id := stripeCustomerID(sub.Customer); id != "" {
		return s.users.GetUserIDByStripeCustomerID(ctx, id)
	}
	return 0, errors.New("could not resolve user for subscription event")
}

func userIDFromCheckoutSession(sess *stripe.CheckoutSession) (int64, error) {
	if sess.Metadata != nil {
		if raw := strings.TrimSpace(sess.Metadata["user_id"]); raw != "" {
			return strconv.ParseInt(raw, 10, 64)
		}
	}
	if sess.ClientReferenceID != "" {
		return strconv.ParseInt(strings.TrimSpace(sess.ClientReferenceID), 10, 64)
	}
	return 0, errors.New("checkout session missing user id")
}

func planFromSubscriptionStatus(status string) string {
	switch stripe.SubscriptionStatus(status) {
	case stripe.SubscriptionStatusActive, stripe.SubscriptionStatusTrialing, stripe.SubscriptionStatusPastDue:
		return models.PlanPro
	default:
		return models.PlanFree
	}
}

func isActiveSubscriptionStatus(status string) bool {
	switch stripe.SubscriptionStatus(strings.TrimSpace(status)) {
	case stripe.SubscriptionStatusActive, stripe.SubscriptionStatusTrialing, stripe.SubscriptionStatusPastDue:
		return true
	default:
		return false
	}
}

func unmarshalEventData(event stripe.Event, dst interface{}) error {
	if err := json.Unmarshal(event.Data.Raw, dst); err != nil {
		return fmt.Errorf("stripe event %s: %w", event.Type, err)
	}
	return nil
}

func stripeCustomerID(c *stripe.Customer) string {
	if c == nil {
		return ""
	}
	return strings.TrimSpace(c.ID)
}

func stripeSubscriptionID(sub *stripe.Subscription) string {
	if sub == nil {
		return ""
	}
	return strings.TrimSpace(sub.ID)
}

// Webhook payloads often send customer/subscription as bare IDs, not expanded objects.
func checkoutSessionCustomerID(sess *stripe.CheckoutSession, raw json.RawMessage) string {
	if id := stripeCustomerID(sess.Customer); id != "" {
		return id
	}
	return stringIDFromRaw(raw, "customer")
}

func checkoutSessionSubscriptionID(sess *stripe.CheckoutSession, raw json.RawMessage) string {
	if id := stripeSubscriptionID(sess.Subscription); id != "" {
		return id
	}
	return stringIDFromRaw(raw, "subscription")
}

func stringIDFromRaw(raw json.RawMessage, field string) string {
	if len(raw) == 0 || field == "" {
		return ""
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(raw, &m); err != nil {
		return ""
	}
	v, ok := m[field]
	if !ok || len(v) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(v, &s); err == nil {
		return strings.TrimSpace(s)
	}
	var obj struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(v, &obj); err == nil {
		return strings.TrimSpace(obj.ID)
	}
	return ""
}

func stripeInvoiceSubscriptionID(inv *stripe.Invoice) string {
	if inv == nil || inv.Parent == nil || inv.Parent.SubscriptionDetails == nil {
		return ""
	}
	return stripeSubscriptionID(inv.Parent.SubscriptionDetails.Subscription)
}

func strPtr(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}
