package config

import (
	"os"
	"strconv"
	"strings"
)

func mergeString(envKey, cli, file, def string) string {
	if v := strings.TrimSpace(os.Getenv(envKey)); v != "" {
		return v
	}
	if strings.TrimSpace(cli) != "" {
		return strings.TrimSpace(cli)
	}
	if strings.TrimSpace(file) != "" {
		return strings.TrimSpace(file)
	}
	return def
}

// mergeStringFirstEnv tries each env key in order, then cli, file, def (same semantics as mergeString but multiple env aliases).
func mergeStringFirstEnv(envKeys []string, cli, file, def string) string {
	for _, k := range envKeys {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	if strings.TrimSpace(cli) != "" {
		return strings.TrimSpace(cli)
	}
	if strings.TrimSpace(file) != "" {
		return strings.TrimSpace(file)
	}
	return def
}

func mergeStringSlice(envKey, cliCSV string, fileSlice []string, def []string) []string {
	if v := strings.TrimSpace(os.Getenv(envKey)); v != "" {
		return splitCSV(v)
	}
	if strings.TrimSpace(cliCSV) != "" {
		return splitCSV(cliCSV)
	}
	if len(fileSlice) > 0 {
		out := make([]string, 0, len(fileSlice))
		for _, s := range fileSlice {
			s = strings.TrimSpace(s)
			if s != "" {
				out = append(out, s)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return def
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func envBoolSet(key string) (value bool, set bool) {
	s := os.Getenv(key)
	if s == "" {
		return false, false
	}
	b, err := strconv.ParseBool(s)
	if err != nil {
		return s == "1" || strings.EqualFold(s, "yes"), true
	}
	return b, true
}

func mergeBool(envKey, cliStr string, fileVal *bool, def bool) bool {
	if v, ok := envBoolSet(envKey); ok {
		return v
	}
	if strings.TrimSpace(cliStr) != "" {
		b, err := strconv.ParseBool(strings.TrimSpace(cliStr))
		if err != nil {
			s := strings.TrimSpace(cliStr)
			return s == "1" || strings.EqualFold(s, "yes")
		}
		return b
	}
	if fileVal != nil {
		return *fileVal
	}
	return def
}

// mergeInt: env SESSION_MAX_AGE_SECONDS, cli (non-zero), file (non-zero), def.
func mergeSessionMaxAge(envKey string, cliVal int, fileVal int, def int) int {
	if v := strings.TrimSpace(os.Getenv(envKey)); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 60 {
			return n
		}
	}
	if cliVal > 0 {
		return cliVal
	}
	if fileVal > 60 {
		return fileVal
	}
	return def
}
