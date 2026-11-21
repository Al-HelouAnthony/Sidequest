"use client";
/**
 * DEV ONLY. Interactive showcase of components/ui. Delete with app/dev/ before freeze.
 */
import { useEffect, useState } from "react";
import { mockUsers } from "@/lib/mocks/users";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { PriceLevel } from "@/components/ui/PriceLevel";
import { Skeleton } from "@/components/ui/Skeleton";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import { WeatherBadge } from "@/components/ui/WeatherBadge";
import { cn, focusRing } from "@/components/ui/classes";

const [sam, maya, karim, antoine, lea] = mockUsers;
const friends = [maya, karim, antoine, lea];

/** Tag vocabulary from PLAN.md §6.3, for the interest picker demo. */
const TAGS = [
  "coffee", "cheap-eats", "views", "outdoors", "bars", "live-music", "art", "museums",
  "markets", "brunch", "iconic", "free", "late-night", "cocktails", "nature",
];

const SWATCHES = [
  { name: "canvas", className: "bg-canvas" },
  { name: "surface", className: "bg-surface" },
  { name: "raised", className: "bg-raised" },
  { name: "ink", className: "bg-ink" },
  { name: "ink-muted", className: "bg-ink-muted" },
  { name: "accent", className: "bg-accent" },
  { name: "teal", className: "bg-teal" },
  { name: "peach", className: "bg-peach" },
  { name: "warning", className: "bg-warning" },
  { name: "danger", className: "bg-danger" },
];

const WEATHER = [
  { icon: "sun", tempC: 4, rainProb: 5 },
  { icon: "partly", tempC: 2, rainProb: 20 },
  { icon: "cloud", tempC: -1, rainProb: 15 },
  { icon: "rain", tempC: 2, rainProb: 80 },
  { icon: "snow", tempC: -6, rainProb: 60 },
  { icon: "storm", tempC: 9, rainProb: 90 },
  { icon: "fog", tempC: 1, rainProb: 10 },
];

const CEL_ICONS = /** @type {const} */ (["pin", "clock", "walk", "friends", "heart", "info", "sun", "rain"]);

const THEMES = /** @type {const} */ (["system", "light", "dark"]);

const PHOTO = "https://picsum.photos/seed/olimpico/800/1400";

export function UiShowcase() {
  return (
    <ToastProvider>
      <Showcase />
    </ToastProvider>
  );
}

/** @param {{ title: string, children: React.ReactNode }} props */
function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

/** Theme switch for testing both palettes. Sets <html data-theme>, removed when you leave the page. */
function ThemeSwitch() {
  const [theme, setTheme] = useState(/** @type {(typeof THEMES)[number]} */ ("system"));

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    return () => root.removeAttribute("data-theme");
  }, [theme]);

  return (
    <div role="radiogroup" aria-label="Theme" className="cel-sm inline-flex gap-1 rounded-full p-1">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          onClick={() => setTheme(t)}
          className={cn(
            "min-h-11 rounded-full px-4 text-sm font-bold capitalize transition-colors",
            theme === t ? "bg-ink text-canvas" : "text-ink-muted hover:text-ink",
            focusRing,
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function Showcase() {
  const toast = useToast();
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [slot, setSlot] = useState("5:30");
  const [invitees, setInvitees] = useState(() => new Set([maya.id, karim.id]));
  const [interests, setInterests] = useState(() => new Set(["coffee", "views"]));
  const [filters, setFilters] = useState(["Cheap", "With Maya", "Sat night"]);

  // Fake request for the loading-button demo.
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 1500);
    return () => clearTimeout(t);
  }, [loading]);

  /** @param {Set<string>} set @param {string} value */
  const toggled = (set, value) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <main className="mx-auto w-full max-w-md space-y-10 px-4 pt-safe pb-24">
      <header className="space-y-3 pt-2">
        <p className="text-[13px] font-semibold text-ink-muted">Dev only · test at 390×844</p>
        <h1 className="font-display text-5xl leading-[0.9] font-extrabold tracking-[-0.03em]">Sidequest UI kit</h1>
        <p className="text-sm text-ink-muted">
          Everything in <code className="font-mono font-semibold text-ink">components/ui</code>, in the cel-shaded
          island style.
        </p>
        <ThemeSwitch />
      </header>

      <Section title="Colour tokens">
        <ul className="grid grid-cols-5 gap-3">
          {SWATCHES.map((s) => (
            <li key={s.name} className="space-y-1.5">
              <div className={`h-12 rounded-2xl border-[1.5px] border-line shadow-cel-sm ${s.className}`} />
              <p className="truncate text-[11px] font-medium text-ink-muted">{s.name}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <div className="cel space-y-2 rounded-card p-5">
          <p className="font-display text-[42px] leading-none font-extrabold tracking-[-0.02em] tabular-nums">
            4:30 – 7:00 PM
          </p>
          <p className="font-display text-[28px] leading-[1.02] font-extrabold">Kondiaronk Lookout</p>
          <p className="text-base font-bold">Sat 2:00–3:30 PM</p>
          <p className="text-base">You, Maya and Karim are all free, and it&apos;s sunny.</p>
          <p className="text-sm text-ink-muted">Muted: secondary info, labels, timestamps</p>
        </div>
      </Section>

      <Section title="Surfaces">
        <div className="grid grid-cols-2 gap-3">
          <div className="cel flex h-24 items-end rounded-card p-4 text-sm font-bold">cel · rounded-card</div>
          <div className="cel-sm flex h-24 items-end rounded-tile p-4 text-sm font-bold">cel-sm · rounded-tile</div>
        </div>
        <div className="relative h-36 overflow-hidden rounded-card border-[1.5px] border-line bg-teal">
          <div aria-hidden="true" className="absolute top-6 left-0 h-3 w-full bg-canvas" />
          <div aria-hidden="true" className="absolute top-0 left-24 h-full w-3 bg-canvas" />
          <div aria-hidden="true" className="absolute top-3 right-6 size-16 rounded-full border-[1.5px] border-line bg-accent" />
          <nav aria-label="Glass bar example" className="glass absolute inset-x-3 bottom-3 grid grid-cols-3 rounded-[30px] p-1.5">
            {["Feed", "Plans", "You"].map((label, i) => (
              <span
                key={label}
                className={cn(
                  "flex min-h-11 items-center justify-center rounded-3xl text-xs font-bold",
                  i === 0 ? "border border-white/60 bg-teal text-on-teal" : "text-ink/75",
                )}
              >
                {label}
              </span>
            ))}
          </nav>
        </div>
        <p className="text-sm text-ink-muted">
          <code className="font-mono">glass</code> for floating bars, <code className="font-mono">glass-photo</code> for
          things on a photo.
        </p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button trailingIcon={<Icon name="arrowRight" strokeWidth={2.5} className="size-4" />}>Let&apos;s go</Button>
          <Button variant="secondary">Can&apos;t make it</Button>
          <Button variant="ghost">Not now</Button>
          <Button disabled>Disabled</Button>
          <Button loading={loading} onClick={() => setLoading(true)}>
            {loading ? "Sending…" : "Tap to load"}
          </Button>
        </div>
        <div className="flex gap-2">
          {["4:45", "5:30", "6:00"].map((t) => (
            <Button
              key={t}
              variant={slot === t ? "dark" : "secondary"}
              aria-pressed={slot === t}
              onClick={() => setSlot(t)}
              className="flex-1 rounded-2xl tabular-nums"
            >
              {t} PM
            </Button>
          ))}
        </div>
        <Button size="lg" fullWidth leadingIcon={<Icon name="check" strokeWidth={3} />}>
          I&apos;m in
        </Button>
      </Section>

      <Section title="Icon buttons">
        <div className="flex flex-wrap items-center gap-3">
          <IconButton label="Back" icon={<Icon name="back" />} variant="solid" />
          <IconButton label="Info" icon={<Icon name="info" />} variant="solid" />
          <IconButton label="Close" icon={<Icon name="x" />} variant="ghost" />
          <IconButton label="Add friend" icon={<Icon name="plus" strokeWidth={2.5} />} variant="accent" />
          <IconButton
            label="Swipe down to send"
            icon={
              <span className="motion-safe:animate-nudge">
                <Icon name="arrowDown" strokeWidth={2.6} />
              </span>
            }
            variant="dark"
            size="lg"
          />
          <IconButton
            label="Save"
            pressed={saved}
            variant="solid"
            onClick={() => setSaved((s) => !s)}
            icon={
              <span key={saved ? "on" : "off"} className={saved ? "motion-safe:animate-pop" : ""}>
                <Icon name="heart" cel={saved} />
              </span>
            }
          />
          <span className="text-sm text-ink-muted">← tap the heart</span>
        </div>
      </Section>

      <Section title="Icons (cel fill)">
        <div className="cel-sm flex flex-wrap items-center gap-4 rounded-tile p-4">
          {CEL_ICONS.map((name) => (
            <Icon key={name} name={name} cel className="size-7" />
          ))}
        </div>
      </Section>

      <Section title="On a photo">
        <div className="relative h-80 overflow-hidden rounded-card border-[1.5px] border-line shadow-cel">
          {/* eslint-disable-next-line @next/next/no-img-element -- dev page */}
          <img src={PHOTO} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/20 to-black/30" />
          <div className="absolute inset-x-4 top-4 flex items-center justify-between">
            <WeatherBadge icon="sun" tempC={4} rainProb={5} />
            <IconButton label="Why am I seeing this?" icon={<Icon name="info" />} />
          </div>
          <div className="absolute inset-x-4 bottom-4 space-y-3">
            <p className="font-display text-3xl leading-[0.95] font-extrabold text-white">Café Olimpico</p>
            <div className="flex items-center gap-2">
              <AvatarStack people={[maya, karim]} size="sm" tone="photo" />
              <Chip tone="glass">Maya 8 min · Karim ~4 min</Chip>
            </div>
            <div className="flex items-center gap-3">
              <IconButton label="Skip" icon={<Icon name="x" strokeWidth={2.5} />} size="lg" />
              <IconButton
                label="Save"
                size="lg"
                pressed={saved}
                onClick={() => setSaved((s) => !s)}
                icon={<Icon name="heart" filled={saved} className={saved ? "text-accent" : ""} />}
              />
              <Button size="lg" className="flex-1" trailingIcon={<Icon name="arrowRight" strokeWidth={2.5} className="size-4" />}>
                Let&apos;s go
              </Button>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Avatars">
        <div className="flex items-end gap-3">
          <Avatar src={sam.avatarUrl} name={sam.name} size="sm" />
          <Avatar src={maya.avatarUrl} name={maya.name} size="md" />
          <Avatar src={karim.avatarUrl} name={karim.name} size="lg" />
          <Avatar src={antoine.avatarUrl} name={antoine.name} size="xl" />
          <Avatar src="https://invalid.example/broken.png" name="Broken Image" size="lg" />
          <Avatar name="Léa Tremblay" size="lg" />
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <AvatarStack people={[maya]} />
          <AvatarStack people={[maya, karim]} />
          <AvatarStack people={[maya, karim, antoine]} size="lg" />
          <AvatarStack people={friends} />
        </div>
      </Section>

      <Section title="Chips">
        <div className="flex flex-wrap gap-2">
          <Chip>café</Chip>
          <Chip>outdoor</Chip>
          <Chip selected>confirmed</Chip>
          <Chip icon={<Icon name="clock" className="size-3.5" />}>~12 min</Chip>
        </div>
        <p className="text-sm text-ink-muted">Toggle (interests):</p>
        <div className="flex flex-wrap gap-2.5">
          {TAGS.map((tag) => (
            <Chip key={tag} selected={interests.has(tag)} onClick={() => setInterests((s) => toggled(s, tag))}>
              {tag}
            </Chip>
          ))}
        </div>
        <p className="text-sm text-ink-muted">Removable (search filters):</p>
        <div className="flex flex-wrap gap-2.5">
          {filters.length ? (
            filters.map((f) => (
              <Chip key={f} onRemove={() => setFilters((list) => list.filter((x) => x !== f))}>
                {f}
              </Chip>
            ))
          ) : (
            <Button variant="ghost" onClick={() => setFilters(["Cheap", "With Maya", "Sat night"])}>
              Reset filters
            </Button>
          )}
        </div>
      </Section>

      <Section title="Price level">
        <div className="flex gap-6 text-lg">
          {[1, 2, 3, 4].map((n) => (
            <PriceLevel key={n} level={n} />
          ))}
        </div>
      </Section>

      <Section title="Weather badge">
        <div className="flex flex-wrap gap-2">
          {WEATHER.map((w) => (
            <WeatherBadge key={w.icon} {...w} variant="solid" />
          ))}
        </div>
      </Section>

      <Section title="Skeleton (feed card loading)">
        <div className="cel relative h-72 overflow-hidden rounded-card p-4">
          <span className="sr-only">Loading…</span>
          <Skeleton className="h-8 w-24 rounded-full" />
          <div className="absolute inset-x-4 bottom-4 space-y-3">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-3 pt-2">
              <Skeleton className="size-14 rounded-full" />
              <Skeleton className="size-14 rounded-full" />
              <Skeleton className="h-14 flex-1 rounded-button" />
            </div>
          </div>
        </div>
      </Section>

      <Section title="Bottom sheet + toasts">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setSheetOpen(true)}>Open sheet</Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast.show({
                message: "Skipped Café Olimpico",
                action: { label: "Undo", onClick: () => toast.show({ message: "Back in your feed", tone: "success" }) },
              })
            }
          >
            Toast + Undo
          </Button>
          <Button variant="secondary" onClick={() => toast.show({ message: "Plan confirmed!", tone: "success" })}>
            Success
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast.show({
                message: "Couldn't save. Check your connection.",
                tone: "error",
                action: { label: "Retry", onClick: () => {} },
              })
            }
          >
            Error
          </Button>
        </div>
      </Section>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Invite friends"
        description="Café Olimpico · Sat 2:00–3:00 PM"
        footer={
          <Button
            size="lg"
            fullWidth
            disabled={invitees.size === 0}
            onClick={() => {
              setSheetOpen(false);
              toast.show({ message: `Invite sent to ${invitees.size} friend${invitees.size === 1 ? "" : "s"}`, tone: "success" });
            }}
          >
            {invitees.size === 0 ? "Pick at least one friend" : `Send invite (${invitees.size})`}
          </Button>
        }
      >
        <ul className="space-y-2.5 pb-1">
          {friends.map((f) => {
            const on = invitees.has(f.id);
            return (
              <li key={f.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setInvitees((s) => toggled(s, f.id))}
                  className={cn(
                    "press flex min-h-16 w-full items-center gap-3 rounded-tile px-3 text-left",
                    on ? "bg-surface" : "bg-canvas opacity-75",
                    focusRing,
                  )}
                >
                  <Avatar src={f.avatarUrl} name={f.name} size="lg" decorative />
                  <span className="flex-1 font-bold">{f.name}</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-flex size-7 items-center justify-center rounded-full border-[1.5px] border-line transition-colors",
                      on ? "bg-accent text-on-accent" : "bg-surface",
                    )}
                  >
                    {on && (
                      <span className="motion-safe:animate-pop">
                        <Icon name="check" strokeWidth={3.5} className="size-3.5" />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    </main>
  );
}
