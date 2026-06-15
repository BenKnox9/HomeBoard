import HoldOverlay, { Hold, HoldColor, HoldSize, HOLD_SIZES } from "@/components/HoldOverlay";
import { db } from "@/lib/db";
import { GRADES } from "@/lib/grades";
import { id } from "@instantdb/react-native";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const HOLD_COLORS: { color: HoldColor; hex: string }[] = [
  { color: "green", hex: "#22c55e" },
  { color: "blue", hex: "#3b82f6" },
  { color: "purple", hex: "#a855f7" },
  { color: "red", hex: "#ef4444" },
];

const FORM_HEIGHT = 400;
const INPUT_ACCESSORY_ID = "create-route";

export default function CreateRouteScreen() {
  const router = useRouter();
  const { user } = db.useAuth();
  const isDark = useColorScheme() === "dark";

  const [holds, setHolds] = useState<Hold[]>([]);
  const [activeColor, setActiveColor] = useState<HoldColor>("green");
  const [activeSize, setActiveSize] = useState<HoldSize>("medium");
  const [grade, setGrade] = useState("V0");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allowMatch, setAllowMatch] = useState(true);
  const [forceSequence, setForceSequence] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [showLegend, setShowLegend] = useState(false);

  // Wraps HoldOverlay's onHoldsChange to maintain sequence numbers on blue
  // holds when "Force sequence" is on, and to keep them consecutive on removal.
  function handleHoldsChange(newHolds: Hold[]) {
    if (newHolds.length > holds.length) {
      const addedHold = newHolds[newHolds.length - 1];
      if (forceSequence && addedHold.color === "blue") {
        const nextSeq =
          newHolds.filter((h) => h.color === "blue" && h.sequence !== undefined).length + 1;
        setHolds(
          newHolds.map((h) => (h.id === addedHold.id ? { ...h, sequence: nextSeq } : h))
        );
        return;
      }
      setHolds(newHolds);
      return;
    }
    if (newHolds.length < holds.length) {
      let n = 0;
      setHolds(
        newHolds.map((h) => {
          if (h.color === "blue" && h.sequence !== undefined) {
            n += 1;
            return { ...h, sequence: n };
          }
          return h;
        })
      );
      return;
    }
    setHolds(newHolds);
  }

  // Slide-up form sheet — withTiming for a smooth non-bouncy animation
  const formY = useSharedValue(FORM_HEIGHT);
  const keyboardOffset = useSharedValue(0);

  // Mirror the keyboard animation exactly using the event's own duration
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e) => {
      keyboardOffset.value = withTiming(e.endCoordinates.height, {
        duration: Platform.OS === "ios" ? e.duration : 200,
      });
    });
    const hide = Keyboard.addListener(hideEvent, (e) => {
      keyboardOffset.value = withTiming(0, {
        duration: Platform.OS === "ios" ? e.duration : 200,
      });
    });
    return () => { show.remove(); hide.remove(); };
    // keyboardOffset is a SharedValue — its identity is stable across
    // renders, so listing it here doesn't cause this effect to re-run.
  }, [keyboardOffset]);

  const formSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: formY.value - keyboardOffset.value }],
  }));

  // Drag the handle bar: visual follow on update, snap or close on end.
  // .runOnJS(true) keeps all callbacks on the JS thread so we can call
  // setFormOpen/Keyboard.dismiss directly; withTiming still drives the
  // animation on the UI thread regardless of where it is called from.
  const handleDragGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetY([0, 8])
        .onUpdate((e) => {
          formY.value = Math.max(0, e.translationY);
        })
        .onEnd((e) => {
          if (e.translationY > 100 || e.velocityY > 600) {
            formY.value = withTiming(FORM_HEIGHT, { duration: 250, easing: Easing.in(Easing.cubic) });
            Keyboard.dismiss();
            setFormOpen(false);
          } else {
            formY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
          }
        }),
    // formY is a SharedValue — its identity is stable across renders, so
    // listing it here doesn't recreate the gesture mid-interaction.
    [formY]
  );

  function openForm() {
    setFormOpen(true);
    formY.value = withTiming(0, {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    });
  }

  function closeForm() {
    Keyboard.dismiss();
    formY.value = withTiming(FORM_HEIGHT, {
      duration: 250,
      easing: Easing.in(Easing.cubic),
    });
    setFormOpen(false);
  }

  const { isLoading, error, data } = db.useQuery(
    user
      ? { $users: { $: { where: { id: user.id } }, selectedBoard: { photo: {}, routes: {} } } }
      : null
  );

  const board = data?.$users?.[0]?.selectedBoard;
  const photoUrl = (board as any)?.photo?.url;

  const hasGreenHold = holds.some((h) => h.color === "green");
  const hasRedHold = holds.some((h) => h.color === "red");
  const canSave = !!name.trim() && hasGreenHold && hasRedHold;

  async function save() {
    if (!user || !board) return;
    if (!name.trim()) {
      Alert.alert("Missing info", "Please enter a route name.");
      return;
    }
    const existingRoutes = ((board as any)?.routes ?? []) as any[];
    if (existingRoutes.some((r: any) => r.name.toLowerCase() === name.trim().toLowerCase())) {
      Alert.alert("Duplicate name", "A route with this name already exists on your board. Please choose a different name.");
      return;
    }
    if (!hasGreenHold || !hasRedHold) {
      Alert.alert(
        "Incomplete route",
        "Add at least one green (start) hold and one red (finish) hold."
      );
      return;
    }
    setSaving(true);
    try {
      const routeId = id();
      const routeData: Record<string, unknown> = {
        name: name.trim(),
        grade,
        holds: JSON.stringify(holds),
        allowMatch,
        createdAt: Date.now(),
      };
      if (description.trim()) {
        routeData.description = description.trim();
      }
      await db.transact([
        db.tx.routes[routeId]
          .update(routeData)
          .link({ board: board.id, creator: user.id }),
      ]);
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to save route.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
        <Text style={{ color: "#ef4444", textAlign: "center", fontSize: 14 }}>
          {error.message}
        </Text>
      </View>
    );
  }

  if (!board) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 32,
        }}
      >
        <Text style={{ color: "#4b5563", textAlign: "center", fontSize: 16 }}>
          No board selected. Go to your profile to add one.
        </Text>
      </View>
    );
  }

  // Contextual hint — guides the setter through the colour requirements
  const hint =
    holds.length === 0
      ? "Tap to place · Pinch to zoom"
      : !hasGreenHold
      ? "● Add a green start hold"
      : !hasRedHold
      ? "● Add a red finish hold"
      : null;

  // Badges sit just below the top bar
  const badgeTop = 60;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* Disable the native modal swipe-down-to-dismiss when the form is open
          so the grab-bar gesture always wins over the navigation gesture */}
      <Stack.Screen
        options={{
          gestureEnabled: !formOpen,
        }}
      />

      {/* Full-screen interactive image — fills the whole screen behind the custom top bar */}
      <HoldOverlay
        photoUrl={photoUrl}
        holds={holds}
        mode="interactive"
        activeColor={activeColor}
        activeSize={activeSize}
        onHoldsChange={handleHoldsChange}
      />

      {/* Top bar — back button, title, and help button, all inline */}
      <View style={[styles.topBar, { top: 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Close"
          style={styles.iconBtn}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={styles.holdCountBadge}>
          <Text style={styles.holdCountText}>New route</Text>
        </View>

        <TouchableOpacity
          onPress={() => setShowLegend(true)}
          accessibilityLabel="Hold colour legend"
          style={styles.iconBtn}
        >
          <Text style={styles.iconBtnText}>?</Text>
        </TouchableOpacity>
      </View>

      {/* Force-sequence toggle — top right */}
      <View style={{ position: "absolute", top: badgeTop, right: 16 }}>
        <TouchableOpacity
          onPress={() => setForceSequence((v) => !v)}
          accessibilityLabel={forceSequence ? "Disable force sequence" : "Enable force sequence"}
          style={[
            styles.holdCountBadge,
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: forceSequence ? "#6366f1" : "rgba(0,0,0,0.65)",
            },
          ]}
        >
          <Ionicons name="list-outline" size={13} color="#fff" />
          <Text style={styles.holdCountText}>Sequence</Text>
        </TouchableOpacity>
      </View>

      {/* Contextual hint — top left */}
      {hint !== null && (
        <View style={[styles.hintBadge, { top: badgeTop }]}>
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      )}

      {/* Colour picker — fixed at bottom, stays put when form slides up */}
      <View style={styles.colorPickerRow}>
        {HOLD_COLORS.map(({ color, hex }) => (
          <TouchableOpacity
            key={color}
            onPress={() => setActiveColor(color)}
            accessibilityLabel={`${color} hold colour`}
            style={[
              styles.colorDot,
              {
                backgroundColor: hex,
                borderWidth: activeColor === color ? 3 : 2,
                borderColor:
                  activeColor === color ? "#fff" : "rgba(255,255,255,0.4)",
              },
            ]}
          />
        ))}
      </View>

      {/* Size picker — bottom left, only shown when form is closed */}
      {!formOpen && (
        <View style={styles.sizePicker}>
          {(["small", "medium", "large"] as HoldSize[]).map((s) => {
            const dotSize = HOLD_SIZES[s];
            const active = activeSize === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setActiveSize(s)}
                accessibilityLabel={`${s} hold size`}
                style={styles.sizePickerBtn}
              >
                <View
                  style={{
                    width: dotSize * 0.7 + 8,
                    height: dotSize * 0.7 + 8,
                    borderRadius: (dotSize * 0.7 + 8) / 2,
                    backgroundColor: active ? "rgba(255,255,255,0.25)" : "transparent",
                    borderWidth: 2,
                    borderColor: active ? "#fff" : "rgba(255,255,255,0.4)",
                  }}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* "Route details" toggle — only shown when form is closed */}
      {!formOpen && (
        <TouchableOpacity style={styles.openFormBtn} onPress={openForm}>
          <Ionicons name="chevron-up" size={16} color="#fff" />
          <Text style={styles.openFormBtnText}>Route details</Text>
        </TouchableOpacity>
      )}

      {/* Backdrop — when form is open, tapping the board area closes the form */}
      {formOpen && (
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={closeForm}
        />
      )}

      {/* Keyboard dismiss toolbar — iOS only */}
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

      {/* Help modal — hold colour legend + how-to guide */}
      <Modal visible={showLegend} transparent animationType="fade" onRequestClose={() => setShowLegend(false)}>
        <View
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center" }}
        >
          <View
            style={{
              backgroundColor: isDark ? "#1f2937" : "#fff",
              borderRadius: 20,
              padding: 24,
              width: 300,
              maxHeight: "80%",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "700", color: isDark ? "#f3f4f6" : "#111827", marginBottom: 16 }}>
              Help
            </Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Hold colours */}
              <Text style={{ fontSize: 12, fontWeight: "700", color: isDark ? "#9ca3af" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
                Hold colours
              </Text>
              {[
                { hex: "#22c55e", label: "Green", desc: "Start holds" },
                { hex: "#3b82f6", label: "Blue", desc: "Hand and foot holds" },
                { hex: "#a855f7", label: "Purple", desc: "Feet only holds" },
                { hex: "#ef4444", label: "Red", desc: "End holds" },
              ].map(({ hex, label, desc }) => (
                <View key={label} style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: hex, marginRight: 12 }} />
                  <View>
                    <Text style={{ fontWeight: "600", color: isDark ? "#f3f4f6" : "#111827", fontSize: 14 }}>{label}</Text>
                    <Text style={{ color: "#9ca3af", fontSize: 12 }}>{desc}</Text>
                  </View>
                </View>
              ))}

              {/* Divider */}
              <View style={{ height: 1, backgroundColor: isDark ? "#374151" : "#f3f4f6", marginVertical: 16 }} />

              {/* How it works */}
              <Text style={{ fontSize: 12, fontWeight: "700", color: isDark ? "#9ca3af" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
                How it works
              </Text>
              {[
                { title: "Placing holds", desc: "Tap the board to place a dot, and tap a dot again to remove it. Pinch to zoom and drag to pan for precise placement." },
                { title: "Dot size", desc: "Change the dot size with the picker at the bottom." },
                { title: "Force sequence", desc: "Tap Sequence to number your holds automatically — each blue hold gets the next number in order so you can set a required climbing sequence." },
                { title: "Saving", desc: "Add the route's details to save the route." },
              ].map(({ title, desc }) => (
                <View key={title} style={{ marginBottom: 12 }}>
                  <Text style={{ fontWeight: "600", color: isDark ? "#f3f4f6" : "#111827", fontSize: 14, marginBottom: 2 }}>{title}</Text>
                  <Text style={{ color: isDark ? "#9ca3af" : "#6b7280", fontSize: 12, lineHeight: 18 }}>{desc}</Text>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setShowLegend(false)}
              style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 10, alignItems: "center", marginTop: 8 }}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sliding form sheet */}
      <Animated.View style={[styles.formSheet, formSheetStyle]}>
        {/* Header row: drag handle + Done button */}
        <GestureDetector gesture={handleDragGesture}>
          <View style={styles.sheetHeader}>
            <View style={{ width: 48 }} />
            <View style={styles.handleBar} />
            <TouchableOpacity
              onPress={closeForm}
              style={{ width: 48, alignItems: "flex-end" }}
            >
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </GestureDetector>

        <ScrollView
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Grade */}
          <Text style={styles.sectionLabel}>Grade</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginBottom: 16 }}
            contentContainerStyle={{ gap: 8 }}
          >
            {GRADES.map((g) => (
              <TouchableOpacity
                key={g}
                onPress={() => setGrade(g)}
                style={[
                  styles.gradePill,
                  { backgroundColor: grade === g ? "#6366f1" : "#e5e7eb" },
                ]}
              >
                <Text
                  style={[
                    styles.gradePillText,
                    { color: grade === g ? "#fff" : "#4b5563" },
                  ]}
                >
                  {g}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Route name */}
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

          {/* Description */}
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

          {/* Match / No-match */}
          <Text style={styles.sectionLabel}>Match</Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => setAllowMatch(true)}
              style={[styles.gradePill, { backgroundColor: allowMatch ? "#6366f1" : "#e5e7eb" }]}
            >
              <Text style={[styles.gradePillText, { color: allowMatch ? "#fff" : "#4b5563" }]}>
                Match allowed
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setAllowMatch(false)}
              style={[styles.gradePill, { backgroundColor: !allowMatch ? "#6366f1" : "#e5e7eb" }]}
            >
              <Text style={[styles.gradePillText, { color: !allowMatch ? "#fff" : "#4b5563" }]}>
                No match
              </Text>
            </TouchableOpacity>
          </View>

          {/* Save */}
          <TouchableOpacity
            onPress={save}
            disabled={saving || !canSave}
            style={[styles.saveBtn, { opacity: saving || !canSave ? 0.45 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save route</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    zIndex: 10,
  },

  holdCountBadge: {
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  holdCountText: { color: "#fff", fontSize: 12, fontWeight: "600" },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  hintBadge: {
    position: "absolute",
    left: 16,
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  hintText: { color: "#fff", fontSize: 12 },

  colorPickerRow: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 8,
  },
  colorDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },

  sizePicker: {
    position: "absolute",
    bottom: 80,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sizePickerBtn: {
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
  },

  openFormBtn: {
    position: "absolute",
    bottom: 80,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  openFormBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },

  formSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: FORM_HEIGHT,
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: "#e5e7eb",
    borderRadius: 2,
  },
  doneText: { color: "#6366f1", fontWeight: "600", fontSize: 15 },

  formContent: { padding: 16, paddingBottom: 32 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9ca3af",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  gradePill: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  gradePillText: { fontSize: 14, fontWeight: "600" },

  textInput: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#fff",
    marginBottom: 16,
  },

  saveBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  inputAccessory: {
    flexDirection: "row",
    justifyContent: "flex-end",
    backgroundColor: "#f3f4f6",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  inputAccessoryBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  inputAccessoryText: { color: "#6366f1", fontWeight: "600", fontSize: 15 },
});
