/**
 * /privacy: the privacy policy (public, no sign-in). Linked from the login page and the Google OAuth
 * consent screen (Google requires a privacy policy URL to publish the app). Keep it in sync with what the
 * app really does: docs/engine.md §12 and the data code (lib/calendar, lib/social, lib/ai, lib/data).
 */
import Link from "next/link";

export const metadata = { title: "Privacy policy · Sidequest" };

const CONTACT = "anthonythehelou@gmail.com";
const UPDATED = "November 23, 2026";

/** @param {{ title: string, children: React.ReactNode }} props */
function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display text-xl font-extrabold">{title}</h2>
      <div className="space-y-2 leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-7 px-5 py-10 text-ink">
      <header className="space-y-2">
        <Link href="/login" className="text-sm font-semibold underline underline-offset-2">
          ← Sidequest
        </Link>
        <h1 className="font-display text-heading font-extrabold">Privacy policy</h1>
        <p className="text-sm text-ink-muted">Last updated: {UPDATED}</p>
        <p className="leading-relaxed text-ink-muted">
          Sidequest suggests things to do with your friends at times when you&apos;re all free. This page explains
          what we collect to do that, why, who we share it with, and how to delete it. We don&apos;t sell your data
          and we don&apos;t use it for ads.
        </p>
      </header>

      <Section title="What we collect">
        <p>
          <strong className="text-ink">Your Google account basics:</strong> your name, email address and profile picture, when you sign in
          with Google.
        </p>
        <p>
          <strong className="text-ink">Your Google Calendar busy times:</strong> only the <em>start and end times</em> of events in the
          calendars you selected, for the next 14 days. We never read event titles, descriptions, locations or
          attendees. All-day, cancelled and declined events are ignored.
        </p>
        <p>
          <strong className="text-ink">Plans in your Google Calendar:</strong> when you tap &quot;I&apos;m in&quot; on a plan, we add that
          plan as an event to your primary Google Calendar; if you back out or the plan is cancelled, we remove it.
          To do this we keep a Google access token on our servers. It is never sent to your browser or to anyone
          else.
        </p>
        <p>
          <strong className="text-ink">Your area and interests:</strong> the first three characters of your postal code (for example
          &quot;H2T&quot;, a neighbourhood, never your address) and the interests you pick.
        </p>
        <p>
          <strong className="text-ink">What you do in the app:</strong> your friends, the plans you make or are invited to and your
          answers, and the cards you skip, save or plan, which we use to learn what you like.
        </p>
        <p>
          <strong className="text-ink">Photos:</strong> photos you add to a plan. They are stored privately and shown only to the members
          of that plan, through links that expire after an hour.
        </p>
        <p>
          <strong className="text-ink">Location, only if you turn it on:</strong> from 30 minutes before a plan to 30 minutes after its
          start. Other members only see a status (&quot;8 min away&quot;, &quot;running late&quot;, &quot;arrived&quot;), never your
          coordinates. Location data is deleted after the plan.
        </p>
      </Section>

      <Section title="How we use it">
        <p>
          Only to run Sidequest: find times when you and your friends are free, suggest places and events, send
          invites and live updates to the people in a plan, keep plans in your Google Calendar in sync, and learn from
          your choices to improve your suggestions. Your friends see your name and picture, whether you&apos;re free
          for a suggested time (never what you&apos;re busy with), and your travel time to a place.
        </p>
      </Section>

      <Section title="Services we use">
        <p>
          <strong className="text-ink">Supabase</strong> (database, sign-in and photo storage) and <strong className="text-ink">Vercel</strong> (hosting) store and
          serve the app&apos;s data. <strong className="text-ink">Google</strong> provides sign-in and Calendar.{" "}
          <strong className="text-ink">Anthropic (Claude)</strong> writes the one-line description on each suggestion: it receives the
          place, the time, the first names of the friends who are free, travel times and the weather, never your
          calendar or location. <strong className="text-ink">OpenRouteService</strong> turns your postal-code area into a map point
          and computes travel times. <strong className="text-ink">Open-Meteo</strong> provides weather (no personal data is sent).
        </p>
        <p>
          Sidequest&apos;s use and transfer of information received from Google APIs adheres to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className="font-semibold text-ink underline underline-offset-2"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Every database table is protected so that you can only reach your own data and the plans you&apos;re part
          of. Data is encrypted in transit (HTTPS). Google tokens and location data are only accessible to our
          servers.
        </p>
      </Section>

      <Section title="Your choices and deleting your data">
        <p>
          You can sign out at any time from the You tab, change your area and interests there, remove friends, and
          leave or cancel plans. You can revoke Sidequest&apos;s access to your Google account at any time in your{" "}
          <a href="https://myaccount.google.com/permissions" className="font-semibold text-ink underline underline-offset-2">
            Google account permissions
          </a>
          .
        </p>
        <p>
          To delete your account and all your data, email us at{" "}
          <a href={`mailto:${CONTACT}`} className="font-semibold text-ink underline underline-offset-2">
            {CONTACT}
          </a>
          . We delete it within 30 days.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Sidequest was built by a student team at McGill CodeJam 16. Questions about this policy:{" "}
          <a href={`mailto:${CONTACT}`} className="font-semibold text-ink underline underline-offset-2">
            {CONTACT}
          </a>
          .
        </p>
      </Section>
    </main>
  );
}
