package validation

import "fmt"

// InvalidInputError is returned for rejected user input (HTTP 400).
type InvalidInputError struct {
	Message string
}

func (e *InvalidInputError) Error() string { return e.Message }

// Invalidf formats a validation error message.
func Invalidf(format string, args ...interface{}) error {
	return &InvalidInputError{Message: fmt.Sprintf(format, args...)}
}
