import { and, desc, eq, inArray } from "drizzle-orm";
import { SettingsSection } from "@/features/org/components/settings-section";
import { listSessions, type SessionUser } from "@/lib/auth/session";
import { getDb, schema as s } from "@/lib/db";
import { formatDateTime, type Locale } from "@/lib/format";
import { ChangePasswordForm, DeviceList, type DeviceRow } from "./security-forms";

/** "Chrome on Windows" from a user-agent string — enough to recognise your own devices. */
function describeAgent(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: "Unknown device", mobile: false };
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  return { label: `${browser} on ${os}`, mobile: /iPhone|Android|Mobile/.test(ua) };
}

const EVENT_LABEL: Record<string, string> = {
  "signin.success": "Signed in",
  "signin.failed": "Failed sign-in attempt",
  "signin.throttled": "Sign-in blocked — too many attempts",
  "password.changed": "Password changed",
  "password.change_failed": "Password change failed",
  "session.revoked": "A device was signed out",
  "session.revoked_others": "Signed out of other devices",
  "session.revoked_by_admin": "Signed out by TrustCraft support",
  signup: "Account created",
};

/** Password, signed-in devices and recent sign-in activity — the same for everyone, wherever they reach it from. */
export async function AccountSecurity({ user, locale }: { user: SessionUser; locale: Pick<Locale, "locale" | "timezone"> }) {
  const db = await getDb();
  const [sessions, events] = await Promise.all([
    listSessions(user.id),
    db
      .select({ id: s.securityEvents.id, type: s.securityEvents.type, createdAt: s.securityEvents.createdAt })
      .from(s.securityEvents)
      .where(and(eq(s.securityEvents.userId, user.id), inArray(s.securityEvents.type, Object.keys(EVENT_LABEL))))
      .orderBy(desc(s.securityEvents.createdAt))
      .limit(8),
  ]);
  const devices: DeviceRow[] = sessions.map((x) => ({ id: x.id, ...describeAgent(x.userAgent), lastSeenAt: (x.lastSeenAt ?? x.createdAt).toISOString(), current: x.id === user.sessionId }));
  return (
    <div className="flex flex-col gap-8">
      <SettingsSection title="Password">
        <ChangePasswordForm />
      </SettingsSection>
      <SettingsSection title="Signed-in devices" description="Sessions last 30 days. Sign out any you don't recognise.">
        <DeviceList devices={devices} now={new Date().toISOString()} />
      </SettingsSection>
      <SettingsSection title="Recent account activity">
        {events.length ? (
          <ul className="-my-1 divide-y divide-border">
            {events.map((e) => (
              <li key={e.id} className="flex items-baseline justify-between gap-4 py-2 text-body">
                <span className="text-primary">{EVENT_LABEL[e.type]}</span>
                <span className="shrink-0 text-compact tabular-nums text-muted">{formatDateTime(e.createdAt, locale)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-muted">Nothing to show yet.</p>
        )}
      </SettingsSection>
    </div>
  );
}
