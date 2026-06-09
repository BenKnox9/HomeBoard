import HoldOverlay, { Hold, HoldColor, HoldSize, HOLD_SIZES } from "@/components/HoldOverlay";
import { db } from "@/lib/db";
import { GRADES } from "@/lib/grades";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Keyboard,
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
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HOLD_COLORS: { color: HoldColor; hex: string }[] = [
  { color: "green", hex: "#22c55e" },
  { color: "blue", hex: "#3b82f6" },
  { color: "purple", hex: "#a855f7" },
  { color: "red", hex: "#ef4444" },
];

const FORM_HEIGHT = 400;
const INPUT_ACCESSORY_ID = "edit-route";

function parseHoldsOrEmpty(raw: string | undefined): Hold[] {
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

export default function EditRouteScreen() {
  const router = useRouter();
  const { routeId } = useLocalSearchParams<{ routeId: string }>();
  const { user } = db.useAuth();
  const insets = useSafeAreaInsets();

  const [holds, setHolds] = useState<Hold[]>([]);
  const [activeColor, setActiveColor] = useState<HoldColor>("green");
  const [activeSize, setActiveSize] = useState<HoldSize>("medium");
  const [grade, setGrade] = useState("V0");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const formY = useSharedValue(FORM_HEIGHT);
  const keyboardOffset = useSharedValue(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e) => {
      keyboardOffset.value = withTiming(e.endCoordinates.height, { duration: Platform.OS === "ios" ? e.duration : 200 });
    });
    const hide = Keyboard.addListener(hideEvent, (e) => {
      keyboardOffset.value = withTiming(0, { duration: Platform.OS === "ios" ? e.duration : 200 });
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  const formSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: formY.value - keyboardOffset.value }],
  }));

  const handleDragGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY([0, 8])
        .onUpdate((e) => { formY.value = Math.max(0, e.translationY); })
        .onEnd((e) => {
          if (e.translationY > 100 || e.velocityY > 600) {
            formY.value = withTiming(FORM_HEIGHT, { duration: 250, easing: Easing.in(Easing.cubic) });
            Keyboard.dismiss();
            setFormOpen(false);
          } else {
            formY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
          }
        }),
    []
  );

  function openForm() {
    setFormOpen(true);
    formY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) });
  }

  function closeForm() {
    Keyboard.dismiss();
    formY.value = withTiming(FORM_HEIGHT, { duration: 250, easing: Easing.in(Easing.cubic) });
    setFormOpen(false);
  }

  const { isLoading, data } = db.useQuery(
    routeId
      ? {
          routes: {
            $: { where: { id: routeId } },
            board: { photo: {}, routes: {} },
          },
        }
      : null
  );

  const route = data?.routes?.[0] as any;
  const board = route?.board;
  const photoUrl = board?.photo?.url;

  // Pre-populate fields once route data loads
  useEffect(() => {
    if (route && !loaded) {
      setHolds(parseHoldsOrEmpty(route.holds));
      setGrade(route.grade ?? "V0");
      setName(route.name ?? "");
      setDescription(route.description ?? "");
      setLoaded(true);
    }
  }, [route, loaded]);

  const hasGreenHold = holds.some((h) => h.color === "green");
  const hasRedHold = holds.some((h) => h.color === "red");
  const canSave = !!name.trim() && hasGreenHold && hasRedHold;

  async function save() {
    if (!user || !board || !routeId) return;
    if (!name.trim()) { Alert.alert("Missing info", "Please enter a route name."); return; }
    const otherRoutes = ((board.routes ?? []) as any[]).filter((r: any) => r.id !== routeId);
    if (otherRoutes.some((r: any) => r.name.toLowerCase() === name.trim().toLowerCase())) {
      Alert.alert("Duplicate name", "Another route with this name already exists on the board.");
      return;
    }
    if (!hasGreenHold || !hasRedHold) {
      Alert.alert("Incomplete route", "Add at least one green (start) hold and one red (finish) hold.");
      return;
    }
    setSaving(true);
    try {
      const routeData: Record<string, unknown> = {
        name: name.trim(),
        grade,
        holds: JSON.stringify(holds),
      };
      if (description.trim()) routeData.description = description.trim();
      await db.transact([db.tx.routes[routeId].update(routeData)]);
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to save route.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || !loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!route) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <Text style={{ color: "#4b5563", textAlign: "center" }}>Route not found.</Text>
      </View>
    );
  }

  const hint = holds.length === 0
    ? "Tap to place · Pinch to zoom"
    : !hasGreenHold ? "● Add a green start hold"
    : !hasRedHold ? "● Add a red finish hold"
    : null;

  const badgeTop = insets.top + 48;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Stack.Screen options={{ title: "Edit route", gestureEnabled: !formOpen }} />

      <HoldOverlay
        photoUrl={photoUrl}
        holds={holds}
        mode="interactive"
        activeColor={activeColor}
        activeSize={activeSize}
        onHoldsChange={setHolds}
      />

      <View style={[styles.holdCountBadge, { top: badgeTop }]}>
        <Text style={styles.holdCountText}>{holds.length} hold{holds.length !== 1 ? "s" : ""}</Text>
      </View>

      {hint !== null && (
        <View style={[styles.hintBadge, { top: badgeTop }]}>
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      )}

      <View style={styles.colorPickerRow}>
        {HOLD_COLORS.map(({ color, hex }) => (
          <TouchableOpacity
            key={color}
            onPress={() => setActiveColor(color)}
            style={[styles.colorDot, {
              backgroundColor: hex,
              borderWidth: activeColor === color ? 3 : 2,
              borderColor: activeColor === color ? "#fff" : "rgba(255,255,255,0.4)",
            }]}
          />
        ))}
      </View>

      {!formOpen && (
        <View style={styles.sizePicker}>
          {(["small", "medium", "large"] as HoldSize[]).map((s) => {
            const dotSize = HOLD_SIZES[s];
            const active = activeSize === s;
            return (
              <TouchableOpacity key={s} onPress={() => setActiveSize(s)} style={styles.sizePickerBtn}>
                <View style={{
                  width: dotSize * 0.7 + 8,
                  height: dotSize * 0.7 + 8,
                  borderRadius: (dotSize * 0.7 + 8) / 2,
                  backgroundColor: active ? "rgba(255,255,255,0.25)" : "transparent",
                  borderWidth: 2,
                  borderColor: active ? "#fff" : "rgba(255,255,255,0.4)",
                }} />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {!formOpen && (
        <TouchableOpacity style={styles.openFormBtn} onPress={openForm}>
          <Ionicons name="chevron-up" size={16} color="#fff" />
          <Text style={styles.openFormBtnText}>Route details</Text>
        </TouchableOpacity>
      )}

      {formOpen && (
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeForm} />
      )}

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={INPUT_ACCESSORY_ID}>
          <View style={styles.inputAccessory}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.inputAccessoryBtn}>
              <Ionicons name="chevron-down" size={16} color="#6366f1" />
              <Text style={styles.inputAccessoryText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}

      <Animated.View style={[styles.formSheet, formSheetStyle]}>
        <GestureDetector gesture={handleDragGesture}>
          <View style={styles.sheetHeader}>
            <View style={{ width: 48 }} />
            <View style={styles.handleBar} />
            <TouchableOpacity onPress={closeForm} style={{ width: 48, alignItems: "flex-end" }}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </GestureDetector>

        <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>Grade</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8 }}>
            {GRADES.map((g) => (
              <TouchableOpacity
                key={g}
                onPress={() => setGrade(g)}
                style={[styles.gradePill, { backgroundColor: grade === g ? "#6366f1" : "#e5e7eb" }]}
              >
                <Text style={[styles.gradePillText, { color: grade === g ? "#fff" : "#4b5563" }]}>{g}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.sectionLabel}>Route name *</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. The Crimper"
            placeholderTextColor="#9ca3af"
            value={name}
            onChangeText={setName}
            maxLength={100}
            returnKeyType="next"
            inputAccessoryViewID={INPUT_ACCESSORY_ID}
          />

          <Text style={styles.sectionLabel}>Description (optional)</Text>
          <TextInput
            style={[styles.textInput, { height: 72, textAlignVertical: "top" }]}
            placeholder="Describe the movement or style..."
            placeholderTextColor="#9ca3af"
            value={description}
            onChangeText={setDescription}
            maxLength={500}
            multiline
            numberOfLines={3}
            inputAccessoryViewID={INPUT_ACCESSORY_ID}
          />

          <TouchableOpacity
            onPress={save}
            disabled={saving || !canSave}
            style={[styles.saveBtn, { opacity: saving || !canSave ? 0.45 : 1 }]}
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  holdCountBadge: { position: "absolute", right: 12, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
  holdCountText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  hintBadge: { position: "absolute", left: 12, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  hintText: { color: "#fff", fontSize: 12 },
  colorPickerRow: { position: "absolute", bottom: 16, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 16, paddingVertical: 8 },
  colorDot: { width: 36, height: 36, borderRadius: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 3, elevation: 4 },
  sizePicker: { position: "absolute", bottom: 80, left: 16, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  sizePickerBtn: { alignItems: "center", justifyContent: "center", width: 36, height: 36 },
  openFormBtn: { position: "absolute", bottom: 80, right: 16, flexDirection: "row", alignItems: "center", backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  openFormBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  formSheet: { position: "absolute", bottom: 0, left: 0, right: 0, height: FORM_HEIGHT, backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, shadowColor: "#000", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 20 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  handleBar: { width: 40, height: 4, backgroundColor: "#e5e7eb", borderRadius: 2 },
  doneText: { color: "#6366f1", fontWeight: "600", fontSize: 15 },
  formContent: { padding: 16, paddingBottom: 32 },
  sectionLabel: { fontSize: 11, fontWeight: "600", color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  gradePill: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  gradePillText: { fontSize: 14, fontWeight: "600" },
  textInput: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: "#111827", backgroundColor: "#fff", marginBottom: 16 },
  saveBtn: { backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  inputAccessory: { flexDirection: "row", justifyContent: "flex-end", backgroundColor: "#f3f4f6", borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingHorizontal: 16, paddingVertical: 8 },
  inputAccessoryBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  inputAccessoryText: { color: "#6366f1", fontWeight: "600", fontSize: 15 },
});
