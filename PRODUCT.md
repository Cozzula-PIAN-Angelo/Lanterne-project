# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Friends and acquaintances who no longer hear from each other often (a week or more) and want to stay close without calls and without the usual small-talk messages on existing platforms. They use Lanterne mostly on their phone, installed as a PWA: during the day to leave fragments of their day, in the evening to listen to what arrived.

Two audiences weigh equally on how the product looks:
- the people who use it, for whom the evening ritual must feel calm, intimate and readable, also in the dark;
- people evaluating the project as a full-stack portfolio piece (README, demo users, screenshots), who should grasp it at first sight.

## Product Purpose

An evening ritual of listening and sharing between two people, not a chat. During the day each person leaves "lanterns" (voice notes, photos, short texts, preset thoughts); at an agreed time in the evening they arrive and can be listened to. Success: a person opens the app at their evening time, listens, reacts or keeps something, and feels close to someone without having had to write a reply.

## Positioning

Asynchronous, time-shifted closeness: content is sealed until an agreed local clock time, then arrives all at once and fades by morning. No conversation threads, no replies, no reciprocity required. Each person lives the arrival in their own local time.

## Operating Context

- Each user has at most 5 connections; each connection is a separate channel between two people, born from an invite.
- The arrival time is agreed by the pair, between 17:00 and midnight, and lived in each person's local time zone.
- Day: leave lanterns. Evening at the agreed time: they arrive. Next morning at 06:00 (at least 8 hours after arrival): they disappear unless kept.
- The phone is the main device; the app also works on desktop.

## Capabilities and Constraints

- Lantern types: voice (up to 10 minutes, the main gesture), photo (one per lantern), text (up to 1000 characters), thought (a short preset phrase).
- One reaction per lantern from 💛 🫂 😂 😮 🌙; only the recipient reacts. The recipient can keep a lantern; kept lanterns go to Memories.
- Closing and blocking a connection; deleting the account.
- Web push notification when lanterns arrive; offline queue for recordings.
- Optional location, used only on the device, to follow the real sunset.
- Interface language: Italian. Time shown in local time; midnight written as "stanotte a mezzanotte", never "00:00".
- Stack already in place: Next.js 16 (App Router), Tailwind CSS 4, shadcn/ui base components, CSS animations.
- Not yet hosted online: a portfolio project that runs locally with demo users (Giulia, Marco, Sara) and a development "time travel" panel.
- Open: the name "Lanterne" is provisional; the final visual identity is not decided.

## Brand Commitments

- The channel between two people is a lake: the other person's shore is far away, your own is close; their lanterns arrive from their shore and float lit on the water. This metaphor is binding.
- Voice: calm, plain Italian, never blaming, no pressure, no guilt-inducing counters or streaks.
- Not binding for the visual redesign (confirmed by the user on 2026-11-13): the current lantern encoding (colour = person, shape = type, size = length), the 8 personal colours, and the name.
- Signature, identical in every theme (user, 2026-11-13): the lake is the meeting point between two people, the place every message must cross to reach the other. Two elements carry it: the composition of the lake (the other person's shore far, your own near, the water between) and the moment of arrival (at the agreed time the scene turns to evening and the lanterns cross the lake from the other shore). Lantern drawing, typeface and palette may change with the theme.
- Warm and human, always (user, 2026-11-16): every screen, in every hour and every theme, should feel warm and inhabited, never clinical. The sky and the water may be cold and real (a winter morning is blue), but what the person touches stays warm: warm neutrals instead of grey or icy surfaces, warm-dark evenings instead of navy, lantern light as the accent, places with a human trace (jetties, lit windows, a lantern you light to invite someone) instead of map pins or boxes, names written in the scene.

## Themes

- The user chooses a theme in Settings; the theme covers the whole app (lake, home, invites, Memories, settings), not only the channel.
- Plan agreed on 2026-11-13: one main theme built in full now, with the app structured for themes (shared signature in the scene code, theme as tokens plus a material "skin" of the lake). A second theme comes later.
- How the main theme reaches the other pages (user, 2026-11-16):
  - Home is one lake with many shores: a single panorama where each person is a light on the far shore with their arrival time; tapping a light opens that person's channel.
  - Pages outside the lake (home chrome, Memories, settings, invites) follow the sky: light with water and mist tones by day, dark like the night print in the evening and at night, on the same clock as the scene.
  - Memories are lanterns resting on your own shore: the kept lanterns lie on the pebbles and you tap one to listen again.

## Evidence on Hand

- Demo data: users Giulia, Marco and Sara with connections and lanterns in different states (`lib/demo/seed.ts`).
- Design spec: `docs/superpowers/specs/2026-11-02-lanterne-design.md`.
- Early mood mockups (not shipped, gitignored): `.superpowers/brainstorm/1811-1793568907/content/`, including the chosen lake concept `lago-giorno.html`.
- No real users, testimonials or usage data exist. Do not fabricate any.

## Product Principles

1. Listening, not conversing: at most a reaction, never a reply box.
2. No pressure: nothing that makes someone feel behind, absent or guilty.
3. Ephemeral by default: what arrives in the evening is gone by morning unless kept.
4. Local time is always the reference for what the user sees.
5. Privacy by design: private media, no tracking, location never leaves the phone.

## Accessibility & Inclusion

- WCAG AA contrast in every sky phase, resizable text.
- With `prefers-reduced-motion`, lanterns stand still in a row.
- Every lantern is a button with a screen-reader label such as "Vocale di Giulia, 3 minuti, delle 9:14".
