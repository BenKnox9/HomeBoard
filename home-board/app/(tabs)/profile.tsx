import { db } from "@/lib/db";
import { GRADES, gradeBadgeColor } from "@/lib/grades";
import { ImageValidationError, prepareImage } from "@/lib/imageUtils";
import { useTheme } from "@/contexts/ThemeContext";
import { id } from "@instantdb/react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
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

const PROFILE_ACCESSORY_ID = "profile-inputs";

const COUNTRIES = [
  "Argentina", "Australia", "Austria", "Belgium", "Brazil", "Canada",
  "Chile", "China", "Colombia", "Croatia", "Czech Republic", "Denmark",
  "Finland", "France", "Germany", "Greece", "Hungary", "India", "Ireland",
  "Italy", "Japan", "Mexico", "Netherlands", "New Zealand", "Norway",
  "Poland", "Portugal", "Russia", "Slovakia", "Slovenia", "South Africa",
  "South Korea", "Spain", "Sweden", "Switzerland", "United Kingdom",
  "United States", "Other",
];
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// ── Swipeable playlist row ────────────────────────────────────────────────────

function SwipeablePlaylistRow({
  pl,
  onPress,
  onDeleteRequest,
}: {
  pl: any;
  onPress: () => void;
  onDeleteRequest: () => void;
}) {
  const isDark = useColorScheme() === "dark";
  const translateX = useSharedValue(0);
  const savedX = useSharedValue(0);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-5, 5])
    .onStart(() => {
      savedX.value = translateX.value;
    })
    .onUpdate((e) => {
      translateX.value = Math.max(-80, Math.min(0, savedX.value + e.translationX));
    })
    .onEnd((e) => {
      const finalX = savedX.value + e.translationX;
      if (finalX < -40 || e.velocityX < -500) {
        translateX.value = withTiming(-80, { duration: 220 });
        savedX.value = -80;
      } else {
        translateX.value = withTiming(0, { duration: 220 });
        savedX.value = 0;
      }
    });

  // Tap fires only when the finger hasn't moved enough to trigger the pan.
  // Gesture.Race means whichever activates first wins — a clean tap (< 5px
  // movement, lifts before pan's 10px threshold) fires onPress; a swipe
  // activates the pan first and the tap is cancelled, so onPress never fires.
  const tap = Gesture.Tap()
    .runOnJS(true)
    .maxDeltaX(5)
    .onEnd((_, success) => {
      if (!success) return;
      if (Math.abs(translateX.value) > 10) {
        // Row was open — close it instead of navigating
        translateX.value = withTiming(0, { duration: 220 });
        savedX.value = 0;
      } else {
        onPress();
      }
    });

  return (
    <View style={{ marginBottom: 8 }}>
      {/* Delete button sits behind the row */}
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
            translateX.value = withTiming(0);
            savedX.value = 0;
            onDeleteRequest();
          }}
          style={{ flex: 1, width: "100%", justifyContent: "center", alignItems: "center" }}
        >
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Delete</Text>
        </TouchableOpacity>
      </View>

      {/* Swipeable row — Race ensures tap wins on clean press, pan wins on swipe */}
      <GestureDetector gesture={Gesture.Race(pan, tap)}>
        <Animated.View style={rowStyle}>
          <View
            className="rounded-2xl p-4 flex-row items-center"
            style={{ backgroundColor: isDark ? "#1f2937" : "#ffffff" }}
          >
            <View className="flex-1">
              <Text className="text-gray-800 dark:text-gray-100 font-semibold">{pl.name}</Text>
              <Text className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">
                {pl.routes?.length ?? 0} route
                {(pl.routes?.length ?? 0) !== 1 ? "s" : ""}
              </Text>
            </View>
            <Text className="text-gray-300 dark:text-gray-600 text-lg">›</Text>
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ── Profile screen ────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user } = db.useAuth();
  const { isDark, toggleTheme } = useTheme();

  const { isLoading, data } = db.useQuery(
    user
      ? {
          $users: {
            $: { where: { id: user.id } },
            selectedBoard: {},
            ascents: {
              route: {},
            },
            playlists: {
              routes: {},
              board: {},
            },
            likes: {
              route: {
                ascents: {},
              },
            },
          },
          boards: {},
        }
      : null
  );

  const [showBoardPicker, setShowBoardPicker] = useState(false);
  const [showAddBoard, setShowAddBoard] = useState(false);
  const [showAddPlaylist, setShowAddPlaylist] = useState(false);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardDesc, setNewBoardDesc] = useState("");
  const [newBoardCountry, setNewBoardCountry] = useState("");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [pickerCountry, setPickerCountry] = useState<string | null>(null);

  const currentUser = data?.$users?.[0];
  const selectedBoard = currentUser?.selectedBoard;
  const ascents = currentUser?.ascents ?? [];
  const allBoards = data?.boards ?? [];
  const currentUsername = (currentUser as any)?.username as string | undefined;

  const { uniqueDays, sessions, climbsPerSession } = useMemo(() => {
    const SESSION_GAP_MS = 60 * 60 * 1000;
    const ud = new Set(
      ascents.map((a: any) => new Date(a.loggedAt).toDateString())
    ).size;
    if (ascents.length === 0) return { uniqueDays: 0, sessions: 0, climbsPerSession: "0" };
    const sorted = [...ascents].sort((a: any, b: any) => a.loggedAt - b.loggedAt);
    let s = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].loggedAt - sorted[i - 1].loggedAt > SESSION_GAP_MS) s++;
    }
    return { uniqueDays: ud, sessions: s, climbsPerSession: (ascents.length / s).toFixed(1) };
  }, [ascents]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const playlists = (currentUser?.playlists ?? []).filter(
    (pl: any) => pl.board?.id === selectedBoard?.id || selectedBoard == null
  );

  const likedRoutes = (currentUser?.likes ?? [])
    .map((l: any) => l.route)
    .filter(Boolean)
    .filter(
      (r: any, i: number, arr: any[]) =>
        arr.findIndex((x) => x.id === r.id) === i
    );

  async function saveUsername() {
    if (!user) return;
    const trimmed = usernameInput.trim().toLowerCase();
    if (!trimmed) return;
    try {
      await db.transact([db.tx.$users[user.id].update({ username: trimmed } as any)]);
      setEditingUsername(false);
    } catch (e: any) {
      const msg = e.message ?? "";
      Alert.alert(
        "Error",
        msg.toLowerCase().includes("unique")
          ? "That username is already taken. Please choose another."
          : msg || "Failed to save username."
      );
    }
  }

  async function selectBoard(boardId: string) {
    if (!user) return;
    await db.transact([
      db.tx.$users[user.id].link({ selectedBoard: boardId }),
    ]);
    setShowBoardPicker(false);
    setPickerCountry(null);
  }

  async function addBoard() {
    if (!user || !newBoardName.trim()) return;

    if (!newBoardCountry) {
      Alert.alert("Country required", "Please select a country for this board.");
      return;
    }

    // Client-side uniqueness check for board name
    const nameExists = (allBoards as any[]).some(
      (b: any) => b.name.toLowerCase() === newBoardName.trim().toLowerCase()
    );
    if (nameExists) {
      Alert.alert("Duplicate name", "A board with that name already exists.");
      return;
    }

    setSaving(true);
    try {
      const boardId = id();

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      let fileId: string | undefined;
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const prepared = await prepareImage({
          uri: asset.uri,
          width: asset.width ?? undefined,
          height: asset.height ?? undefined,
          fileSize: asset.fileSize ?? undefined,
          mimeType: asset.mimeType ?? undefined,
        });
        const filename = `photo_${Date.now()}.jpg`;
        const uploadResult = await db.storage.uploadFile(
          `boards/${boardId}/${filename}`,
          { uri: prepared.uri, name: filename, type: prepared.mimeType } as any
        );
        fileId = uploadResult.data?.id;
      }

      const txs: any[] = [
        db.tx.boards[boardId]
          .update({
            name: newBoardName.trim(),
            country: newBoardCountry,
            description: newBoardDesc.trim() || undefined,
            createdAt: Date.now(),
          })
          .link({ creator: user.id }),
      ];

      if (fileId) {
        txs[0] = txs[0].link({ photo: fileId });
      }

      await db.transact(txs);
      await db.transact([
        db.tx.$users[user.id].link({ selectedBoard: boardId }),
      ]);

      setNewBoardName("");
      setNewBoardDesc("");
      setNewBoardCountry("");
      setShowAddBoard(false);
    } catch (e: any) {
      if (e instanceof ImageValidationError) {
        Alert.alert("Photo too large", e.message);
      } else {
        Alert.alert("Error", e.message ?? "Failed to create board.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function addPlaylist() {
    if (!user || !selectedBoard || !newPlaylistName.trim()) return;
    const plId = id();
    await db.transact([
      db.tx.playlists[plId]
        .update({ name: newPlaylistName.trim(), createdAt: Date.now() })
        .link({ creator: user.id, board: selectedBoard.id }),
    ]);
    setNewPlaylistName("");
    setShowAddPlaylist(false);
  }

  function deletePlaylist(plId: string) {
    Alert.alert(
      "Delete playlist",
      "Are you sure you want to delete this playlist? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            db.transact([db.tx.playlists[plId].delete()]);
          },
        },
      ]
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <View className="bg-white dark:bg-gray-800 pt-14 px-4 pb-6 border-b border-gray-100 dark:border-gray-700">
        <View className="flex-row items-center justify-between">
          <Text className="text-xl font-bold text-gray-800 dark:text-gray-100">Profile</Text>
          <TouchableOpacity
            onPress={toggleTheme}
            className="flex-row items-center gap-x-1.5 bg-gray-100 dark:bg-gray-700 rounded-xl px-3 py-1.5"
          >
            <Ionicons
              name={isDark ? "sunny-outline" : "moon-outline"}
              size={15}
              color={isDark ? "#fbbf24" : "#6366f1"}
            />
            <Text className="text-gray-600 dark:text-gray-300 text-xs font-medium">
              {isDark ? "Light mode" : "Dark mode"}
            </Text>
          </TouchableOpacity>
        </View>
        <Text className="text-gray-400 dark:text-gray-500 text-sm mt-1">{user?.email}</Text>

        {/* Username */}
        {editingUsername ? (
          <View className="flex-row items-center mt-3 gap-x-2">
            <TextInput
              className="flex-1 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-700"
              placeholder="Choose a username"
              placeholderTextColor="#9ca3af"
              value={usernameInput}
              onChangeText={setUsernameInput}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={saveUsername}
              inputAccessoryViewID={PROFILE_ACCESSORY_ID}
            />
            <TouchableOpacity
              onPress={saveUsername}
              className="bg-indigo-600 rounded-xl px-3 py-2"
            >
              <Text className="text-white font-semibold text-sm">Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingUsername(false)}>
              <Text className="text-gray-400 dark:text-gray-500 text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => {
              setUsernameInput(currentUsername ?? "");
              setEditingUsername(true);
            }}
            className="flex-row items-center mt-2 gap-x-1"
          >
            <Text className="text-gray-600 dark:text-gray-300 text-sm">
              {currentUsername ? `@${currentUsername}` : "Set username"}
            </Text>
            <Ionicons name="pencil-outline" size={12} color="#9ca3af" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => db.auth.signOut()}
          className="mt-4 border border-gray-200 dark:border-gray-600 rounded-xl py-2 items-center"
        >
          <Text className="text-gray-500 dark:text-gray-400 text-sm">Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Board Management */}
      <View className="mx-4 mt-6 mb-2">
        <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-3">
          Your board
        </Text>
        <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
          {selectedBoard ? (
            <Text className="text-gray-800 dark:text-gray-100 font-semibold text-base mb-3">
              {selectedBoard.name}
            </Text>
          ) : (
            <Text className="text-gray-400 dark:text-gray-500 text-sm mb-3">No board selected</Text>
          )}
          <View className="flex-row gap-x-2">
            <TouchableOpacity
              onPress={() => setShowBoardPicker(true)}
              className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-xl py-2 items-center"
            >
              <Text className="text-gray-600 dark:text-gray-300 font-medium text-sm">
                Change board
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowAddBoard(true)}
              className="flex-1 bg-indigo-600 rounded-xl py-2 items-center"
            >
              <Text className="text-white font-medium text-sm">Add board</Text>
            </TouchableOpacity>
          </View>
          {selectedBoard && (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/update-board-photo",
                  params: { boardId: selectedBoard.id },
                })
              }
              className="mt-2 bg-gray-100 dark:bg-gray-700 rounded-xl py-2.5 items-center flex-row justify-center"
              style={{ gap: 6 }}
            >
              <Ionicons name="camera-outline" size={16} color={isDark ? "#9ca3af" : "#6b7280"} />
              <Text className="text-gray-600 dark:text-gray-300 font-medium text-sm">
                Update board photo
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Playlists */}
      {selectedBoard && (
        <View className="mx-4 mt-6 mb-2">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase">
              Playlists
            </Text>
            <TouchableOpacity onPress={() => setShowAddPlaylist(true)}>
              <Text className="text-indigo-500 dark:text-indigo-400 text-sm font-semibold">
                + New playlist
              </Text>
            </TouchableOpacity>
          </View>

          {showAddPlaylist && (
            <View className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-3">
              <TextInput
                className="border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 mb-3"
                placeholder="Playlist name"
                placeholderTextColor="#9ca3af"
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={addPlaylist}
                inputAccessoryViewID={PROFILE_ACCESSORY_ID}
              />
              <View className="flex-row gap-x-2">
                <TouchableOpacity
                  onPress={() => {
                    setShowAddPlaylist(false);
                    setNewPlaylistName("");
                  }}
                  className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-xl py-2 items-center"
                >
                  <Text className="text-gray-600 dark:text-gray-300 text-sm">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={addPlaylist}
                  disabled={!newPlaylistName.trim()}
                  className="flex-1 bg-indigo-600 rounded-xl py-2 items-center"
                  style={{ opacity: !newPlaylistName.trim() ? 0.5 : 1 }}
                >
                  <Text className="text-white font-semibold text-sm">
                    Create
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {playlists.length === 0 ? (
            <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center">
                No playlists yet
              </Text>
            </View>
          ) : (
            playlists.map((pl: any) => (
              <SwipeablePlaylistRow
                key={pl.id}
                pl={pl}
                onPress={() =>
                  router.push({
                    pathname: "/playlist/[id]",
                    params: { id: pl.id },
                  })
                }
                onDeleteRequest={() => deletePlaylist(pl.id)}
              />
            ))
          )}
        </View>
      )}

      {/* Liked Routes */}
      {likedRoutes.length > 0 && (
        <View className="mx-4 mt-6 mb-2">
          <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-3">
            Liked routes
          </Text>
          {likedRoutes.map((r: any) => (
            <TouchableOpacity
              key={r.id}
              onPress={() =>
                router.push({ pathname: "/route/[id]", params: { id: r.id } })
              }
              className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-2 flex-row items-center"
            >
              <View
                className="rounded-xl items-center justify-center mr-3"
                style={{
                  backgroundColor: gradeBadgeColor(r.grade),
                  width: 40,
                  height: 40,
                }}
              >
                <Text className="text-white font-bold text-xs">{r.grade}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-gray-800 dark:text-gray-100 font-semibold" numberOfLines={1}>
                  {r.name}
                </Text>
                <Text className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">
                  {r.ascents?.length ?? 0} ascent{(r.ascents?.length ?? 0) !== 1 ? "s" : ""}
                </Text>
              </View>
              <Text className="text-gray-300 dark:text-gray-600 text-lg">›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Statistics */}
      <View className="mx-4 mt-6 mb-10">
        <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-3">
          Statistics
        </Text>
        <View className="bg-white dark:bg-gray-800 rounded-2xl p-4">
          <View className="flex-row mb-4">
            <StatBox label="Days climbed" value={String(uniqueDays)} />
            <StatBox label="Total ascents" value={String(ascents.length)} />
            <StatBox label="Climbs / session" value={climbsPerSession} />
          </View>

          <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-3">
            Ascents by grade
          </Text>
          {GRADES.map((g) => {
            const gradeAscents = ascents.filter(
              (a: any) => a.route?.grade === g
            );
            const count = gradeAscents.length;
            if (count === 0) return null;
            const avgAttempts =
              count > 0
                ? (
                    gradeAscents.reduce(
                      (s: number, a: any) => s + (a.attempts ?? 0),
                      0
                    ) / count
                  ).toFixed(1)
                : "-";
            return (
              <View key={g} className="flex-row items-center mb-2">
                <View
                  className="rounded-md items-center justify-center mr-3"
                  style={{
                    backgroundColor: gradeBadgeColor(g),
                    width: 36,
                    height: 24,
                  }}
                >
                  <Text className="text-white text-xs font-bold">{g}</Text>
                </View>
                <Text className="text-gray-600 dark:text-gray-300 text-sm flex-1">
                  {count} ascent{count !== 1 ? "s" : ""}
                </Text>
                <Text className="text-gray-400 dark:text-gray-500 text-xs">
                  avg {avgAttempts} tries
                </Text>
              </View>
            );
          })}
          {ascents.length === 0 && (
            <Text className="text-gray-400 dark:text-gray-500 text-sm text-center py-2">
              Log some ascents to see stats
            </Text>
          )}
        </View>
      </View>

      {/* Keyboard dismiss toolbar */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={PROFILE_ACCESSORY_ID}>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", backgroundColor: isDark ? "#1f2937" : "#f3f4f6", borderTopWidth: 1, borderTopColor: isDark ? "#374151" : "#e5e7eb", paddingHorizontal: 16, paddingVertical: 8 }}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="chevron-down" size={16} color="#6366f1" />
              <Text style={{ color: "#6366f1", fontWeight: "600", fontSize: 15 }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}

      {/* Board Picker Modal */}
      <Modal
        visible={showBoardPicker}
        transparent
        animationType="slide"
        onRequestClose={() => { setShowBoardPicker(false); setPickerCountry(null); }}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 justify-end"
          activeOpacity={1}
          onPress={() => { setShowBoardPicker(false); setPickerCountry(null); }}
        >
          <View className="bg-white dark:bg-gray-800 rounded-t-3xl p-6">
            {(() => {
              const anyHasCountry = (allBoards as any[]).some((b: any) => !!b.country);
              const boardCountries = (() => {
                const seen = new Set<string>();
                (allBoards as any[]).forEach((b: any) => seen.add(b.country || "Other"));
                return [...seen].sort((a, b) => {
                  if (a === "Other") return 1;
                  if (b === "Other") return -1;
                  return a.localeCompare(b);
                });
              })();
              const boardsInPickerCountry = (allBoards as any[]).filter((b: any) =>
                pickerCountry === "Other" ? !b.country : b.country === pickerCountry
              );

              if (allBoards.length === 0) {
                return (
                  <>
                    <Text className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">Select a board</Text>
                    <Text className="text-gray-400 dark:text-gray-500 text-center py-4">
                      No boards available. Add one first.
                    </Text>
                  </>
                );
              }

              if (!anyHasCountry || pickerCountry !== null) {
                const boards = anyHasCountry ? boardsInPickerCountry : (allBoards as any[]);
                return (
                  <>
                    <View className="flex-row items-center mb-4">
                      {anyHasCountry && (
                        <TouchableOpacity
                          onPress={() => setPickerCountry(null)}
                          style={{ marginRight: 8 }}
                        >
                          <Ionicons name="chevron-back" size={22} color="#6366f1" />
                        </TouchableOpacity>
                      )}
                      <Text className="text-lg font-bold text-gray-800 dark:text-gray-100 flex-1">
                        {anyHasCountry ? pickerCountry : "Select a board"}
                      </Text>
                    </View>
                    {boards.map((b: any) => (
                      <TouchableOpacity
                        key={b.id}
                        onPress={() => selectBoard(b.id)}
                        className="py-3 border-b border-gray-100 dark:border-gray-700 flex-row items-center"
                      >
                        <Text className="text-gray-800 dark:text-gray-100 flex-1">{b.name}</Text>
                        {selectedBoard?.id === b.id && (
                          <Text className="text-indigo-500 dark:text-indigo-400 font-semibold text-sm">Selected</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </>
                );
              }

              return (
                <>
                  <Text className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">Select a country</Text>
                  {boardCountries.map((c) => {
                    const count = (allBoards as any[]).filter((b: any) =>
                      c === "Other" ? !b.country : b.country === c
                    ).length;
                    return (
                      <TouchableOpacity
                        key={c}
                        onPress={() => setPickerCountry(c)}
                        className="py-3 border-b border-gray-100 dark:border-gray-700 flex-row items-center"
                      >
                        <Text className="text-gray-800 dark:text-gray-100 flex-1">{c}</Text>
                        <Text className="text-gray-400 dark:text-gray-500 text-sm mr-2">
                          {count} board{count !== 1 ? "s" : ""}
                        </Text>
                        <Ionicons name="chevron-forward" size={16} color={isDark ? "#4b5563" : "#d1d5db"} />
                      </TouchableOpacity>
                    );
                  })}
                </>
              );
            })()}
            <TouchableOpacity
              onPress={() => { setShowBoardPicker(false); setPickerCountry(null); }}
              className="mt-4 bg-gray-100 dark:bg-gray-700 rounded-xl py-3 items-center"
            >
              <Text className="text-gray-600 dark:text-gray-300 font-medium">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Country Picker Modal */}
      <Modal
        visible={showCountryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 justify-end"
          activeOpacity={1}
          onPress={() => setShowCountryPicker(false)}
        >
          <View style={{ backgroundColor: isDark ? "#1f2937" : "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "70%", paddingTop: 20, paddingHorizontal: 24, paddingBottom: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: isDark ? "#f3f4f6" : "#111827", marginBottom: 12 }}>Select country</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {COUNTRIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => { setNewBoardCountry(c); setShowCountryPicker(false); }}
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isDark ? "#374151" : "#f3f4f6", flexDirection: "row", alignItems: "center" }}
                >
                  <Text style={{ flex: 1, color: isDark ? "#e5e7eb" : "#1f2937", fontSize: 15 }}>{c}</Text>
                  {newBoardCountry === c && <Ionicons name="checkmark" size={18} color="#6366f1" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Add Board Modal */}
      <Modal
        visible={showAddBoard}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddBoard(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          <TouchableOpacity
            style={{ ...StyleSheet.absoluteFillObject }}
            activeOpacity={1}
            onPress={() => setShowAddBoard(false)}
          />
          <View className="bg-white dark:bg-gray-800 rounded-t-3xl p-6">
            <Text className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">
              Add a board
            </Text>
            <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">
              Country
            </Text>
            <TouchableOpacity
              onPress={() => setShowCountryPicker(true)}
              className="border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 bg-gray-50 dark:bg-gray-700 mb-3 flex-row items-center justify-between"
            >
              <Text style={{ color: newBoardCountry ? (isDark ? "#e5e7eb" : "#1f2937") : "#9ca3af", fontSize: 14 }}>
                {newBoardCountry || "Select a country"}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#9ca3af" />
            </TouchableOpacity>
            <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">
              Name
            </Text>
            <TextInput
              className="border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 mb-3"
              placeholder="e.g. Garage wall"
              placeholderTextColor="#9ca3af"
              value={newBoardName}
              onChangeText={setNewBoardName}
              returnKeyType="next"
              inputAccessoryViewID={PROFILE_ACCESSORY_ID}
            />
            <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase mb-1">
              Description (optional)
            </Text>
            <TextInput
              className="border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-sm text-gray-800 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 mb-4"
              placeholder="A short description of your board"
              placeholderTextColor="#9ca3af"
              value={newBoardDesc}
              onChangeText={setNewBoardDesc}
              multiline
              inputAccessoryViewID={PROFILE_ACCESSORY_ID}
            />
            <Text className="text-gray-400 dark:text-gray-500 text-xs text-center mb-4">
              You'll be prompted to choose a photo of your board.
            </Text>
            <View className="flex-row gap-x-2">
              <TouchableOpacity
                onPress={() => {
                  setShowAddBoard(false);
                  setNewBoardName("");
                  setNewBoardDesc("");
                  setNewBoardCountry("");
                }}
                className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-xl py-3 items-center"
              >
                <Text className="text-gray-600 dark:text-gray-300 font-medium">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={addBoard}
                disabled={saving || !newBoardName.trim() || !newBoardCountry}
                className="flex-1 bg-indigo-600 rounded-xl py-3 items-center"
                style={{ opacity: saving || !newBoardName.trim() || !newBoardCountry ? 0.5 : 1 }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold">Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-2xl font-bold text-indigo-500 dark:text-indigo-400">{value}</Text>
      <Text className="text-gray-400 dark:text-gray-500 text-xs text-center mt-0.5">{label}</Text>
    </View>
  );
}
