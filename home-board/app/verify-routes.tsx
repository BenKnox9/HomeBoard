import {
  ContainArea,
  Hold,
  HOLD_COLORS,
  HOLD_SIZES,
  colorWithAlpha,
} from "@/components/HoldOverlay";
import { db } from "@/lib/db";
import { gradeBadgeColor } from "@/lib/grades";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseHolds(raw: string | undefined): Hold[] {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function computeContain(
  naturalW: number,
  naturalH: number,
  containerW: number,
  containerH: number
): ContainArea {
  if (naturalW <= 0 || naturalH <= 0 || containerW <= 0 || containerH <= 0) {
    return { offsetX: 0, offsetY: 0, displayW: containerW, displayH: containerH };
  }
  const imgAspect = naturalW / naturalH;
  const conAspect = containerW / containerH;
  if (imgAspect > conAspect) {
    const displayW = containerW;
    const displayH = containerW / imgAspect;
    return { offsetX: 0, offsetY: (containerH - displayH) / 2, displayW, displayH };
  } else {
    const displayH = containerH;
    const displayW = containerH * imgAspect;
    return { offsetX: (containerW - displayW) / 2, offsetY: 0, displayW, displayH };
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ── DraggableHold ────────────────────────────────────────────────────────────
//
// Renders a single hold dot positioned from its normalised (0–1) coordinates.
// Dragging the dot reports the new normalised position via onDragEnd, computed
// by inverting the same `computeContain` letterbox rect used to place it.

function DraggableHold({
  hold,
  area,
  onDragEnd,
}: {
  hold: Hold;
  area: ContainArea;
  onDragEnd: (holdId: string, x: number, y: number) => void;
}) {
  const dotSize = HOLD_SIZES[hold.size ?? "medium"];
  const solidColor = HOLD_COLORS[hold.color];
  const hitSize = dotSize + 16;

  const baseLeft = area.offsetX + hold.x * area.displayW - hitSize / 2;
  const baseTop = area.offsetY + hold.y * area.displayH - hitSize / 2;

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  function handleDragEnd(translationX: number, translationY: number) {
    const pixelX = area.offsetX + hold.x * area.displayW + translationX;
    const pixelY = area.offsetY + hold.y * area.displayH + translationY;
    const nextX = clamp01((pixelX - area.offsetX) / area.displayW);
    const nextY = clamp01((pixelY - area.offsetY) / area.displayH);
    translateX.value = 0;
    translateY.value = 0;
    onDragEnd(hold.id, nextX, nextY);
  }

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      runOnJS(handleDragEnd)(e.translationX, e.translationY);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          {
            position: "absolute",
            width: hitSize,
            height: hitSize,
            left: baseLeft,
            top: baseTop,
            alignItems: "center",
            justifyContent: "center",
          },
          animatedStyle,
        ]}
      >
        <View
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            backgroundColor: colorWithAlpha(solidColor, 0.2),
            borderWidth: 3,
            borderColor: solidColor,
          }}
        />
      </Animated.View>
    </GestureDetector>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function VerifyRoutesScreen() {
  const { boardId: boardIdParam } = useLocalSearchParams<{ boardId: string }>();
  const boardId = Array.isArray(boardIdParam) ? boardIdParam[0] : boardIdParam;
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  // routeId → current Hold[] (only populated when holds are modified)
  const [modifiedHolds, setModifiedHolds] = useState<Record<string, Hold[]>>({});
  const [saving, setSaving] = useState(false);
  const [photoLayout, setPhotoLayout] = useState({ width: 1, height: 1 });
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });

  const { isLoading, data } = db.useQuery(
    boardId
      ? {
          boards: {
            $: { where: { id: boardId } },
            photo: {},
            routes: { creator: {} },
          },
        }
      : null
  );

  const board = data?.boards?.[0] as any;
  const photoUrl = board?.photo?.url as string | undefined;
  const routes: any[] = (board?.routes ?? []).sort(
    (a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? "")
  );
  const selectedRoute = routes.find((r: any) => r.id === selectedRouteId) ?? null;

  function getHolds(route: any): Hold[] {
    return modifiedHolds[route.id] ?? parseHolds(route.holds);
  }

  function updateHoldPosition(routeId: string, holdId: string, currentHolds: Hold[], x: number, y: number) {
    setModifiedHolds((prev) => ({
      ...prev,
      [routeId]: currentHolds.map((h) => (h.id === holdId ? { ...h, x, y } : h)),
    }));
  }

  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [lastRouteIndex, setLastRouteIndex] = useState(-1);
  const autoSelectedRef = useRef(false);

  const uncheckedCount = routes.length - reviewedIds.size;

  function selectRoute(routeId: string, index: number) {
    const isSelected = routeId === selectedRouteId;
    setSelectedRouteId(isSelected ? null : routeId);
    if (!isSelected) {
      setReviewedIds((prev) => new Set(prev).add(routeId));
      setLastRouteIndex(index);
    }
  }

  function selectNextRoute() {
    if (routes.length === 0) return;
    const nextIndex = (lastRouteIndex + 1) % routes.length;
    const nextRoute = routes[nextIndex];
    setSelectedRouteId(nextRoute.id);
    setReviewedIds((prev) => new Set(prev).add(nextRoute.id));
    setLastRouteIndex(nextIndex);
  }

  // Auto-select the first route on entering the screen, same as "Next route".
  useEffect(() => {
    if (autoSelectedRef.current || routes.length === 0) return;
    autoSelectedRef.current = true;
    const firstRoute = routes[0];
    setSelectedRouteId(firstRoute.id);
    setReviewedIds((prev) => new Set(prev).add(firstRoute.id));
    setLastRouteIndex(0);
  }, [routes]);

  function goBackToCamera() {
    if (!boardId) {
      router.back();
      return;
    }
    router.replace({ pathname: "/update-board-photo", params: { boardId } });
  }

  async function save() {
    if (uncheckedCount > 0) {
      Alert.alert(
        "Routes not checked",
        `You haven't checked ${uncheckedCount} route${uncheckedCount !== 1 ? "s" : ""}. Select each route and verify its holds look correct before saving.`,
        [
          { text: "Keep checking", style: "cancel" },
          {
            text: "Save anyway",
            onPress: () => doSave(),
          },
        ]
      );
      return;
    }
    doSave();
  }

  async function doSave() {
    const changedIds = Object.keys(modifiedHolds);
    if (changedIds.length === 0) {
      router.back();
      return;
    }
    setSaving(true);
    try {
      await db.transact(
        changedIds.map((routeId) =>
          db.tx.routes[routeId].update({
            holds: JSON.stringify(modifiedHolds[routeId]),
          })
        )
      );
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  const area = computeContain(
    naturalSize.width,
    naturalSize.height,
    photoLayout.width,
    photoLayout.height
  );

  const modifiedCount = Object.keys(modifiedHolds).length;

  // ── Loading ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const selectedHolds = selectedRoute ? getHolds(selectedRoute) : [];

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* ── Photo area ── */}
      <View
        style={{ flex: 1 }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setPhotoLayout({ width, height });
        }}
      >
        {/* New board photo */}
        <Image
          source={photoUrl ? { uri: photoUrl } : undefined}
          style={{ width: "100%", height: "100%" }}
          contentFit="contain"
          onLoad={(e: any) => {
            const w = e?.source?.width;
            const h = e?.source?.height;
            if (w && h) setNaturalSize({ width: w, height: h });
          }}
        />

        {/* Hold dots for selected route — drag to correct position */}
        {selectedRoute &&
          selectedHolds.map((hold: Hold) => (
            <DraggableHold
              key={hold.id}
              hold={hold}
              area={area}
              onDragEnd={(holdId, x, y) =>
                updateHoldPosition(selectedRoute.id, holdId, selectedHolds, x, y)
              }
            />
          ))}

        {/* Top overlay bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <View style={styles.topBarRow}>
            <TouchableOpacity onPress={goBackToCamera} style={styles.pill}>
              <Ionicons name="chevron-back" size={16} color="#fff" />
              <Text style={styles.pillText}>Back</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={selectNextRoute}
              disabled={routes.length === 0}
              style={[styles.pill, routes.length === 0 && { opacity: 0.4 }]}
            >
              <Text style={[styles.pillText, { fontWeight: "700" }]}>Next route</Text>
              <Ionicons name="arrow-forward" size={14} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={save}
              disabled={saving}
              style={[styles.pill, { backgroundColor: "#6366f1" }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.pillText, { fontWeight: "700" }]}>
                  {modifiedCount > 0 ? `Save (${modifiedCount})` : "Done"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {selectedRoute && (
            <View style={styles.instructionRow}>
              <View style={styles.pill}>
                <Text style={styles.pillText}>Correct a dot by dragging it</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {/* ── Route list ── */}
      <View
        style={[
          styles.routePanel,
          {
            backgroundColor: isDark ? "#1f2937" : "#fff",
            borderTopColor: isDark ? "#374151" : "#f3f4f6",
            paddingBottom: Math.max(insets.bottom, 8),
          },
        ]}
      >
        <View style={[styles.routePanelHeader, { borderBottomColor: isDark ? "#374151" : "#f3f4f6" }]}>
          <Text style={[styles.panelTitle, { color: isDark ? "#f3f4f6" : "#111827" }]}>
            {routes.length} route{routes.length !== 1 ? "s" : ""} on this board
          </Text>
          <Text style={styles.panelSub}>
            Select each route and tap holds that are misaligned. Check all routes before saving.
          </Text>
          {routes.length > 0 && (
            <Text style={[styles.panelSub, { color: uncheckedCount === 0 ? "#22c55e" : "#f59e0b", marginTop: 2 }]}>
              {uncheckedCount === 0
                ? "✓ All routes checked"
                : `${reviewedIds.size} / ${routes.length} routes checked`}
            </Text>
          )}
        </View>

        {routes.length === 0 ? (
          <View style={{ padding: 16, alignItems: "center" }}>
            <Text style={{ color: "#9ca3af", fontSize: 14 }}>
              No routes on this board yet.
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8 }}
          >
            {routes.map((route: any, index: number) => {
              const isSelected = route.id === selectedRouteId;
              const isModified = !!modifiedHolds[route.id];
              const holds = getHolds(route);
              const badgeColor = gradeBadgeColor(route.grade);

              return (
                <TouchableOpacity
                  key={route.id}
                  onPress={() => selectRoute(route.id, index)}
                  style={[
                    styles.routeCard,
                    { borderBottomColor: isDark ? "#374151" : "#f3f4f6" },
                    isSelected && {
                      backgroundColor: isDark ? "rgba(99,102,241,0.18)" : "#eef2ff",
                      borderRadius: 10,
                      marginHorizontal: -4,
                      paddingHorizontal: 4,
                      borderBottomColor: "transparent",
                    },
                  ]}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.gradeBadge,
                      { backgroundColor: badgeColor },
                    ]}
                  >
                    <Text style={styles.gradeText}>{route.grade}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.routeName,
                        { color: isDark ? "#f3f4f6" : "#111827" },
                        isSelected && { color: "#6366f1" },
                      ]}
                      numberOfLines={1}
                    >
                      {route.name}
                    </Text>
                    <Text style={styles.routeMeta}>
                      {holds.length} hold{holds.length !== 1 ? "s" : ""}
                    </Text>
                  </View>

                  {isModified && (
                    <View style={[styles.editedBadge, isDark && { backgroundColor: "rgba(217,119,6,0.25)" }]}>
                      <Text style={styles.editedText}>Edited</Text>
                    </View>
                  )}
                  {reviewedIds.has(route.id) && !isModified && (
                    <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                  )}

                  <Ionicons
                    name={isSelected ? "chevron-down" : "chevron-forward"}
                    size={16}
                    color={isSelected ? "#6366f1" : isDark ? "#6b7280" : "#d1d5db"}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  topBarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  instructionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.58)",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 4,
  },
  pillText: { color: "#fff", fontSize: 12, fontWeight: "500" },

  routePanel: {
    backgroundColor: "#fff",
    maxHeight: 240,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  routePanelHeader: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  panelTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  panelSub: { fontSize: 12, color: "#9ca3af", marginTop: 2 },

  routeCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    gap: 10,
  },
  gradeBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    minWidth: 38,
    alignItems: "center",
  },
  gradeText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  routeName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  routeMeta: { fontSize: 11, color: "#9ca3af", marginTop: 1 },
  editedBadge: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  editedText: { fontSize: 11, fontWeight: "600", color: "#d97706" },
});
