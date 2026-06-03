# HomeBoard

A mobile app for tracking routes on your home climbing board. Set routes, log ascents, organise playlists, and follow progress over time — built for climbers who train at home.

---

## What it does

### Boards
A **board** represents a physical climbing wall. Each board has a name, country, and an optional photo uploaded directly from your phone. Multiple users can share and select the same board, making it easy to collaborate with training partners.

### Routes
Routes are set on a board by placing hold markers on the board photo. Each route has:
- A **name** and **grade** (V-scale, V0–V12+)
- **Hold positions** stored as JSON coordinates, rendered as coloured dots overlaid on the board photo
- A **creator** (the user who set it)

When viewing a route, you can pinch-to-zoom and pan the board photo, and swipe left/right to move between routes in the list.

### Ascents
When you complete a route, tap **Log ascent** and record how many falls/attempts it took. The app tracks:
- Total ascents per route
- Your personal ascents with timestamps
- Session detection (climbs within 1 hour are grouped as one session)
- Stats per grade and overall

### Playlists
Group routes into named playlists for a training session or project list. Within a playlist you can drag-and-drop to reorder routes, and swipe left to remove a route.

### Likes and comments
You can like routes and leave comments visible to everyone on the board.

### Profile
The profile screen shows your email, a customisable username, board management, playlists, liked routes, and a full statistics breakdown. It also has a **dark/light mode toggle** that persists across sessions.

---

## Screens

| Screen | File | Description |
|--------|------|-------------|
| Login | `components/LoginScreen.tsx` | Magic-code email authentication |
| Routes list | `app/(tabs)/index.tsx` | All routes on the selected board, with search, grade filters, and sort |
| Route detail | `app/route/[id].tsx` | Board photo with hold overlay, ascent logging, comments, likes |
| Create route | `app/create-route.tsx` | Set hold positions by tapping the board photo |
| Edit route | `app/edit-route.tsx` | Modify holds, name, and grade on an existing route |
| Playlist detail | `app/playlist/[id].tsx` | Routes in a playlist with drag-to-reorder and swipe-to-remove |
| Verify routes | `app/verify-routes.tsx` | Bulk-review routes (e.g. mark as active/retired) |
| Update board photo | `app/update-board-photo.tsx` | Replace the photo for the current board |
| Profile | `app/(tabs)/profile.tsx` | User settings, board management, playlists, stats |

---

## How it's built

### Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Expo](https://expo.dev) (SDK 54) with [Expo Router](https://expo.github.io/router) v6 for file-based navigation |
| Language | TypeScript |
| UI / styling | [NativeWind](https://www.nativewind.dev) v4 (Tailwind CSS for React Native) |
| Backend / database | [InstantDB](https://instantdb.com) — real-time client-side database with built-in auth and file storage |
| Gestures | [React Native Gesture Handler](https://docs.swmansion.com/react-native-gesture-handler/) |
| Animations | [React Native Reanimated](https://docs.swmansion.com/react-native-reanimated/) |
| Images | [Expo Image](https://docs.expo.dev/versions/latest/sdk/image/) |

### Project layout

```
home-board/
├── app/
│   ├── _layout.tsx          # Root layout — auth gate, ThemeProvider, Stack navigator
│   ├── (tabs)/
│   │   ├── _layout.tsx      # Bottom tab bar (Routes + Profile)
│   │   ├── index.tsx        # Routes screen
│   │   └── profile.tsx      # Profile screen
│   ├── route/[id].tsx       # Route detail (photo, holds, ascent logging)
│   ├── playlist/[id].tsx    # Playlist detail (drag-to-reorder)
│   ├── create-route.tsx     # Route creation with hold placement
│   ├── edit-route.tsx       # Route editing
│   ├── update-board-photo.tsx
│   └── verify-routes.tsx
├── components/
│   ├── HoldOverlay.tsx      # Hold dot rendering and colour/size constants
│   ├── LoginScreen.tsx      # Magic-code login flow
│   ├── OnboardingModal.tsx  # First-run onboarding
│   └── RouteCard.tsx        # Route list item card
├── contexts/
│   └── ThemeContext.tsx     # Dark/light mode state, persisted via AsyncStorage
├── constants/
│   └── Colors.ts            # Light and dark colour tokens
├── hooks/
│   ├── useColorScheme.ts    # Re-exports React Native's useColorScheme
│   └── useThemeColor.ts     # Picks the right colour token for the current scheme
├── lib/
│   ├── db.ts                # InstantDB client initialisation
│   ├── grades.ts            # V-grade list, ordering, and badge colours
│   ├── holdUtils.ts         # Hold manipulation helpers
│   └── imageUtils.ts        # Image resizing and validation before upload
├── instant.schema.ts        # InstantDB schema definition
├── instant.perms.ts         # InstantDB permission rules
├── tailwind.config.js       # NativeWind / Tailwind config
└── global.css               # Tailwind base directives
```

### Data model (InstantDB)

InstantDB is a client-side real-time database — think Firebase with a graph query language. The schema is defined in [`instant.schema.ts`](instant.schema.ts) and pushed with the CLI.

```
$users ──selectedBoard──> boards ──routes──> routes
  │                          │                  │
  │                       playlists          ascents
  │                          │               comments
  └── ascents                └── routes       likes
  └── playlists
  └── likes
  └── comments
```

**Entities:**

| Entity | Key fields |
|--------|-----------|
| `$users` | `email`, `username` (unique, indexed) |
| `boards` | `name` (unique), `country`, `description`, `createdAt` |
| `routes` | `name`, `grade`, `holds` (JSON string of dot positions), `createdAt` |
| `ascents` | `attempts`, `loggedAt` |
| `playlists` | `name`, `routeOrder` (JSON array of route IDs for manual ordering) |
| `comments` | `text`, `createdAt` |
| `likes` | `createdAt` |
| `$files` | `path`, `url` — used for board photos via Instant Storage |

All data syncs in real-time to every connected client automatically.

### Authentication

Magic-code email authentication via InstantDB. The user enters their email, receives a 6-digit code, and enters it to sign in. No passwords. The auth state is read with `db.useAuth()` and checked in the root layout to gate access to the app.

### Hold overlay system

Hold positions are stored as normalised coordinates (0–1 range on both axes) relative to the board photo dimensions. When rendering, the app computes where the image actually appears within its container (letterboxed via `contain` fit) and maps the stored coordinates to pixel positions. Each hold dot has a configurable colour and size.

### Gestures

- **Route detail photo:** pinch-to-zoom + pan via `Gesture.Simultaneous(pinch, pan)`, clamped so the image can never be panned beyond its zoomed bounds. Horizontal fling swipes navigate between routes with a slide transition using two independent animated layers.
- **Playlist reorder:** long-press on the drag handle starts a drag; a ghost card follows the finger at 60 fps via shared values while `LayoutAnimation` animates surrounding rows. A single stable `Gesture.Pan` object is memoised to survive list re-renders mid-drag.
- **Swipeable rows:** in both the profile (playlists) and playlist detail (routes), rows slide left to reveal a delete/remove button.

### Dark mode

`ThemeContext` stores the user's preference (`"light"` or `"dark"`) in `AsyncStorage` and calls `Appearance.setColorScheme` so that NativeWind's `dark:` Tailwind classes and React Native's `useColorScheme` hook both reflect the choice immediately. The toggle button lives on the Profile screen.

---

## Getting started

### Prerequisites

- Node.js 18+
- Expo CLI: `npm install -g expo-cli`
- An [InstantDB](https://instantdb.com) account

### Setup

```bash
# Install dependencies
npm install

# Copy the environment template and fill in your InstantDB app ID
cp .env.example .env
# Edit .env and set EXPO_PUBLIC_INSTANT_APP_ID=<your-app-id>

# Push the schema to InstantDB
npx instant-cli push schema --yes

# Start the development server
npm run start
```

Then scan the QR code with Expo Go (iOS/Android) or press `i`/`a` to open in a simulator.

### Environment variables

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_INSTANT_APP_ID` | Your InstantDB application ID (found in the InstantDB dashboard) |

### Useful commands

```bash
npm run start          # Start Expo dev server
npm run ios            # Open in iOS simulator
npm run android        # Open in Android emulator
npm run lint           # Run ESLint
npx instant-cli push   # Push schema + permissions to InstantDB
npx instant-cli pull   # Pull current schema from InstantDB
```
