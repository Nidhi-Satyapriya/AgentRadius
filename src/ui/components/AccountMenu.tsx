import { googleSignInUrl } from "../api.ts";
import { useAuth } from "../auth.tsx";
import { href } from "../routing.ts";

/** Sign-in identifies you only. It grants AgentRadius no access to Google data. */
export function SignInButton({ large = false }: { large?: boolean }) {
  const { auth } = useAuth();
  if (auth === null) return null;
  if (!auth.configured)
    return (
      <a
        className={`btn-google ${large ? "btn-google-lg" : ""}`}
        href={`${href("settings")}`}
        title="Google sign-in isn't set up yet. See Settings."
      >
        Sign in with Google
        <span className="muted small">(set up)</span>
      </a>
    );
  return (
    <a className={`btn-google ${large ? "btn-google-lg" : ""}`} href={googleSignInUrl()}>
      Sign in with Google
    </a>
  );
}

export function AccountMenu() {
  const { auth, signOut } = useAuth();
  if (auth?.user)
    return (
      <span className="account">
        <span className="avatar" aria-hidden="true">
          {auth.user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="account-name" title={auth.user.email}>
          {auth.user.name}
        </span>
        <button type="button" className="btn-link" onClick={signOut}>
          Sign out
        </button>
      </span>
    );
  return <SignInButton />;
}
