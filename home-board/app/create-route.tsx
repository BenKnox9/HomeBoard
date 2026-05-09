import HoldOverlay, { Hold, HoldColor } from "@/components/HoldOverlay";
import { db } from "@/lib/db";
import { GRADES } from "@/lib/grades";
import { id } from "@instantdb/react-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const HOLD_COLORS: { color: HoldColor; hex: string }[] = [
  { color: "green", hex: "#22c55e" },
  { color: "blue", hex: "#3b82f6" },
  { color: "purple", hex: "#a855f7" },
  { color: "red", hex: "#ef4444" },
];

export default function CreateRouteScreen() {
  const router = useRouter();
  const { user } = db.useAuth();

  const [holds, setHolds] = useState<Hold[]>([]);
  const [activeColor, setActiveColor] = useState<HoldColor>("red");
  const [grade, setGrade] = useState("V0");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const { isLoading, data } = db.useQuery(
    user
      ? {
          $users: {
            $: { where: { id: user.id } },
            selectedBoard: {
              photo: {},
            },
          },
        }
      : null
  );

  const board = data?.$users?.[0]?.selectedBoard;
  const photoUrl = (board as any)?.photo?.url;

  async function save() {
    if (!user || !board || !name.trim()) {
      Alert.alert("Missing info", "Please enter a route name.");
      return;
    }
    setSaving(true);
    try {
      const routeId = id();
      // Build update object without undefined values — InstantDB rejects them
      const routeData: Record<string, unknown> = {
        name: name.trim(),
        grade,
        holds: JSON.stringify(holds),
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
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!board) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-8">
        <Text className="text-gray-600 text-center text-base">
          No board selected. Go to your profile to add one.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Board photo with interactive hold overlay — fixed height */}
      <View style={{ height: 320, backgroundColor: "#1f2937" }}>
        <HoldOverlay
          photoUrl={photoUrl}
          holds={holds}
          mode="interactive"
          activeColor={activeColor}
          onHoldsChange={setHolds}
        />

        {/* Color picker overlaid at bottom of photo */}
        <View className="absolute bottom-3 left-0 right-0 flex-row justify-center gap-x-4">
          {HOLD_COLORS.map(({ color, hex }) => (
            <TouchableOpacity
              key={color}
              onPress={() => setActiveColor(color)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: hex,
                borderWidth: activeColor === color ? 3 : 2,
                borderColor:
                  activeColor === color ? "#fff" : "rgba(255,255,255,0.4)",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.4,
                shadowRadius: 3,
                elevation: 4,
              }}
            />
          ))}
        </View>

        {/* Hold count badge */}
        <View className="absolute top-3 right-3 bg-black/50 rounded-full px-3 py-1">
          <Text className="text-white text-xs font-semibold">
            {holds.length} hold{holds.length !== 1 ? "s" : ""}
          </Text>
        </View>

        {/* Tap / pinch hint */}
        {holds.length === 0 && (
          <View className="absolute top-3 left-3 bg-black/50 rounded-lg px-3 py-1.5">
            <Text className="text-white text-xs">Tap to place · Pinch to zoom</Text>
          </View>
        )}
      </View>

      {/* Keyboard-aware form */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Grade picker */}
          <Text className="text-xs font-semibold text-gray-400 uppercase mb-2">
            Grade
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4"
            contentContainerStyle={{ gap: 8 }}
          >
            {GRADES.map((g) => (
              <TouchableOpacity
                key={g}
                onPress={() => setGrade(g)}
                className="rounded-full px-4 py-2"
                style={{
                  backgroundColor: grade === g ? "#6366f1" : "#e5e7eb",
                }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: grade === g ? "#fff" : "#4b5563" }}
                >
                  {g}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Name */}
          <Text className="text-xs font-semibold text-gray-400 uppercase mb-1">
            Route Name *
          </Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 bg-white mb-4"
            placeholder="e.g. The Crimper"
            placeholderTextColor="#9ca3af"
            value={name}
            onChangeText={setName}
            returnKeyType="next"
          />

          {/* Description */}
          <Text className="text-xs font-semibold text-gray-400 uppercase mb-1">
            Description (optional)
          </Text>
          <TextInput
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 bg-white mb-6"
            placeholder="Describe the movement or style..."
            placeholderTextColor="#9ca3af"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Save button */}
          <TouchableOpacity
            onPress={save}
            disabled={saving || !name.trim()}
            className="bg-indigo-600 rounded-xl py-4 items-center mb-8"
            style={{ opacity: saving || !name.trim() ? 0.5 : 1 }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-base">Save Route</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
