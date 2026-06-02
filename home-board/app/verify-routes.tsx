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
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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

// ── Screen ────────────────────────────────────────────────────────────────────

export default function VerifyRoutesScreen() {
  const { boardId: boardIdParam } = useLocalSearchParams<{ boardId: string }>();
  const boardId = Array.isArray(boardIdParam) ? boardIdParam[0] : boardIdParam;
  const insets = useSafeAreaInsets();

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

  function removeHold(routeId: string, holdId: string, currentHolds: Hold[]) {
    setModifiedHolds((prev) => ({
      ...prev,
      [routeId]: currentHolds.filter((h) => h.id !== holdId),
    }));
  }

  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  const uncheckedCount = routes.length - reviewedIds.size;

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

        {/* Hold dots for selected route — tappable to remove */}
        {selectedRoute &&
          selectedHolds.map((hold: Hold) => {
            const dotSize = HOLD_SIZES[hold.size ?? "medium"];
            const solidColor = HOLD_COLORS[hold.color];
            const hitSize = dotSize + 16;
            return (
              <TouchableOpacity
                key={hold.id}
                onPress={() =>
                  removeHold(selectedRoute.id, hold.id, selectedHolds)
                }
                style={{
                  position: "absolute",
                  width: hitSize,
                  height: hitSize,
                  left:
                    area.offsetX + hold.x * area.displayW - hitSize / 2,
                  top:
                    area.offsetY + hold.y * area.displayH - hitSize / 2,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View
                  style={{
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    backgroundColor: colorWithAlpha(solidColor, 0.2),
                    borderWidth: 3,
                    borderColor: solidColor,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name="close"
                    size={Math.max(10, Math.floor(dotSize * 0.45))}
                    color={solidColor}
                  />
                </View>
              </TouchableOpacity>
            );
          })}

        {/* Top overlay bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.pill}>
            <Ionicons name="chevron-back" size={16} color="#fff" />
            <Text style={styles.pillText}>Skip</Text>
          </TouchableOpacity>

          <View style={styles.pill}>
            <Text style={styles.pillText}>
              {selectedRoute
                ? "Tap a hold to remove it"
                : "Select a route below"}
            </Text>
          </View>

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
      </View>

      {/* ── Route list ── */}
      <View
        style={[
          styles.routePanel,
          { paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        <View style={styles.routePanelHeader}>
          <Text style={styles.panelTitle}>
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
            {routes.map((route: any) => {
              const isSelected = route.id === selectedRouteId;
              const isModified = !!modifiedHolds[route.id];
              const holds = getHolds(route);
              const badgeColor = gradeBadgeColor(route.grade);

              return (
                <TouchableOpacity
                  key={route.id}
                  onPress={() => {
                    setSelectedRouteId(isSelected ? null : route.id);
                    if (!isSelected) setReviewedIds((prev) => new Set(prev).add(route.id));
                  }}
                  style={[
                    styles.routeCard,
                    isSelected && styles.routeCardActive,
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
                    <View style={styles.editedBadge}>
                      <Text style={styles.editedText}>Edited</Text>
                    </View>
                  )}
                  {reviewedIds.has(route.id) && !isModified && (
                    <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                  )}

                  <Ionicons
                    name={isSelected ? "chevron-down" : "chevron-forward"}
                    size={16}
                    color={isSelected ? "#6366f1" : "#d1d5db"}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
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
  routeCardActive: {
    backgroundColor: "#eef2ff",
    borderRadius: 10,
    marginHorizontal: -4,
    paddingHorizontal: 4,
    borderBottomColor: "transparent",
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
