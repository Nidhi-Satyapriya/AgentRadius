import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthResponse } from "../api/contracts.ts";
import { api } from "./api.ts";

interface AuthModel {
  /** Null while loading or if the status couldn't be read. */
  readonly auth: AuthResponse | null;
  readonly signOut: () => void;
}

const AuthContext = createContext<AuthModel>({ auth: null, signOut: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  useEffect(() => {
    let live = true;
    api
      .auth()
      .then((a) => live && setAuth(a))
      .catch(() => live && setAuth(null));
    return () => {
      live = false;
    };
  }, []);
  const signOut = useCallback(() => {
    api.signOut().then(setAuth, () => {});
  }, []);
  return <AuthContext.Provider value={{ auth, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
