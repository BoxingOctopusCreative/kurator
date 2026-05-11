"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { fetchMe, type AuthUser } from "@/lib/auth";

type AuthContextValue = {
  user: AuthUser | null | undefined;
  refresh: () => Promise<void>;
  /** Apply a full user object from PATCH (or login) immediately without an extra GET. */
  applySessionUser: (u: AuthUser) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setUser(await fetchMe());
    } catch {
      setUser(null);
    }
  }, []);

  const applySessionUser = useCallback((u: AuthUser) => {
    setUser(u);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, pathname]);

  const value = useMemo(
    () => ({ user, refresh, applySessionUser }),
    [user, refresh, applySessionUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
