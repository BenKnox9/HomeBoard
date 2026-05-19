import {
  ContainArea,
  Hold,
  HOLD_COLORS,
  HOLD_SIZES,
  colorWithAlpha,
} from "@/components/HoldOverlay";
import { db } from "@/lib/db";
import { gradeBadgeColor } from "@/lib/grades";
import { id } from "@instantdb/react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SLIDE_MS = 220;

// ── Small helpers ────────────────────────────────────────────────────────────

function parseHolds(raw: string | undefined): Hold[] {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function RouteInfoBar({
  route,
  userId,
}: {
  route: any;
  userId: string | undefined;
}) {
  const myAscents = (route.ascents ?? []).filter(
    (a: any) => a.user?.id === userId
  );
  const hasAscended = myAscents.length > 0;
  const badgeColor = gradeBadgeColor(route.grade);

  return (
    <View style={styles.infoBar}>
      <View style={[styles.gradeBadge, { backgroundColor: badgeColor }]}>
        <Text style={styles.gradeText}>{route.grade}</Text>
      </View>
      <Text style={styles.routeName} numberOfLines={1}>
        {route.name}
      </Text>
      {hasAscended && (
        <Ionicons
          name="checkmark-circle"
          size={20}
          color="#22c55e"
          style={{ marginLeft: 8 }}
        />
      )}
    </View>
  );
}

function StatCell({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text
        style={{
          fontSize: small ? 13 : 22,
          fontWeight: "700",
          color: "#6366f1",
          textAlign: "center",
        }}
      >
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RouteDetailScreen() {
  const { id: routeId, routeIds: routeIdsParam } =
    useLocalSearchParams<{ id: string; routeIds?: string }>();
  const insets = useSafeAreaInsets();
  const { user } = db.useAuth();

  const routeIds: string[] = (() => {
    const raw = Array.isArray(routeIdsParam) ? routeIdsParam[0] : routeIdsParam;
    try {
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  })();

  const [displayedId, setDisplayedId] = useState(routeId ?? "");
  const displayedIndex = routeIds.indexOf(displayedId);
  const prevId = displayedIndex > 0 ? routeIds[displayedIndex - 1] : null;
  const nextId =
    displayedIndex >= 0 && displayedIndex < routeIds.length - 1
      ? routeIds[displayedIndex + 1]
      : null;

  const [falls, setFalls] = useState(0);
  const [logging, setLogging] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [holdsTransparent, setHoldsTransparent] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Track photo container layout + natural image size to position hold dots
  const [photoLayout, setPhotoLayout] = useState({ width: 1, height: 1 });
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });

  // Transition state — two independent layers slide out/in so there's no reset flash
  const [outgoingRouteId, setOutgoingRouteId] = useState<string | null>(null);
  const [incomingRouteId, setIncomingRouteId] = useState<string | null>(null);


  // Each layer gets its own translateX so they never need a shared reset
  const outgoingX = useSharedValue(0);
  const incomingX = useSharedValue(SCREEN_WIDTH);
  const outgoingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: outgoingX.value }],
  }));
  const incomingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: incomingX.value }],
  }));
  // The "current" layer is always mounted to avoid a gap-frame flash when the
  // incoming Animated.View unmounts. It's hidden (opacity 0) during the swipe
  // animation so only the outgoing/incoming slide layers are visible.
  const currentLayerOpacity = useSharedValue(1);
  const currentLayerStyle = useAnimatedStyle(() => ({
    opacity: currentLayerOpacity.value,
  }));

  // Zoom/pan for the static board photo
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Container dimensions in shared values so pan/pinch worklets can clamp
  const containerW = useSharedValue(SCREEN_WIDTH);
  const containerH = useSharedValue(700);

  // Query prev + current + next simultaneously so adjacent holds are ready
  const queryIds = [
    ...new Set([prevId, displayedId, nextId].filter(Boolean)),
  ] as string[];

  const { isLoading, error, data } = db.useQuery(
    user && queryIds.length > 0
      ? {
          routes: {
            $: { where: { id: { $in: queryIds } } },
            board: { photo: {} },
            ascents: { user: {} },
            likes: { user: {} },
            comments: { user: {} },
            creator: {},
          },
          $users: {
            $: { where: { id: user.id } },
            selectedBoard: {},
            playlists: { routes: {} },
          },
        }
      : null
  );

  const currentRoute = data?.routes?.find((r: any) => r.id === displayedId);

  // Board photo is the same for every route — derive it once from any loaded route
  // and memoize the source object so the Image never receives a new prop during swipes.
  const photoUrl = useMemo(
    () =>
      (data?.routes?.find((r: any) => r.board?.photo?.url)?.board?.photo
        ?.url as string | undefined),
    // Only recompute if the URL string itself changes, not on every data update
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.routes?.find((r: any) => r.board?.photo?.url)?.board?.photo?.url]
  );
  const imageSource = useMemo(
    () => (photoUrl ? { uri: photoUrl } : undefined),
    [photoUrl]
  );

  const switchToRoute = useCallback(
    (targetId: string) => {
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTX.value = 0;
      savedTY.value = 0;
      // Only update displayedId here. Clearing the transition layers and restoring
      // the current layer's opacity is deferred to a useEffect that runs after React
      // has committed the new currentRoute content — this ensures the current layer
      // already shows the new dots before incoming unmounts, eliminating any flash.
      setDisplayedId(targetId);
      setFalls(0);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Phase 2 of the transition: runs after React has rendered the new currentRoute.
  // At this point currentRoute is correct, so we can safely reveal the current layer
  // and remove the slide layers — both changes are atomic in the same commit.
  useEffect(() => {
    currentLayerOpacity.value = 1;
    setOutgoingRouteId(null);
    setIncomingRouteId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayedId]);

  const handleSwipeEnd = useCallback(
    (velocityX: number, velocityY: number, currentScale: number) => {
      if (currentScale > 1.05) return;
      const isHorizFling =
        Math.abs(velocityX) > 600 &&
        Math.abs(velocityX) > Math.abs(velocityY) * 1.5;
      if (!isHorizFling) return;
      const goNext = velocityX < 0;
      const targetId = goNext ? nextId : prevId;
      if (!targetId) return;

      // Capture current displayed route as the outgoing route before state changes
      setOutgoingRouteId(displayedId);
      setIncomingRouteId(targetId);

      // Hide the always-mounted current layer so only the animated slide layers
      // are visible during the transition — prevents old dots showing through.
      currentLayerOpacity.value = 0;

      // Position outgoing at 0 (current center), incoming off the correct edge
      outgoingX.value = 0;
      incomingX.value = goNext ? SCREEN_WIDTH : -SCREEN_WIDTH;

      // Both layers animate simultaneously; incoming ends at 0 (center)
      outgoingX.value = withTiming(goNext ? -SCREEN_WIDTH : SCREEN_WIDTH, {
        duration: SLIDE_MS,
      });
      incomingX.value = withTiming(0, { duration: SLIDE_MS }, (finished) => {
        if (finished) runOnJS(switchToRoute)(targetId);
      });
    },
    [nextId, prevId, displayedId, switchToRoute, outgoingX, incomingX]
  );

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const s = Math.max(1, savedScale.value * e.scale);
      scale.value = s;
      // Reclamp translation so the image stays within bounds as scale changes
      const maxTX = (s - 1) * containerW.value / 2;
      const maxTY = (s - 1) * containerH.value / 2;
      translateX.value = Math.max(-maxTX, Math.min(maxTX, translateX.value));
      translateY.value = Math.max(-maxTY, Math.min(maxTY, translateY.value));
    })
    .onEnd(() => {
      if (scale.value <= 1.05) {
        // Zoomed back out — snap image to its original centered position
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTX.value = 0;
        savedTY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .minDistance(8)
    .onUpdate((e) => {
      if (scale.value > 1.05) {
        // Clamp so the image can never be panned beyond its zoomed bounds
        const maxTX = (scale.value - 1) * containerW.value / 2;
        const maxTY = (scale.value - 1) * containerH.value / 2;
        translateX.value = Math.max(-maxTX, Math.min(maxTX, savedTX.value + e.translationX));
        translateY.value = Math.max(-maxTY, Math.min(maxTY, savedTY.value + e.translationY));
      }
    })
    .onEnd((e) => {
      if (scale.value > 1.05) {
        savedTX.value = translateX.value;
        savedTY.value = translateY.value;
      }
      runOnJS(handleSwipeEnd)(e.velocityX, e.velocityY, scale.value);
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  // Compute where the image actually appears within the container (letterboxed)
  function computeContainArea(): ContainArea {
    const { width: nW, height: nH } = naturalSize;
    const { width: cW, height: cH } = photoLayout;
    if (nW <= 1 || nH <= 1 || cW <= 1 || cH <= 1) {
      return { offsetX: 0, offsetY: 0, displayW: cW, displayH: cH };
    }
    const imageAspect = nW / nH;
    const containerAspect = cW / cH;
    if (imageAspect > containerAspect) {
      const displayW = cW;
      const displayH = cW / imageAspect;
      return { offsetX: 0, offsetY: (cH - displayH) / 2, displayW, displayH };
    } else {
      const displayH = cH;
      const displayW = cH * imageAspect;
      return { offsetX: (cW - displayW) / 2, offsetY: 0, displayW, displayH };
    }
  }

  function renderHoldDots(holdsToRender: Hold[], transparent = false) {
    const area = computeContainArea();
    return holdsToRender.map((hold) => {
      const solidColor = HOLD_COLORS[hold.color];
      const dotSize = HOLD_SIZES[hold.size ?? "medium"];
      return (
        <View
          key={hold.id}
          pointerEvents="none"
          style={{
            position: "absolute",
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: transparent ? "transparent" : colorWithAlpha(solidColor, 0.15),
            borderWidth: 3,
            borderColor: transparent ? colorWithAlpha(solidColor, 0.55) : solidColor,
            left: area.offsetX + hold.x * area.displayW - dotSize / 2,
            top: area.offsetY + hold.y * area.displayH - dotSize / 2,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: transparent ? 0 : 0.5,
            shadowRadius: 3,
            elevation: transparent ? 0 : 4,
          }}
        />
      );
    });
  }

  // ── Loading / error ──────────────────────────────────────────────────────

  if (isLoading && !currentRoute) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: "#000" }]}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (error || !currentRoute) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: "#000" }]}>
        <Text style={{ color: "#f87171" }}>
          {error?.message ?? "Route not found"}
        </Text>
      </View>
    );
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const currentUser = data?.$users?.[0];
  const allAscents: any[] = currentRoute.ascents ?? [];
  const myAscents = allAscents.filter((a: any) => a.user?.id === user?.id);
  const lastAscent = [...myAscents].sort(
    (a: any, b: any) => b.loggedAt - a.loggedAt
  )[0];
  const allLikes: any[] = currentRoute.likes ?? [];
  const myLike = allLikes.find((l: any) => l.user?.id === user?.id);
  const isLiked = !!myLike;
  const comments = [...(currentRoute.comments ?? [])].sort(
    (a: any, b: any) => a.createdAt - b.createdAt
  );
  const userPlaylists: any[] = currentUser?.playlists ?? [];
  const holds = parseHolds(currentRoute.holds);

  // ── Actions ──────────────────────────────────────────────────────────────

  async function logAscent() {
    if (!user || !displayedId) return;
    setLogging(true);
    try {
      await db.transact([
        db.tx.ascents[id()]
          .update({ attempts: falls, loggedAt: Date.now() })
          .link({ route: displayedId, user: user.id }),
      ]);
      setFalls(0);
    } finally {
      setLogging(false);
    }
  }

  async function toggleLike() {
    if (!user || !displayedId) return;
    if (isLiked && myLike) {
      await db.transact([db.tx.likes[myLike.id].delete()]);
    } else {
      await db.transact([
        db.tx.likes[id()]
          .update({ createdAt: Date.now() })
          .link({ route: displayedId, user: user.id }),
      ]);
    }
  }

  async function submitComment() {
    if (!user || !displayedId || !commentText.trim()) return;
    setSubmittingComment(true);
    try {
      await db.transact([
        db.tx.comments[id()]
          .update({ text: commentText.trim(), createdAt: Date.now() })
          .link({ route: displayedId, user: user.id }),
      ]);
      setCommentText("");
    } finally {
      setSubmittingComment(false);
    }
  }

  async function deleteComment(commentId: string) {
    await db.transact([db.tx.comments[commentId].delete()]);
  }

  async function togglePlaylist(pl: any) {
    const inPl = (pl.routes ?? []).some((r: any) => r.id === displayedId);
    if (inPl) {
      await db.transact([db.tx.playlists[pl.id].unlink({ routes: displayedId })]);
    } else {
      await db.transact([db.tx.playlists[pl.id].link({ routes: displayedId })]);
    }
  }

  function commentAuthor(c: any): string {
    if (c.user?.id === user?.id) return "You";
    if (c.user?.email) return (c.user.email as string).split("@")[0];
    return "Climber";
  }

  function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.fill, { backgroundColor: "#000" }]}>

      {/* ── Photo area ── */}
      <View
        style={{ flex: 1, overflow: "hidden" }}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          const h = e.nativeEvent.layout.height;
          setPhotoLayout({ width: w, height: h });
          containerW.value = w;
          containerH.value = h;
        }}
      >
        {/* Board photo + hold dots — all inside the zoom layer so dots track the image */}
        <GestureDetector gesture={composed}>
          <View style={StyleSheet.absoluteFill} collapsable={false}>
            <Animated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
              <Image
                source={imageSource}
                style={{ width: "100%", height: "100%", backgroundColor: "#000" }}
                contentFit="contain"
                onLoad={(e: any) => {
                  const w = e?.source?.width;
                  const h = e?.source?.height;
                  if (w && h) setNaturalSize({ width: w, height: h });
                }}
              />

              {/* Current dots — always rendered, opacity-gated during transition */}
              <Animated.View style={[StyleSheet.absoluteFill, currentLayerStyle]} pointerEvents="none">
                {renderHoldDots(holds, holdsTransparent)}
              </Animated.View>
              {/* Outgoing slides away; incoming slides in on top */}
              {outgoingRouteId && (() => {
                const outRoute = data?.routes?.find((r: any) => r.id === outgoingRouteId);
                return outRoute ? (
                  <Animated.View style={[StyleSheet.absoluteFill, outgoingStyle]} pointerEvents="none">
                    {renderHoldDots(parseHolds(outRoute.holds))}
                  </Animated.View>
                ) : null;
              })()}
              {incomingRouteId && (() => {
                const inRoute = data?.routes?.find((r: any) => r.id === incomingRouteId);
                return inRoute ? (
                  <Animated.View style={[StyleSheet.absoluteFill, incomingStyle]} pointerEvents="none">
                    {renderHoldDots(parseHolds(inRoute.holds))}
                  </Animated.View>
                ) : null;
              })()}
            </Animated.View>
          </View>
        </GestureDetector>

        {/* Route info bar — outside zoom, always rendered, opacity-gated during transition */}
        <Animated.View style={[StyleSheet.absoluteFill, currentLayerStyle]} pointerEvents="none">
          <RouteInfoBar route={currentRoute} userId={user?.id} />
        </Animated.View>
        {outgoingRouteId && (() => {
          const outRoute = data?.routes?.find((r: any) => r.id === outgoingRouteId);
          return outRoute ? (
            <Animated.View style={[StyleSheet.absoluteFill, outgoingStyle]} pointerEvents="none">
              <RouteInfoBar route={outRoute} userId={user?.id} />
            </Animated.View>
          ) : null;
        })()}
        {incomingRouteId && (() => {
          const inRoute = data?.routes?.find((r: any) => r.id === incomingRouteId);
          return inRoute ? (
            <Animated.View style={[StyleSheet.absoluteFill, incomingStyle]} pointerEvents="none">
              <RouteInfoBar route={inRoute} userId={user?.id} />
            </Animated.View>
          ) : null;
        })()}

        {/* UI overlays — back button, info, position indicator, swipe arrows */}
        <View style={[StyleSheet.absoluteFill, { pointerEvents: "box-none" }]}>
          {/* ← Routes */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={[
              styles.pill,
              {
                position: "absolute",
                top: insets.top + 8,
                left: 16,
                flexDirection: "row",
                alignItems: "center",
                gap: 2,
              },
            ]}
          >
            <Ionicons name="chevron-back" size={16} color="#fff" />
            <Text style={styles.pillText}>Routes</Text>
          </TouchableOpacity>

          {/* Position indicator */}
          {routeIds.length > 1 && displayedIndex >= 0 && (
            <View
              style={{
                position: "absolute",
                top: insets.top + 14,
                left: 0,
                right: 0,
                alignItems: "center",
                pointerEvents: "none",
              }}
            >
              <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
                {displayedIndex + 1} / {routeIds.length}
              </Text>
            </View>
          )}

          {/* ⓘ Info */}
          <TouchableOpacity
            onPress={() => setShowInfo(true)}
            style={[
              styles.pill,
              { position: "absolute", top: insets.top + 8, right: 16 },
            ]}
          >
            <Ionicons name="information-circle" size={20} color="#fff" />
          </TouchableOpacity>

          {/* Eye toggle — show/hide hold transparency */}
          <TouchableOpacity
            onPress={() => setHoldsTransparent((v) => !v)}
            style={[
              styles.pill,
              { position: "absolute", top: insets.top + 52, right: 16 },
            ]}
          >
            <Ionicons
              name={holdsTransparent ? "eye-off-outline" : "eye-outline"}
              size={20}
              color="#fff"
            />
          </TouchableOpacity>

          {/* Swipe arrows */}
          {prevId && (
            <View
              style={{
                position: "absolute",
                left: 6,
                top: "45%",
                pointerEvents: "none",
              }}
            >
              <Text style={styles.swipeArrow}>‹</Text>
            </View>
          )}
          {nextId && (
            <View
              style={{
                position: "absolute",
                right: 6,
                top: "45%",
                pointerEvents: "none",
              }}
            >
              <Text style={styles.swipeArrow}>›</Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Fixed bottom bar: falls counter + Log Ascent ── */}
      <View style={[styles.fixedBar, { paddingBottom: insets.bottom + 8 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TouchableOpacity
            onPress={() => setFalls((f) => Math.max(0, f - 1))}
            style={styles.circleBtn}
          >
            <Text style={styles.circleBtnText}>−</Text>
          </TouchableOpacity>

          <View style={{ alignItems: "center", minWidth: 52 }}>
            <Text style={{ color: "#fff", fontSize: 24, fontWeight: "700" }}>
              {falls}
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.4)", fontSize: 10 }}>
              {falls === 1 ? "fall" : "falls"}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setFalls((f) => f + 1)}
            style={styles.circleBtn}
          >
            <Text style={styles.circleBtnText}>+</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={logAscent}
            disabled={logging}
            style={[styles.logBtn, { opacity: logging ? 0.5 : 1 }]}
          >
            {logging ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.logBtnText}>Log ascent</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Info modal ── */}
      <Modal
        visible={showInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInfo(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => setShowInfo(false)}
          />
          <View style={styles.sheet}>
            {/* Draggable handle — pan down to dismiss */}
            <GestureDetector
              gesture={Gesture.Pan()
                .activeOffsetY([0, 15])
                .onEnd((e) => {
                  if (e.translationY > 60 || e.velocityY > 600) {
                    runOnJS(setShowInfo)(false);
                  }
                })}
            >
              <View style={{ paddingTop: 12, paddingBottom: 8, alignItems: "center" }}>
                <View style={styles.handle} />
              </View>
            </GestureDetector>
            <ScrollView
              contentContainerStyle={{ padding: 20, paddingTop: 4 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.sectionLabel}>Statistics</Text>
              <View style={styles.statsRow}>
                <StatCell label="Total" value={String(allAscents.length)} />
                <StatCell label="Yours" value={String(myAscents.length)} />
                <StatCell
                  label="Last ascent"
                  value={
                    lastAscent
                      ? new Date(lastAscent.loggedAt).toLocaleDateString()
                      : "—"
                  }
                  small
                />
              </View>

              {/* Route creator */}
              {(() => {
                const creator = (currentRoute as any).creator;
                const name = creator?.username
                  ? `@${creator.username}`
                  : creator?.email
                  ? (creator.email as string).split("@")[0]
                  : null;
                return name ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 }}>
                    <Ionicons name="person-outline" size={13} color="#9ca3af" />
                    <Text style={{ fontSize: 13, color: "#9ca3af" }}>Set by {name}</Text>
                  </View>
                ) : null;
              })()}

              <TouchableOpacity
                onPress={toggleLike}
                style={[styles.infoRow, { marginBottom: 10 }]}
              >
                <Ionicons
                  name={isLiked ? "heart" : "heart-outline"}
                  size={22}
                  color={isLiked ? "#ef4444" : "#6b7280"}
                />
                <Text
                  style={[
                    styles.infoRowText,
                    { color: isLiked ? "#ef4444" : "#6b7280" },
                  ]}
                >
                  {allLikes.length} {allLikes.length === 1 ? "like" : "likes"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setShowInfo(false);
                  setShowPlaylistModal(true);
                }}
                style={[styles.infoRow, { marginBottom: 20 }]}
              >
                <Ionicons name="bookmark-outline" size={20} color="#6b7280" />
                <Text style={[styles.infoRowText, { color: "#6b7280" }]}>
                  Add to playlist
                </Text>

              </TouchableOpacity>

              <Text style={styles.sectionLabel}>
                Comments ({comments.length})
              </Text>
              {comments.length === 0 && (
                <Text
                  style={{
                    color: "#9ca3af",
                    textAlign: "center",
                    marginBottom: 12,
                  }}
                >
                  No comments yet
                </Text>
              )}
              {comments.map((c: any) => (
                <View
                  key={c.id}
                  style={{ flexDirection: "row", marginBottom: 12 }}
                >
                  <View
                    style={[
                      styles.avatar,
                      {
                        backgroundColor:
                          c.user?.id === user?.id ? "#6366f1" : "#e5e7eb",
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: c.user?.id === user?.id ? "#fff" : "#6b7280",
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {commentAuthor(c).charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: "#374151",
                        }}
                      >
                        {commentAuthor(c)}
                      </Text>
                      <Text style={{ fontSize: 11, color: "#d1d5db" }}>
                        {timeAgo(c.createdAt)}
                      </Text>
                    </View>
                    <Text style={{ fontSize: 14, color: "#4b5563" }}>
                      {c.text}
                    </Text>
                  </View>
                  {c.user?.id === user?.id && (
                    <TouchableOpacity
                      onPress={() => deleteComment(c.id)}
                      style={{ padding: 4, marginLeft: 4 }}
                    >
                      <Ionicons name="close" size={14} color="#d1d5db" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <TextInput
                  style={styles.commentInput}
                  placeholder="Add a comment…"
                  placeholderTextColor="#9ca3af"
                  value={commentText}
                  onChangeText={setCommentText}
                  returnKeyType="send"
                  onSubmitEditing={submitComment}
                />
                <TouchableOpacity
                  onPress={submitComment}
                  disabled={submittingComment || !commentText.trim()}
                  style={[
                    styles.sendBtn,
                    {
                      opacity:
                        submittingComment || !commentText.trim() ? 0.4 : 1,
                    },
                  ]}
                >
                  {submittingComment ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={16} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
              <View style={{ height: 32 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Playlist modal ── */}
      <Modal
        visible={showPlaylistModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPlaylistModal(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "flex-end",
          }}
          activeOpacity={1}
          onPress={() => setShowPlaylistModal(false)}
        >
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={{ padding: 24 }}>
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "700",
                  color: "#111827",
                  marginBottom: 16,
                }}
              >
                Add to playlist
              </Text>
              {userPlaylists.length === 0 ? (
                <Text
                  style={{
                    color: "#9ca3af",
                    textAlign: "center",
                    paddingVertical: 12,
                  }}
                >
                  No playlists yet — create one in your profile.
                </Text>
              ) : (
                userPlaylists.map((pl: any) => {
                  const inPl = (pl.routes ?? []).some(
                    (r: any) => r.id === displayedId
                  );
                  return (
                    <TouchableOpacity
                      key={pl.id}
                      onPress={() => togglePlaylist(pl)}
                      style={styles.playlistRow}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          {
                            borderColor: inPl ? "#6366f1" : "#d1d5db",
                            backgroundColor: inPl ? "#6366f1" : "transparent",
                          },
                        ]}
                      >
                        {inPl && (
                          <Text style={{ color: "#fff", fontSize: 10 }}>✓</Text>
                        )}
                      </View>
                      <Text style={{ flex: 1, color: "#111827" }}>
                        {pl.name}
                      </Text>
                      <Text style={{ color: "#9ca3af", fontSize: 12 }}>
                        {pl.routes?.length ?? 0} routes
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
              <TouchableOpacity
                onPress={() => setShowPlaylistModal(false)}
                style={styles.doneBtn}
              >
                <Text style={{ color: "#4b5563", fontWeight: "500" }}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },

  infoBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.88)",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  gradeBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 10,
  },
  gradeText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  routeName: { flex: 1, color: "#fff", fontWeight: "600", fontSize: 16 },

  fixedBar: {
    backgroundColor: "rgba(0,0,0,0.88)",
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  pill: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: { color: "#fff", fontSize: 14 },
  swipeArrow: { color: "rgba(255,255,255,0.25)", fontSize: 36 },

  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  circleBtnText: { color: "#fff", fontSize: 22, lineHeight: 26 },
  logBtn: {
    flex: 1,
    backgroundColor: "#6366f1",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  logBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },

  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "82%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#e5e7eb",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    backgroundColor: "#f9fafb",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  infoRowText: { fontWeight: "600", fontSize: 15 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 2,
  },
  commentInput: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111827",
  },
  sendBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  playlistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  doneBtn: {
    marginTop: 16,
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
});
