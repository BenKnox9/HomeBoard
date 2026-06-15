import { db } from "@/lib/db";
import { gradeBadgeColor } from "@/lib/grades";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  UIManager,
  useColorScheme,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// Enable LayoutAnimation on Android (no-op on iOS which always supports it)
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ── Constants ─────────────────────────────────────────────────────────────────

// How far the row slides right to reveal the drag handle.
const HANDLE_WIDTH = 48;
const SNAP_CFG = { duration: 200 };

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRouteOrder(raw: string | undefined | null): string[] {
  try {
    const arr = JSON.parse(raw ?? "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function sortByOrder(routes: any[], order: string[]): any[] {
  if (order.length === 0) return routes;
  return [
    ...order.map((id) => routes.find((r) => r.id === id)).filter(Boolean),
    ...routes.filter((r) => !order.includes(r.id)),
  ];
}

// ── Ghost card (follows the finger while dragging) ────────────────────────────

function GhostCard({ route }: { route: any }) {
  const isDark = useColorScheme() === "dark";
  const badgeColor = gradeBadgeColor(route.grade);
  return (
    <View
      style={{
        backgroundColor: isDark ? "#1f2937" : "#fff",
        borderRadius: 16,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 14,
        elevation: 10,
      }}
    >
      <View
        style={{
          backgroundColor: badgeColor,
          borderRadius: 12,
          width: 52,
          height: 52,
          alignItems: "center",
          justifyContent: "center",
          marginRight: 16,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
          {route.grade}
        </Text>
      </View>
      <Text
        style={{ flex: 1, color: isDark ? "#f3f4f6" : "#111827", fontWeight: "600", fontSize: 16 }}
        numberOfLines={1}
      >
        {route.name}
      </Text>
      <Ionicons name="menu" size={20} color="#9ca3af" style={{ marginLeft: 8 }} />
    </View>
  );
}

// ── SwipeableRouteRow ─────────────────────────────────────────────────────────
//
// • Swipe LEFT  → reveals red "Remove" button (80 px).
// • Swipe RIGHT → triggers handle-mode for the whole list via onHandleOpen().
//
// The drag-handle overlay is rendered by the *parent* (not inside this component)
// so it appears in the free space that opens on the left when rows slide right.

function SwipeableRouteRow({
  route,
  showHandle,
  isBeingDragged,
  anyDragging,
  canEdit,
  onPress,
  onRemove,
  onHandleOpen,
  onHandleClose,
  onItemLayout,
}: {
  route: any;
  showHandle: boolean;
  isBeingDragged: boolean;
  anyDragging: boolean;
  canEdit: boolean;
  onPress: () => void;
  onRemove: () => void;
  onHandleOpen: () => void;
  onHandleClose: () => void;
  onItemLayout: (y: number, height: number) => void;
}) {
  const isDark = useColorScheme() === "dark";
  const translateX = useSharedValue(0);
  const savedX = useSharedValue(0);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: isBeingDragged ? 0.18 : 1, // very faded placeholder during drag
  }));

  // When the parent enters/exits handle-mode, animate this row.
  // Only snap back to 0 if the row is at a positive position (not showing remove).
  useEffect(() => {
    if (showHandle) {
      translateX.value = withTiming(HANDLE_WIDTH, SNAP_CFG);
    } else {
      if (translateX.value >= 0) {
        translateX.value = withTiming(0, SNAP_CFG);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHandle]);

  // Horizontal swipe gesture — completely disabled while handles are showing.
  // This prevents any interaction between the row pan and an active drag: even
  // a large horizontal drift during dragging cannot activate the pan and
  // accidentally call onHandleClose or move the row.
  // • Normal mode : left → show remove (−80), right → open handle mode
  // • From −80    : swiping right returns to 0 only (not to handle mode)
  const rowPan = Gesture.Pan()
    .enabled(!showHandle && canEdit)
    .activeOffsetX([-10, 10])
    .failOffsetY([-5, 5])
    .onStart(() => {
      savedX.value = translateX.value;
    })
    .onUpdate((e) => {
      translateX.value = Math.max(-80, Math.min(HANDLE_WIDTH, savedX.value + e.translationX));
    })
    .onEnd((e) => {
      const finalX = savedX.value + e.translationX;
      if (finalX < -40 || e.velocityX < -500) {
        translateX.value = withTiming(-80, SNAP_CFG);
      } else if ((finalX > 20 || e.velocityX > 400) && savedX.value >= 0) {
        // Only open handle mode if NOT coming from the remove position (−80)
        translateX.value = withTiming(HANDLE_WIDTH, SNAP_CFG);
        runOnJS(onHandleOpen)();
      } else {
        translateX.value = withTiming(0, SNAP_CFG);
      }
    });

  // Tap: in handle mode → close handles; otherwise navigate or close remove.
  const rowTap = Gesture.Tap()
    .runOnJS(true)
    .maxDeltaX(5)
    .onEnd((_, success) => {
      if (!success) return;
      if (showHandle) {
        // Tap in handle mode closes the handles (doesn't navigate)
        onHandleClose();
      } else if (Math.abs(translateX.value) > 10) {
        translateX.value = withTiming(0, SNAP_CFG);
      } else {
        onPress();
      }
    });

  const badgeColor = gradeBadgeColor(route.grade);
  const ascentCount = route.ascents?.length ?? 0;

  return (
    <View
      style={{ marginBottom: 8 }}
      onLayout={(e) => onItemLayout(e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
    >
      {/* Remove button — hidden while any drag is happening so it doesn't show
          through the transparent placeholder row, and hidden entirely when
          the viewer doesn't have edit access */}
      {!anyDragging && canEdit && (
        <View
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 80,
            backgroundColor: "#ef4444",
            borderRadius: 16,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <TouchableOpacity
            onPress={() => {
              translateX.value = withTiming(0, SNAP_CFG);
              onRemove();
            }}
            style={{ flex: 1, width: "100%", justifyContent: "center", alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Remove</Text>
          </TouchableOpacity>
        </View>
      )}

      <GestureDetector gesture={Gesture.Race(rowPan, rowTap)}>
        <Animated.View style={rowStyle}>
          <View
            style={{
              backgroundColor: isDark ? "#1f2937" : "#fff",
              borderRadius: 16,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: isDark ? 0 : 0.06,
              shadowRadius: 4,
              elevation: isDark ? 0 : 2,
            }}
          >
            <View
              style={{
                backgroundColor: badgeColor,
                borderRadius: 12,
                width: 52,
                height: 52,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 16,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                {route.grade}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: isDark ? "#f3f4f6" : "#111827", fontWeight: "600", fontSize: 16 }}
                numberOfLines={1}
              >
                {route.name}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="checkmark-circle" size={16} color="#6366f1" />
              <Text style={{ color: "#6366f1", fontWeight: "600", fontSize: 14 }}>
                {ascentCount}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={isDark ? "#4b5563" : "#d1d5db"} style={{ marginLeft: 8 }} />
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ── PlaylistDetailScreen ──────────────────────────────────────────────────────

export default function PlaylistDetailScreen() {
  const { id: playlistId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isDark = useColorScheme() === "dark";

  const { user } = db.useAuth();

  const { isLoading, error, data } = db.useQuery(
    playlistId
      ? {
          playlists: {
            $: { where: { id: playlistId } },
            routes: { ascents: {} },
            creator: {},
          },
        }
      : null
  );

  // ── Sorted routes ──────────────────────────────────────────────────────────

  const [sortedRoutes, setSortedRoutes] = useState<any[]>([]);
  const [dragHandleMode, setDragHandleMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Mutable refs for gesture callbacks (avoids stale-closure issues)
  const isDraggingRef = useRef(false);
  const draggingIdRef = useRef<string | null>(null);
  const sortedRoutesRef = useRef<any[]>([]);
  const lastHoverIndexRef = useRef(-1);
  const itemLayoutsRef = useRef<Map<string, { y: number; height: number }>>(new Map());
  const scrollViewPageYRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const scrollViewRef = useRef<any>(null);

  // Shared values for the ghost card (driven on the UI thread for 60 fps)
  const ghostAbsoluteY = useSharedValue(0);
  const ghostHalfHeight = useSharedValue(40);
  const ghostOpacity = useSharedValue(0);
  // Screen-space values needed inside the animated style worklet
  const scrollViewPageYSV = useSharedValue(0);
  const scrollOffsetSV = useSharedValue(0);

  const ghostStyle = useAnimatedStyle(() => {
    const contentY = ghostAbsoluteY.value - scrollViewPageYSV.value + scrollOffsetSV.value;
    return {
      top: contentY - ghostHalfHeight.value,
      opacity: ghostOpacity.value,
      transform: [{ scale: 0.97 + ghostOpacity.value * 0.03 }],
    };
  });

  const playlist = data?.playlists?.[0];
  const isOwner = (playlist as any)?.creator?.id === user?.id;
  const visibility = ((playlist as any)?.visibility as string | undefined) ?? "private";
  const publicAccess = ((playlist as any)?.publicAccess as string | undefined) ?? "view";
  const canEdit = isOwner || (visibility === "public" && publicAccess === "edit");

  // Reconcile sortedRoutes whenever DB data changes.
  // Skipped while a drag is in progress to avoid clobbering the reorder.
  useEffect(() => {
    if (!playlist || isDraggingRef.current) return;
    const routes: any[] = (playlist as any).routes ?? [];
    const order = parseRouteOrder((playlist as any).routeOrder);
    const sorted = sortByOrder(routes, order);
    setSortedRoutes(sorted);
    sortedRoutesRef.current = sorted;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // ── Drag logic ─────────────────────────────────────────────────────────────

  function startDrag(routeId: string) {
    isDraggingRef.current = true;
    draggingIdRef.current = routeId;
    lastHoverIndexRef.current = sortedRoutesRef.current.findIndex((r) => r.id === routeId);
    const layout = itemLayoutsRef.current.get(routeId);
    // Half-height of the card (excluding the 8 px marginBottom)
    ghostHalfHeight.value = layout ? (layout.height - 8) / 2 : 38;
    ghostOpacity.value = withTiming(1, { duration: 120 });
    setIsDragging(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function updateDrag(absoluteY: number) {
    const draggingId = draggingIdRef.current;
    if (!draggingId) return;

    const contentY = absoluteY - scrollViewPageYRef.current + scrollOffsetRef.current;
    const routes = sortedRoutesRef.current;

    let hoverIndex = routes.length - 1;
    for (let i = 0; i < routes.length; i++) {
      const layout = itemLayoutsRef.current.get(routes[i].id);
      if (!layout) continue;
      if (contentY < layout.y + layout.height * 0.6) {
        hoverIndex = i;
        break;
      }
    }
    if (hoverIndex === lastHoverIndexRef.current) return;
    lastHoverIndexRef.current = hoverIndex;

    const currentIndex = routes.findIndex((r) => r.id === draggingId);
    if (currentIndex === -1 || hoverIndex === currentIndex) return;

    const next = [...routes];
    const [item] = next.splice(currentIndex, 1);
    next.splice(hoverIndex, 0, item);
    sortedRoutesRef.current = next;

    // Animate surrounding items into their new positions
    LayoutAnimation.configureNext({
      duration: 180,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    setSortedRoutes(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function endDrag() {
    isDraggingRef.current = false;
    draggingIdRef.current = null;
    lastHoverIndexRef.current = -1;
    ghostOpacity.value = withTiming(0, { duration: 120 });
    setIsDragging(false);
    setDragHandleMode(false);

    const ids = sortedRoutesRef.current.map((r) => r.id);
    try {
      await db.transact([
        (db.tx.playlists as any)[playlistId].update({ routeOrder: JSON.stringify(ids) }),
      ]);
    } catch {
      Alert.alert("Error", "Failed to save the new order. Please try again.");
    }
  }

  async function removeRoute(routeId: string) {
    const newIds = sortedRoutesRef.current
      .map((r) => r.id)
      .filter((id) => id !== routeId);
    try {
      await db.transact([
        (db.tx.playlists as any)[playlistId]
          .unlink({ routes: routeId })
          .update({ routeOrder: JSON.stringify(newIds) }),
      ]);
    } catch {
      Alert.alert("Error", "Failed to remove the route. Please try again.");
    }
  }

  async function setVisibility(next: "public" | "private") {
    setSavingSettings(true);
    try {
      const update: Record<string, string> = { visibility: next };
      if (next === "public" && !publicAccess) {
        update.publicAccess = "view";
      }
      await db.transact([(db.tx.playlists as any)[playlistId].update(update)]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to update visibility.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function setPublicAccess(next: "view" | "edit") {
    setSavingSettings(true);
    try {
      await db.transact([
        (db.tx.playlists as any)[playlistId].update({ publicAccess: next }),
      ]);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to update access level.");
    } finally {
      setSavingSettings(false);
    }
  }

  // Find which route the user long-pressed on (called via runOnJS from the gesture
  // worklet, so all refs are accessible) and start the drag for that route.
  function startDragAtY(absoluteY: number) {
    const contentY = absoluteY - scrollViewPageYRef.current + scrollOffsetRef.current;
    for (const route of sortedRoutesRef.current) {
      const layout = itemLayoutsRef.current.get(route.id);
      if (layout && contentY >= layout.y && contentY < layout.y + layout.height) {
        startDrag(route.id);
        return;
      }
    }
  }

  // A SINGLE stable gesture for the entire handle strip.
  // Using useMemo with [] means RNGH sees the same gesture object on every
  // render, so an active drag is never interrupted when setSortedRoutes fires
  // and the component re-renders.  All mutable state is accessed via refs.
  const handleGesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(150)
        .onStart((e) => {
          runOnJS(startDragAtY)(e.absoluteY);
        })
        .onUpdate((e) => {
          ghostAbsoluteY.value = e.absoluteY; // UI thread — drives ghost at 60 fps
          runOnJS(updateDrag)(e.absoluteY);   // JS thread — swap logic + LayoutAnimation
        })
        .onEnd(() => {
          runOnJS(endDrag)();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // intentionally empty — callbacks read from refs, never stale
  );

  // ── Loading / error ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (error || !playlist) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900 px-6">
        <Text className="text-red-500 text-center">
          {error?.message ?? "Playlist not found"}
        </Text>
      </View>
    );
  }

  const draggingRoute = isDragging
    ? sortedRoutes.find((r) => r.id === draggingIdRef.current)
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontWeight: "700", fontSize: 17, color: isDark ? "#f3f4f6" : "#111827" }}>
                {(playlist as any).name}
              </Text>
              <Text style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>
                {sortedRoutes.length} route{sortedRoutes.length !== 1 ? "s" : ""}
              </Text>
            </View>
          ),
          headerStyle: { backgroundColor: isDark ? "#111827" : "#ffffff" },
          headerTintColor: isDark ? "#e5e7eb" : "#111827",
          headerRight: isOwner
            ? () => (
                <TouchableOpacity
                  onPress={() => setShowSettings(true)}
                  accessibilityLabel="Playlist settings"
                  style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons
                    name="settings-outline"
                    size={22}
                    color={isDark ? "#e5e7eb" : "#111827"}
                    style={{ includeFontPadding: false }}
                  />
                </TouchableOpacity>
              )
            : undefined,
        }}
      />

      {sortedRoutes.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 dark:text-gray-500 text-base">No routes in this playlist yet.</Text>
          {canEdit && (
            <Text className="text-gray-400 dark:text-gray-500 text-sm mt-1">Add routes from their detail page.</Text>
          )}
        </View>
      ) : (
        <ScrollView
          ref={scrollViewRef}
          scrollEnabled={!isDragging}
          onLayout={() => {
            scrollViewRef.current?.measure(
              (_x: number, _y: number, _w: number, _h: number, _px: number, pageY: number) => {
                scrollViewPageYRef.current = pageY;
                scrollViewPageYSV.value = pageY;
              }
            );
          }}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            scrollOffsetRef.current = y;
            scrollOffsetSV.value = y;
          }}
          scrollEventThrottle={16}
        >
          {/*
           * All rows + handle overlays + ghost card live in this wrapper.
           * Handles are rendered AFTER rows → higher z-order → they sit on top
           * in the 48 px gap the rows vacate when sliding right.
           * The ghost is rendered last so it floats above everything.
           */}
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}>

            {sortedRoutes.map((route) => (
              <SwipeableRouteRow
                key={route.id}
                route={route}
                showHandle={dragHandleMode}
                isBeingDragged={isDragging && draggingIdRef.current === route.id}
                anyDragging={isDragging}
                canEdit={canEdit}
                onPress={() =>
                  router.push({
                    pathname: "/route/[id]",
                    params: {
                      id: route.id,
                      routeIds: JSON.stringify(sortedRoutes.map((r) => r.id)),
                    },
                  })
                }
                onRemove={() => removeRoute(route.id)}
                onHandleOpen={() => setDragHandleMode(true)}
                onHandleClose={() => setDragHandleMode(false)}
                onItemLayout={(y, height) => {
                  itemLayoutsRef.current.set(route.id, { y, height });
                }}
              />
            ))}

            {/* Single GestureDetector covering the full handle strip.
                One stable gesture object means RNGH never interrupts an active
                drag when the list re-renders during a swap.  The icon Views
                inside are plain (no gesture), so they can re-render freely. */}
            {dragHandleMode && (
              <GestureDetector gesture={handleGesture}>
                <View
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: HANDLE_WIDTH,
                  }}
                >
                  {sortedRoutes.map((route) => {
                    const layout = itemLayoutsRef.current.get(route.id);
                    if (!layout) return null;
                    return (
                      <View
                        key={`handle-${route.id}`}
                        pointerEvents="none"
                        style={{
                          position: "absolute",
                          top: layout.y,
                          width: HANDLE_WIDTH,
                          height: layout.height - 8,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <Ionicons name="menu" size={22} color="#9ca3af" />
                      </View>
                    );
                  })}
                </View>
              </GestureDetector>
            )}

            {/* Ghost card — follows the finger on the UI thread (60 fps) while
                the surrounding rows animate into new positions via LayoutAnimation */}
            {draggingRoute && (
              <Animated.View
                style={[
                  {
                    position: "absolute",
                    left: 0,
                    right: 0,
                    zIndex: 200,
                    pointerEvents: "none",
                  },
                  ghostStyle,
                ]}
              >
                <GhostCard route={draggingRoute} />
              </Animated.View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Settings modal — owner only */}
      <Modal
        visible={showSettings}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 justify-end"
          activeOpacity={1}
          onPress={() => setShowSettings(false)}
        >
          <View
            style={{ backgroundColor: isDark ? "#1f2937" : "#ffffff" }}
            className="rounded-t-3xl p-6"
          >
            <Text className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">
              Playlist settings
            </Text>

            <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-2">
              Visibility
            </Text>
            <View className="flex-row bg-gray-100 dark:bg-gray-700 rounded-xl p-1 mb-4">
              <TouchableOpacity
                onPress={() => setVisibility("private")}
                disabled={savingSettings}
                className="flex-1 rounded-lg py-2 items-center"
                style={{ backgroundColor: visibility === "private" ? "#6366f1" : "transparent" }}
              >
                <Text
                  className="font-semibold text-sm"
                  style={{ color: visibility === "private" ? "#fff" : (isDark ? "#9ca3af" : "#6b7280") }}
                >
                  Private
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setVisibility("public")}
                disabled={savingSettings}
                className="flex-1 rounded-lg py-2 items-center"
                style={{ backgroundColor: visibility === "public" ? "#6366f1" : "transparent" }}
              >
                <Text
                  className="font-semibold text-sm"
                  style={{ color: visibility === "public" ? "#fff" : (isDark ? "#9ca3af" : "#6b7280") }}
                >
                  Public
                </Text>
              </TouchableOpacity>
            </View>

            {visibility === "public" && (
              <>
                <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-2">
                  Public access
                </Text>
                <View className="flex-row bg-gray-100 dark:bg-gray-700 rounded-xl p-1 mb-2">
                  <TouchableOpacity
                    onPress={() => setPublicAccess("view")}
                    disabled={savingSettings}
                    className="flex-1 rounded-lg py-2 items-center"
                    style={{ backgroundColor: publicAccess === "view" ? "#6366f1" : "transparent" }}
                  >
                    <Text
                      className="font-semibold text-sm"
                      style={{ color: publicAccess === "view" ? "#fff" : (isDark ? "#9ca3af" : "#6b7280") }}
                    >
                      View only
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setPublicAccess("edit")}
                    disabled={savingSettings}
                    className="flex-1 rounded-lg py-2 items-center"
                    style={{ backgroundColor: publicAccess === "edit" ? "#6366f1" : "transparent" }}
                  >
                    <Text
                      className="font-semibold text-sm"
                      style={{ color: publicAccess === "edit" ? "#fff" : (isDark ? "#9ca3af" : "#6b7280") }}
                    >
                      Can edit
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text className="text-gray-400 dark:text-gray-500 text-xs mb-4">
                  {publicAccess === "edit"
                    ? "Anyone on this board can open this playlist and add or remove routes."
                    : "Anyone on this board can open this playlist, but only you can change its routes."}
                </Text>
              </>
            )}

            <TouchableOpacity
              onPress={() => setShowSettings(false)}
              className="mt-2 bg-gray-100 dark:bg-gray-700 rounded-xl py-3 items-center"
            >
              <Text className="text-gray-600 dark:text-gray-300 font-medium">Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
