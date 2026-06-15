# BackyardBoard — Project Overview (AI context)

This doc orients an AI assistant working in this codebase. It complements `README.md`
(setup, full file tree) with architecture, conventions, and gotchas. Read this before
making non-trivial changes, especially to `instant.schema.ts` / `instant.perms.ts`.

---

## 1. What it is

BackyardBoard is an Expo / React Native app for tracking routes on a home climbing
board: users photograph their board, mark hold positions to define routes, log
ascents, organise routes into shareable playlists, and follow progress over time.
Backend is InstantDB (real-time client-side DB with schema-driven permissions).

---

## 2. Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Expo (SDK 54) + Expo Router | `expo ~54.0.35`, `expo-router ~6.0.24` |
| Language | TypeScript | `~5.9.2` |
| UI / styling | NativeWind (Tailwind for RN) | `nativewind ^4.1.23`, `tailwindcss ^3.4.17` |
| Backend / DB | InstantDB (client + admin SDKs) | `@instantdb/react-native` / `@instantdb/admin` (latest) |
| Gestures | React Native Gesture Handler | `~2.28.0` |
| Animation | React Native Reanimated (+ worklets) | `~4.1.1` / `0.5.1` |
| Images | Expo Image, Expo Image Picker, Expo Image Manipulator | `~3.0.8` / `~17.0.11` / `~14.0.8` |
| Camera | Expo Camera | `~17.0.10` |
| React | React 19 / React Native 0.81 | `19.1.0` / `0.81.5` |

---

## 3. Where things live

### `app/` (Expo Router file-based routes)

| File | Purpose |
|------|---------|
| `_layout.tsx` | Root layout. Gates the whole app on `db.useAuth()` (loading → `LoginScreen` → main `Stack`). Wraps everything in `ThemeProvider` + `GestureHandlerRootView` + `ErrorBoundary`. Mounts `OnboardingModal` and `UsernamePromptModal` globally. Declares all top-level `Stack.Screen`s (modals for create/edit route, headerless screens for board photo + verify routes + route detail). |
| `(tabs)/_layout.tsx` | Bottom tab bar — Routes + Profile. |
| `(tabs)/index.tsx` | Routes list for the selected board: search (`@username` search vs. name/route search), grade-filter pills, sort by grade/ascents, infinite-scroll pagination (`PAGE_SIZE = 50`). A **"Playlists" toggle** mixes public playlists (+ the user's own) into the same `FlatList` as `PlaylistCard` items, interleaved before the routes. |
| `(tabs)/profile.tsx` | User email/username, board picker/creation, "Update board photo" (creator-only), playlist management (create/rename/delete, swipe-to-delete), liked routes, stats, dark/light toggle. New playlists are created with `visibility: "private"`. |
| `route/[id].tsx` | Route detail: board photo + hold overlay, pinch-zoom/pan, swipe between routes, ascent logging, likes, comments, "Add to playlist" sheet. |
| `playlist/[id].tsx` | Playlist detail: drag-to-reorder, swipe-to-remove, owner-only settings gear (visibility / public-access modal). See §5. |
| `create-route.tsx` | Modal — place hold markers on the board photo to define a new route. Top bar has a close button and a help modal (colour legend + placing/sizing/sequence/saving guide, themed for dark/light); a "Sequence" toggle auto-numbers blue holds in placement order (`sequence` field); form includes a Match/No-match toggle (`allowMatch`). |
| `edit-route.tsx` | Modal — edit an existing route's holds/name/grade/Match setting. |
| `update-board-photo.tsx` | Camera screen to (re)capture the board photo. See §7. |
| `verify-routes.tsx` | After a new board photo, the first route auto-selects; drag hold dots to correct misaligned positions; a persistent "Next route" pill cycles through routes. See §7. |

### `components/`

| File | Purpose |
|------|---------|
| `LoginScreen.tsx` | Magic-code email auth UI. |
| `ErrorBoundary.tsx` | Class component catching render errors, shows a scrollable error screen. |
| `OnboardingModal.tsx` | First-run swipeable intro slides, gated by AsyncStorage flag `@homeboard_onboarding_done`. |
| `UsernamePromptModal.tsx` | Forces a username pick post-signup (sanitizes to `[a-z0-9_]`). |
| `HoldOverlay.tsx` | Hold dot rendering: colours (`HOLD_COLORS`), sizes (`HOLD_SIZES`), `ContainArea`/`Hold` types, `colorWithAlpha`. |
| `RouteCard.tsx` | Route list item (grade badge, name, ascent count). |
| `PlaylistCard.tsx` | **New.** Playlist list item (indigo theme, `albums` icon, route count, owner `@username`/email, "Playlist" badge). Used in the routes list when "Playlists" toggle is on. |

### `lib/`

| File | Purpose |
|------|---------|
| `db.ts` | `init({ appId, schema })` — the shared InstantDB client. Throws if `EXPO_PUBLIC_INSTANT_APP_ID` is unset. |
| `grades.ts` | `GRADES` (V0–V12+), `gradeIndex`, `gradeBadgeColor`. |
| `holdUtils.ts` | Duplicate-ish `Hold`/`HoldColor`/`HoldSize`/`ContainArea` types + helpers, independent from `HoldOverlay.tsx`'s copies — **note the duplication** if touching hold types (including the optional `sequence?: number` field on blue holds), both need updating. |
| `imageUtils.ts` | `prepareImage` — resizes/validates a captured/picked image (`MAX_DIMENSION = 1920`, `MAX_BYTES = 15MB`) before upload; `ImageValidationError`. |

### `contexts/ThemeContext.tsx`

Holds `isDark` + `toggleTheme`. Persists to AsyncStorage (`@theme_preference`) and calls
`Appearance.setColorScheme` so NativeWind `dark:` classes and `useColorScheme()` both
update immediately. Defaults to the system scheme on first run.

### `instant.schema.ts` / `instant.perms.ts`

Schema and permission rules pushed to InstantDB via `npx instant-cli push schema|perms --yes`.
See §4–6.

---

## 4. Data model (`instant.schema.ts`)

Entities and key fields:

| Entity | Key fields | Notes |
|--------|-----------|-------|
| `$users` | `email` (unique), `username` (unique), `imageURL`, `type` | `type`/`linkedPrimaryUser`/`linkedGuestUsers` suggest guest-auth support exists in schema (not explored here). |
| `boards` | `name` (unique), `country`, `description`, `createdAt` | |
| `routes` | `name`, `grade`, `holds` (JSON string of hold positions), `allowMatch` (optional bool), `description`, `createdAt` | See below |
| `ascents` | `attempts`, `loggedAt` | |
| `comments` | `text`, `createdAt` | |
| `likes` | `createdAt` | |
| `playlists` | `name`, `routeOrder` (JSON array of route IDs), `visibility` (optional string), `publicAccess` (optional string) | See below |
| `$files` | `path` (unique), `url` | Instant Storage; used for board photos |

**`playlists.visibility`** is `"public" | "private"` but is `optional()` — a playlist
with no `visibility` set (e.g. created before this feature, or any future write that
omits it) is treated as **`"private"`** everywhere it's read (both in
`instant.perms.ts` and `playlist/[id].tsx`), via `?? "private"` / explicit
`== 'public'` checks that fail closed. New playlists are created with
`visibility: "private"` explicitly (`profile.tsx`).

**`playlists.publicAccess`** is `"view" | "edit"`, only meaningful when
`visibility === "public"`; defaults to `"view"` (`?? "view"` in the UI, and the
permission rule only grants extra access when `publicAccess == 'edit'`).

**`routes.allowMatch`** is `optional()`; reads use `?? true` (`route/[id].tsx`,
`edit-route.tsx`) so existing routes without the field default to match-allowed.
Set explicitly on create (`create-route.tsx`, defaults the form state to `true`) and
editable on `edit-route.tsx`; shown on route detail as a "Match"/"No-match" badge.

**`routes.holds`** entries may include an optional `sequence?: number` on blue holds
— set via create-route's "Force sequence" toggle, which auto-numbers each new blue
hold in placement order and renumbers consecutively when a sequenced hold is removed.
Rendered as an order number next to the hold in both create-route and route detail.

Key relations:

- `boards.routes` (many) / `routes.board` (one)
- `boards.playlists` (many) / `playlists.board` (one)
- `playlists.routes` (many) ↔ `routes.playlists` (many) — many-to-many, link name `playlistsRoutes`
- `playlists.creator` (one `$users`) / `$users.playlists` (many)
- `routes.creator`, `routes.ascents`, `routes.likes`, `routes.comments`
- `$users.selectedBoard` (one) — the board currently shown in the Routes tab
- `boards.photo` → `$files` (one)

---

## 5. Playlist sharing model

State derived in `playlist/[id].tsx`:

```ts
const isOwner = playlist?.creator?.id === user?.id;
const visibility = playlist?.visibility ?? "private";
const publicAccess = playlist?.publicAccess ?? "view";
const canEdit = isOwner || (visibility === "public" && publicAccess === "edit");
```

- **Private** (default): only the owner can `view` the playlist at all (enforced by
  `instant.perms.ts`, not just hidden in UI).
- **Public + view-only**: any board user can open it and see routes/order, but
  `canEdit` is false — drag-reorder and swipe-to-remove are disabled
  (`SwipeableRouteRow`'s pan gesture is `.enabled(!showHandle && canEdit)`, and the
  remove-button overlay only renders `{!anyDragging && canEdit && ...}`).
- **Public + edit**: `canEdit` is true for *any* board user, not just the owner —
  they can drag-reorder (writes `routeOrder`) and swipe-remove (unlinks a route +
  rewrites `routeOrder`).
- **Settings gear**: `headerRight` on the `Stack.Screen` only renders the gear
  (`settings-outline`) `isOwner ? () => <...> : undefined` — non-owners never see it,
  regardless of `canEdit`. The gear opens a modal with two segmented controls:
  - Visibility: Private / Public → `setVisibility()`
  - Public access (shown only if Public): View only / Can edit → `setPublicAccess()`

  Switching to Public for the first time also sets `publicAccess: "view"` if unset.

- **Routes list "Playlists" toggle** (`(tabs)/index.tsx`): when on, `visiblePlaylists`
  = playlists where `visibility === "public" || creator?.id === user?.id` (so a user
  always sees their own private playlists too, but not other users' private ones).
  These are further filtered by the search box against `pl.name` (skipped if the
  search is a `@username` search). Rendered as `PlaylistCard`s, interleaved before
  the route cards in the same `FlatList`, navigating to `/playlist/[id]` on tap.

### Gap: no UI to add routes to someone else's public-edit playlist

`route/[id].tsx`'s "Add to playlist" sheet only lists `currentUser?.playlists`
(the signed-in user's *own* playlists) — `togglePlaylist()` links/unlinks against
that list only. A non-owner with `canEdit` on someone else's public+edit playlist
can therefore reorder/remove existing routes from `playlist/[id].tsx`, but has **no
UI path to add a new route** to that playlist — even though the permission rules
(§6) would allow it. This looks like a real (if minor) gap between what permissions
allow and what the UI exposes.

---

## 6. Permissions & sharp edges (`instant.perms.ts`)

### `playlists`

```ts
bind: [
  "isOwner", "auth.id != null && auth.id in data.ref('creator.id')",
  "isPublicEditor", "data.visibility == 'public' && data.publicAccess == 'edit'",
  "onlyModifiesRoutes", "request.modifiedFields.all(field, field in ['routes', 'routeOrder'])",
],
allow: {
  view:   "isOwner || data.visibility == 'public'",
  create: "auth.id != null",
  update: "isOwner || (isPublicEditor && onlyModifiesRoutes)",
  delete: "isOwner",
}
```

- View: owner or any public playlist (private playlists are invisible to non-owners
  at the DB level, not just hidden in UI).
- Update: owner can change anything (name, visibility, publicAccess, routes,
  routeOrder, etc.). A non-owner can only update a public+edit playlist, and only if
  the transaction touches `routes`/`routeOrder` — an **allowlist**, so renaming or
  changing visibility/access by a non-owner is rejected even if attempted.
- Delete: owner only.

### `routes`

```ts
bind: [
  "isCreator", "auth.id != null && auth.id in data.ref('creator.id')",
  "onlyModifiesLinks", "request.modifiedFields.all(field, field in ['ascents', 'likes', 'comments', 'playlists'])",
],
allow: {
  view:   "true",
  create: "auth.id != null",
  update: "isCreator || (auth.id != null && onlyModifiesLinks)",
  delete: "isCreator",
}
```

- Anyone signed in can create routes; only the creator can edit route content
  (name/grade/holds/etc.) or delete it.
- A non-creator can still update a route, but **only** via the allowlisted link
  fields `ascents`, `likes`, `comments`, `playlists` — i.e. logging an ascent,
  liking, commenting, or (un)linking the route to/from a playlist.

### Link-permission gotcha (resolved, but easy to re-break)

InstantDB checks the `update` permission on **both** entities involved in a
link/unlink mutation. Adding/removing a route from a playlist therefore needs:

- `playlists.update` to allow the change on the **playlist** side
  (`onlyModifiesRoutes` allows `routes`/`routeOrder` changes by a public-edit
  non-owner), **and**
- `routes.update` to allow the change on the **route** side
  (`onlyModifiesLinks` includes `'playlists'`, so a non-creator's route can be
  (un)linked from a playlist they're editing).

Both sides are currently allowlisted correctly, so a non-owner editor on a
public+edit playlist *can* add/remove a route created by someone else. **If either
allowlist is tightened in the future** (e.g. removing `'playlists'` from
`routes.onlyModifiesLinks`, or `'routes'` from `playlists.onlyModifiesRoutes`),
this link operation will silently start failing with a permission error on
whichever side is missing — check both files together when editing either.

### `$files`

```ts
allow: {
  view:   "true",
  create: "auth.id != null && data.path.startsWith('boards/')",
  delete: "auth.id != null && data.path.startsWith('boards/')",
}
```
Board-photo uploads are path-scoped to `boards/`. The `delete` rule exists
specifically because the photo-update flow deletes the old `$files` record when
replacing a board photo — without it, re-uploading a board photo fails permission
checks.

### `$streams`

```ts
allow: {
  view:   "false",
  create: "false",
  update: "false",
  delete: "false",
}
```
Instant-managed system entity (storage stream-tracking), unused by app code and
already deny-by-default with no rules. This explicit block is documentation /
defense-in-depth — a functional no-op.

### `ascents` / `likes` / `comments`

All follow the same pattern: `view: "true"`, `create`/`delete` (and `update` for
comments) require `auth.id in data.ref('user.id')` — i.e. only the user who logged
the ascent / like / comment can remove or edit it.

### `$users` / `boards`

`$users`: viewable by all, only self can update, `email` field hidden from others
via field-level rule. `boards`: viewable by all, only the creator can update/delete.

---

## 7. Other subsystems

### Hold overlay (normalised coordinates)

Holds are stored as JSON (`routes.holds`) with `x`/`y` in **0–1 range**, relative to
the *displayed image content area*, not the raw container. `computeContain()`
(duplicated between `route/[id].tsx`/`verify-routes.tsx` style helpers and
`lib/holdUtils.ts`) figures out the letterboxed image rect (`contain` fit) inside its
container, and hold pixel position = `offset + (x|y) * (displayW|displayH)`. Hold
dots have a `HoldColor` (`red`/`purple`/`blue`/`green`) and `HoldSize`
(`small`/`medium`/`large`).

Blue holds may also carry an optional `sequence?: number` ("Force sequence" mode in
create-route). `HoldOverlay.tsx` and `route/[id].tsx`'s `renderHoldDots` both render
this number in a small badge next to the hold; create-route renumbers remaining
sequenced holds consecutively whenever one is removed.

### Gestures

- **Route detail**: pinch-zoom + pan (`Gesture.Simultaneous`), clamped to image
  bounds; horizontal fling swipes navigate between routes (two animated layers for
  slide transition).
- **Playlist reorder**: long-press on a drag handle (`activateAfterLongPress(150)`)
  starts a drag; a ghost card follows the finger via shared values
  (`ghostAbsoluteY`, `ghostOpacity`, etc.) while `LayoutAnimation` animates the rest
  of the list. The handle gesture is created once via `useMemo(() => ..., [])` and
  reads everything through refs to survive re-renders mid-drag.
- **Swipeable rows** (profile playlists, playlist-detail routes): `Gesture.Race(pan, tap)`
  — swipe left reveals a red "Remove" button; in `playlist/[id].tsx`, swipe right
  opens drag-handle mode. Both pan and the remove button are gated on `canEdit`.

### Auth

Magic-code email auth via `db.useAuth()` / InstantDB's built-in flow — no passwords.
Root layout shows `LoginScreen` while `!user`, and a loading spinner while
`isLoading` or fonts aren't loaded.

### Dark mode

`ThemeContext` (see §3) — toggle lives on the Profile screen; persisted across
sessions via AsyncStorage and reflected immediately via `Appearance.setColorScheme`.

### Board-photo flow

`update-board-photo.tsx`: live `CameraView` with an optional ghost overlay of the
*previous* board photo (opacity cycles via a pill button) to help align the new
photo. On capture (or a library pick via `pickFromLibrary`), `doUpload()`
resizes/validates the image (`prepareImage`), uploads to
`boards/<boardId>/<filename>`, links it to the board, and (if there was an old photo)
deletes the old `$files` record in the same transaction.

- **`pendingUploadRef`** tracks a `$files` record that's been uploaded but not yet
  linked to the board, so a failed link `transact` can retry the link without
  re-uploading, and an abandoned upload can be deleted instead of orphaning storage.
- **`inFlightRef`** is a synchronous guard inside `doUpload` against double-tap races
  — React state (`uploading`) doesn't update until the next render, so a fast
  double-tap could otherwise start two concurrent uploads.
- **Every exit path routes through `handleBack()`** — back-pill, iOS swipe, and
  Android hardware back:
  - iOS swipe-back is disabled via `<Stack.Screen options={{ gestureEnabled: false }} />`
    on the camera view.
  - Android hardware back is intercepted via
    `BackHandler.addEventListener("hardwareBackPress", ...)`, which calls
    `handleBack()` (no-op while `uploading`).
  - `handleBack()` cleans up `pendingUploadRef`: if the pending file's id equals
    `oldPhotoId` (the link transact may have applied server-side even though it
    threw, so this file is now the board's *live* photo), it just drops the
    reference rather than deleting it; otherwise it deletes the orphaned `$files`
    record.
  - If a photo has just been captured (`capturedUri` set, i.e. the
    upload-error/retry state), back instead **resets**
    `capturedUri`/`capturedDimensions`/`uploadError` and bumps `cameraKey` to remount
    `<CameraView key={cameraKey}>`, returning to a fresh capture-ready camera.
    Otherwise (no photo captured yet), back deletes the just-created board if `isNew`
    and calls `router.back()` — there is **no separate "Skip" button** in this
    screen.
- **`retry()`** uses `capturedUri ?? pendingUploadRef.current?.uri` — so retrying
  after a library-pick failure (where `capturedUri` is never set) still has a uri to
  re-upload from, instead of dead-ending.
- On successful upload: if the board has existing routes, navigates to
  `verify-routes`; otherwise back to `(tabs)`.

> **Gotcha**: any new exit path or async branch added to this screen must go through
> `handleBack()` (or replicate its `pendingUploadRef` cleanup and the
> `oldPhotoId` live-photo guard) — otherwise it can leak an unlinked `$files` record
> or delete the board's current photo. The `$files` `delete` permission (above)
> exists partly to support this cleanup.

`verify-routes.tsx`: on entry, the first route (board's routes sorted by name)
auto-selects itself, same as pressing "Next route". For the selected route, holds
render as `DraggableHold`s — drag a dot to correct its position (`modifiedHolds`,
saved as `routes.holds` JSON on save). Top bar has:
  - a "Back" pill (chevron-back → `goBackToCamera()`, returns to the camera to
    retake),
  - a persistent **"Next route"** pill (cycles through `routes` via
    `lastRouteIndex`, selecting + marking the next route as reviewed),
  - a Save/Done pill (warns via `Alert` if not all routes have been "checked").

---

## 8. Conventions

### Styling

NativeWind/Tailwind classes (`className`) for most layout/colour, with `dark:`
variants for dark mode (driven by `ThemeContext`, see §7). Some screens (camera
overlays, playlist drag UI) use `StyleSheet.create` + inline styles instead,
typically where dynamic/animated values or absolute positioning make Tailwind
awkward — both patterns coexist, follow whichever the file you're editing already
uses. Brand colour is indigo `#6366f1` throughout (buttons, active states, badges).

### Grades

`lib/grades.ts` — `GRADES` is the canonical V0–V12+ ordered list; always use
`gradeIndex()` for sorting/comparison and `gradeBadgeColor()` for badge colours
rather than hardcoding.

### InstantDB workflow

- Edit `instant.schema.ts` → `npx instant-cli push schema --yes` (renames need
  `--rename 'old:new'`).
- Edit `instant.perms.ts` → `npx instant-cli push perms --yes`.
- When changing playlist/route permissions, remember the link-permission gotcha in §6
  — check both sides of any link.

### Checks

- `npx tsc --noEmit` — typecheck (keep clean before considering a change done).
- `npm run lint` — ESLint (`expo lint`).
- `npm test` — Jest (`jest-expo` preset, matches `**/__tests__/**/*.test.ts`).
