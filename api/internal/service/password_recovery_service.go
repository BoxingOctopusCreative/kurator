package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"github.com/boxingoctopus/kurator/api/internal/mailgun"
	"github.com/boxingoctopus/kurator/api/internal/repository"
	"github.com/boxingoctopus/kurator/api/internal/validation"
	"github.com/golang-jwt/jwt/v5"
	"github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"
)

const (
	pwdResetPendingTyp     = "pwd_reset"
	recoveryCodeTTL        = 15 * time.Minute
	passwordResetTokenTTL  = 15 * time.Minute
	recoveryBcryptCost     = 10
	maxRecoveryPerHour     = 5
	recoveryThrottleWindow = time.Hour
)

var (
	ErrInvalidRecoveryCode = errors.New("invalid or expired recovery code")
	ErrInvalidResetToken   = errors.New("invalid or expired reset session")
	// ErrPasswordChangeUsesTOTP is returned when a signed-in user with 2FA requests an email verification code for password change.
	ErrPasswordChangeUsesTOTP = errors.New("use your authenticator app code instead of email for this account")
	// ErrMailNotConfigured when Mailgun was not wired (cannot email a verification code).
	ErrMailNotConfigured = errors.New("email delivery is not configured")
	// ErrPasswordChangeRateLimited caps how often codes can be requested for signed-in flows.
	ErrPasswordChangeRateLimited = errors.New("too many verification attempts; wait before requesting another code")
	// ErrPasswordWrongProofKind indicates the client sent email_code for a TOTP-only account or vice versa.
	ErrPasswordWrongProofKind = errors.New("use only the verification method required for your account")
)

type PasswordRecoveryService struct {
	users    repository.UserRepository
	sessions repository.SessionRepository
	codes    repository.PasswordRecoveryRepository
	mail     *mailgun.Client
	jwtSecret []byte
}

func NewPasswordRecoveryService(
	users repository.UserRepository,
	sessions repository.SessionRepository,
	codes repository.PasswordRecoveryRepository,
	mail *mailgun.Client,
	jwtSecret string,
) *PasswordRecoveryService {
	return &PasswordRecoveryService{
		users:     users,
		sessions:  sessions,
		codes:     codes,
		mail:      mail,
		jwtSecret: []byte(jwtSecret),
	}
}

// RequestCode emails a 6-digit code if the account exists and Mailgun is configured.
// Always succeeds from the caller's perspective (no email enumeration).
func (s *PasswordRecoveryService) RequestCode(ctx context.Context, email string) error {
	em, err := validation.Email(email, "Email")
	if err != nil {
		return nil
	}
	if s.mail == nil {
		log.Printf("password recovery: mailgun not configured; skipping send for %q", em)
		return nil
	}
	u, err := s.users.GetByEmail(ctx, em)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil
		}
		return err
	}
	since := time.Now().Add(-recoveryThrottleWindow)
	n, err := s.codes.CountSince(ctx, u.ID, since)
	if err != nil {
		return err
	}
	if n >= maxRecoveryPerHour {
		log.Printf("password recovery: rate limited user_id=%d", u.ID)
		return nil
	}
	code, err := randomDigits6()
	if err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(code), recoveryBcryptCost)
	if err != nil {
		return err
	}
	exp := time.Now().Add(recoveryCodeTTL)
	if err := s.codes.ReplaceCode(ctx, u.ID, string(hash), exp); err != nil {
		return err
	}
	subject := "Your Kurator password recovery code"
	body := fmt.Sprintf(`Hello,

Use this code to reset your Kurator password:

%s

This code expires in 15 minutes. If you did not request a reset, you can ignore this email.

— Kurator
`, code)
	if err := s.mail.Send(ctx, u.Email, subject, body); err != nil {
		_ = s.codes.DeleteForUser(ctx, u.ID)
		log.Printf("password recovery: mailgun send failed for %q: %v", em, err)
		return nil
	}
	return nil
}

func randomDigits6() (string, error) {
	// Uniform 000000–999999
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// VerifyCode checks the 6-digit code and returns a short-lived JWT for POST /auth/forgot-password/reset.
func (s *PasswordRecoveryService) VerifyCode(ctx context.Context, email, code string) (resetToken string, err error) {
	em, err := validation.Email(email, "Email")
	if err != nil {
		return "", ErrInvalidRecoveryCode
	}
	codeNorm, err := validation.RecoveryCode6(code, "Code")
	if err != nil {
		return "", ErrInvalidRecoveryCode
	}
	u, err := s.users.GetByEmail(ctx, em)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return "", ErrInvalidRecoveryCode
		}
		return "", err
	}
	_, hash, err := s.codes.GetLatestValid(ctx, u.ID)
	if err != nil {
		if errors.Is(err, repository.ErrPasswordRecoveryNotFound) {
			return "", ErrInvalidRecoveryCode
		}
		return "", err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(codeNorm)); err != nil {
		return "", ErrInvalidRecoveryCode
	}
	if err := s.codes.DeleteForUser(ctx, u.ID); err != nil {
		return "", err
	}
	tok, err := s.signPasswordResetToken(u.ID)
	if err != nil {
		return "", err
	}
	return tok, nil
}

func (s *PasswordRecoveryService) signPasswordResetToken(userID int64) (string, error) {
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"typ": pwdResetPendingTyp,
		"sub": fmt.Sprintf("%d", userID),
		"exp": time.Now().Add(passwordResetTokenTTL).Unix(),
	})
	return tok.SignedString(s.jwtSecret)
}

// ResetPassword consumes resetToken and sets a new password; all sessions are revoked.
func (s *PasswordRecoveryService) ResetPassword(ctx context.Context, resetToken, newPassword string) error {
	tok, err := validation.PendingLoginToken(resetToken, "Session")
	if err != nil {
		return ErrInvalidResetToken
	}
	uid, err := s.parsePasswordResetToken(tok)
	if err != nil {
		return err
	}
	if len(newPassword) < 8 {
		return ErrWeakPassword
	}
	if err := validation.Password(newPassword, "Password"); err != nil {
		return err
	}
	ph, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcryptCost)
	if err != nil {
		return err
	}
	if err := s.users.UpdatePasswordHash(ctx, uid, string(ph)); err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return ErrInvalidResetToken
		}
		return err
	}
	if err := s.sessions.DeleteAllForUser(ctx, uid); err != nil {
		return err
	}
	return nil
}

func (s *PasswordRecoveryService) parsePasswordResetToken(tokenStr string) (int64, error) {
	tok, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return s.jwtSecret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil || !tok.Valid {
		return 0, ErrInvalidResetToken
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return 0, ErrInvalidResetToken
	}
	if typ, _ := claims["typ"].(string); typ != pwdResetPendingTyp {
		return 0, ErrInvalidResetToken
	}
	sub, _ := claims["sub"].(string)
	var uid int64
	if _, err := fmt.Sscanf(sub, "%d", &uid); err != nil || uid < 1 {
		return 0, ErrInvalidResetToken
	}
	return uid, nil
}

// RequestVerificationCodeSignedIn sends a fresh 6-digit code to the account email for an in-browser password change
// when the account does not use 2FA. Rate-limited like anonymous recovery.
func (s *PasswordRecoveryService) RequestVerificationCodeSignedIn(ctx context.Context, userID int64) error {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}
	if u.TwoFactorEnabled {
		return ErrPasswordChangeUsesTOTP
	}
	if s.mail == nil {
		log.Printf("password change: mailgun not configured; user_id=%d", userID)
		return ErrMailNotConfigured
	}
	since := time.Now().Add(-recoveryThrottleWindow)
	n, err := s.codes.CountSince(ctx, u.ID, since)
	if err != nil {
		return err
	}
	if n >= maxRecoveryPerHour {
		log.Printf("password change verification: rate limited user_id=%d", u.ID)
		return ErrPasswordChangeRateLimited
	}
	code, err := randomDigits6()
	if err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(code), recoveryBcryptCost)
	if err != nil {
		return err
	}
	exp := time.Now().Add(recoveryCodeTTL)
	if err := s.codes.ReplaceCode(ctx, u.ID, string(hash), exp); err != nil {
		return err
	}
	subject := "Your Kurator password change code"
	body := fmt.Sprintf(`Hello,

Use this code to confirm changing your Kurator password:

%s

This code expires in 15 minutes. If you did not request a password change, change your password from account settings after securing your email.

— Kurator
`, code)
	if err := s.mail.Send(ctx, u.Email, subject, body); err != nil {
		_ = s.codes.DeleteForUser(ctx, u.ID)
		log.Printf("password change: mailgun send failed for user_id=%d: %v", u.ID, err)
		return ErrMailNotConfigured
	}
	return nil
}

// ChangePasswordSignedIn sets a new password after verification: TOTP when 2FA is on,
// otherwise a single-use emailed code consumed here. Revokes all sessions (including the current one).
func (s *PasswordRecoveryService) ChangePasswordSignedIn(ctx context.Context, userID int64, newPassword string, totpCodeRaw, emailCodeRaw string) error {
	u, err := s.users.GetByID(ctx, userID)
	if err != nil {
		return err
	}

	if len(newPassword) < 8 {
		return ErrWeakPassword
	}
	if err := validation.Password(newPassword, "Password"); err != nil {
		return err
	}

	tc := strings.TrimSpace(totpCodeRaw)
	ec := strings.TrimSpace(emailCodeRaw)

	if tc != "" && ec != "" {
		return ErrPasswordWrongProofKind
	}

	if u.TwoFactorEnabled {
		if ec != "" {
			return ErrPasswordWrongProofKind
		}
		codeNorm, err := validation.TotpCode(tc, "Code")
		if err != nil {
			return ErrInvalidTOTP
		}
		secret := ""
		if u.TwoFactorSecret != nil {
			secret = strings.TrimSpace(*u.TwoFactorSecret)
		}
		if secret == "" || !totp.Validate(codeNorm, secret) {
			return ErrInvalidTOTP
		}
	} else {
		if tc != "" {
			return ErrPasswordWrongProofKind
		}
		codeNorm, err := validation.RecoveryCode6(ec, "Code")
		if err != nil {
			return ErrInvalidRecoveryCode
		}
		_, hash, err := s.codes.GetLatestValid(ctx, userID)
		if err != nil {
			if errors.Is(err, repository.ErrPasswordRecoveryNotFound) {
				return ErrInvalidRecoveryCode
			}
			return err
		}
		if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(codeNorm)); err != nil {
			return ErrInvalidRecoveryCode
		}
		if err := s.codes.DeleteForUser(ctx, userID); err != nil {
			return err
		}
	}

	ph, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcryptCost)
	if err != nil {
		return err
	}
	if err := s.users.UpdatePasswordHash(ctx, userID, string(ph)); err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return ErrInvalidResetToken
		}
		return err
	}
	if err := s.sessions.DeleteAllForUser(ctx, userID); err != nil {
		return err
	}
	return nil
}

// MailConfigured is true when Mailgun credentials are present (emails can be sent).
func (s *PasswordRecoveryService) MailConfigured() bool {
	return s != nil && s.mail != nil
}
