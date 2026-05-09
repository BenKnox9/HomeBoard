import { db } from "@/lib/db";
import { GRADES, gradeBadgeColor } from "@/lib/grades";
import { id } from "@instantdb/react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
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

export default function ProfileScreen() {
  const { user } = db.useAuth();

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
  const [newBoardName, setNewBoardName] = useState("");
  const [newBoardDesc, setNewBoardDesc] = useState("");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [saving, setSaving] = useState(false);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const currentUser = data?.$users?.[0];
  const selectedBoard = currentUser?.selectedBoard;
  const ascents = currentUser?.ascents ?? [];
  const allBoards = data?.boards ?? [];

  // Playlists for the active board only
  const playlists = (currentUser?.playlists ?? []).filter(
    (pl: any) => pl.board?.id === selectedBoard?.id || selectedBoard == null
  );

  // Liked routes (deduplicated — a like has one route)
  const likedRoutes = (currentUser?.likes ?? [])
    .map((l: any) => l.route)
    .filter(Boolean)
    .filter(
      (r: any, i: number, arr: any[]) =>
        arr.findIndex((x) => x.id === r.id) === i
    );

  // Stats
  const uniqueDays = new Set(
    ascents.map((a: any) => new Date(a.loggedAt).toDateString())
  ).size;

  // Sessions: consecutive ascents within 1 hour of each other form a session.
  const SESSION_GAP_MS = 60 * 60 * 1000;
  const sessions = (() => {
    if (ascents.length === 0) return 0;
    const sorted = [...ascents].sort(
      (a: any, b: any) => a.loggedAt - b.loggedAt
    );
    let count = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].loggedAt - sorted[i - 1].loggedAt > SESSION_GAP_MS) {
        count++;
      }
    }
    return count;
  })();
  const climbsPerSession =
    sessions > 0 ? (ascents.length / sessions).toFixed(1) : "0";

  async function selectBoard(boardId: string) {
    if (!user) return;
    await db.transact([
      db.tx.$users[user.id].link({ selectedBoard: boardId }),
    ]);
    setShowBoardPicker(false);
  }

  async function addBoard() {
    if (!user || !newBoardName.trim()) return;
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
        const filename = asset.fileName ?? `photo_${Date.now()}.jpg`;
        const uploadResult = await db.storage.uploadFile(
          `boards/${boardId}/${filename}`,
          {
            uri: asset.uri,
            name: filename,
            type: asset.mimeType ?? "image/jpeg",
          } as any
        );
        fileId = uploadResult.data?.id;
      }

      const txs: any[] = [
        db.tx.boards[boardId]
          .update({
            name: newBoardName.trim(),
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
      setShowAddBoard(false);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to create board.");
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

  return (
    <ScrollView className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="bg-white pt-14 px-4 pb-6 border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-800">Profile</Text>
        <Text className="text-gray-400 text-sm mt-1">{user?.email}</Text>
        <TouchableOpacity
          onPress={() => db.auth.signOut()}
          className="mt-4 border border-gray-200 rounded-xl py-2 items-center"
        >
          <Text className="text-gray-500 text-sm">Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* Board Management */}
      <View className="mx-4 mt-6 mb-2">
        <Text className="text-xs font-semibold text-gray-400 uppercase mb-3">
          Your Board
        </Text>
        <View className="bg-white rounded-2xl p-4">
          {selectedBoard ? (
            <Text className="text-gray-800 font-semibold text-base mb-3">
              {selectedBoard.name}
            </Text>
          ) : (
            <Text className="text-gray-400 text-sm mb-3">No board selected</Text>
          )}
          <View className="flex-row gap-x-2">
            <TouchableOpacity
              onPress={() => setShowBoardPicker(true)}
              className="flex-1 bg-gray-100 rounded-xl py-2 items-center"
            >
              <Text className="text-gray-600 font-medium text-sm">
                Change Board
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowAddBoard(true)}
              className="flex-1 bg-indigo-600 rounded-xl py-2 items-center"
            >
              <Text className="text-white font-medium text-sm">Add Board</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Playlists */}
      {selectedBoard && (
        <View className="mx-4 mt-6 mb-2">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-xs font-semibold text-gray-400 uppercase">
              Playlists
            </Text>
            <TouchableOpacity onPress={() => setShowAddPlaylist(true)}>
              <Text className="text-indigo-600 text-sm font-semibold">
                + New Playlist
              </Text>
            </TouchableOpacity>
          </View>

          {showAddPlaylist && (
            <View className="bg-white rounded-2xl p-4 mb-3">
              <TextInput
                className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 bg-gray-50 mb-3"
                placeholder="Playlist name"
                placeholderTextColor="#9ca3af"
                value={newPlaylistName}
                onChangeText={setNewPlaylistName}
                autoFocus
              />
              <View className="flex-row gap-x-2">
                <TouchableOpacity
                  onPress={() => {
                    setShowAddPlaylist(false);
                    setNewPlaylistName("");
                  }}
                  className="flex-1 bg-gray-100 rounded-xl py-2 items-center"
                >
                  <Text className="text-gray-600 text-sm">Cancel</Text>
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
            <View className="bg-white rounded-2xl p-4">
              <Text className="text-gray-400 text-sm text-center">
                No playlists yet
              </Text>
            </View>
          ) : (
            playlists.map((pl: any) => (
              <TouchableOpacity
                key={pl.id}
                onPress={() =>
                  router.push({
                    pathname: "/playlist/[id]",
                    params: { id: pl.id },
                  })
                }
                className="bg-white rounded-2xl p-4 mb-2 flex-row items-center"
              >
                <View className="flex-1">
                  <Text className="text-gray-800 font-semibold">{pl.name}</Text>
                  <Text className="text-gray-400 text-xs mt-0.5">
                    {pl.routes?.length ?? 0} route
                    {(pl.routes?.length ?? 0) !== 1 ? "s" : ""}
                  </Text>
                </View>
                <Text className="text-gray-300 text-lg">›</Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* Liked Routes */}
      {likedRoutes.length > 0 && (
        <View className="mx-4 mt-6 mb-2">
          <Text className="text-xs font-semibold text-gray-400 uppercase mb-3">
            Liked Routes
          </Text>
          {likedRoutes.map((r: any) => (
            <TouchableOpacity
              key={r.id}
              onPress={() =>
                router.push({ pathname: "/route/[id]", params: { id: r.id } })
              }
              className="bg-white rounded-2xl p-4 mb-2 flex-row items-center"
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
                <Text className="text-gray-800 font-semibold" numberOfLines={1}>
                  {r.name}
                </Text>
                <Text className="text-gray-400 text-xs mt-0.5">
                  {r.ascents?.length ?? 0} ascent{(r.ascents?.length ?? 0) !== 1 ? "s" : ""}
                </Text>
              </View>
              <Text className="text-gray-300 text-lg">›</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Statistics */}
      <View className="mx-4 mt-6 mb-10">
        <Text className="text-xs font-semibold text-gray-400 uppercase mb-3">
          Statistics
        </Text>
        <View className="bg-white rounded-2xl p-4">
          <View className="flex-row mb-4">
            <StatBox
              label="Days Climbed"
              value={String(uniqueDays)}
            />
            <StatBox
              label="Total Ascents"
              value={String(ascents.length)}
            />
            <StatBox
              label="Climbs / Session"
              value={climbsPerSession}
            />
          </View>

          <Text className="text-xs font-semibold text-gray-400 uppercase mb-3">
            Ascents by Grade
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
                <Text className="text-gray-600 text-sm flex-1">
                  {count} ascent{count !== 1 ? "s" : ""}
                </Text>
                <Text className="text-gray-400 text-xs">
                  avg {avgAttempts} tries
                </Text>
              </View>
            );
          })}
          {ascents.length === 0 && (
            <Text className="text-gray-400 text-sm text-center py-2">
              Log some ascents to see stats
            </Text>
          )}
        </View>
      </View>

      {/* Board Picker Modal */}
      <Modal
        visible={showBoardPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBoardPicker(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 justify-end"
          activeOpacity={1}
          onPress={() => setShowBoardPicker(false)}
        >
          <View className="bg-white rounded-t-3xl p-6">
            <Text className="text-lg font-bold text-gray-800 mb-4">
              Select a Board
            </Text>
            {allBoards.length === 0 ? (
              <Text className="text-gray-400 text-center py-4">
                No boards available. Add one first.
              </Text>
            ) : (
              allBoards.map((b: any) => (
                <TouchableOpacity
                  key={b.id}
                  onPress={() => selectBoard(b.id)}
                  className="py-3 border-b border-gray-100 flex-row items-center"
                >
                  <Text className="text-gray-800 flex-1">{b.name}</Text>
                  {selectedBoard?.id === b.id && (
                    <Text className="text-indigo-600 font-semibold text-sm">
                      Selected
                    </Text>
                  )}
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity
              onPress={() => setShowBoardPicker(false)}
              className="mt-4 bg-gray-100 rounded-xl py-3 items-center"
            >
              <Text className="text-gray-600 font-medium">Cancel</Text>
            </TouchableOpacity>
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
          <View className="bg-white rounded-t-3xl p-6">
            <Text className="text-lg font-bold text-gray-800 mb-4">
              Add a Board
            </Text>
            <Text className="text-xs font-semibold text-gray-400 uppercase mb-1">
              Name
            </Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 bg-gray-50 mb-3"
              placeholder="e.g. Garage Wall"
              placeholderTextColor="#9ca3af"
              value={newBoardName}
              onChangeText={setNewBoardName}
            />
            <Text className="text-xs font-semibold text-gray-400 uppercase mb-1">
              Description (optional)
            </Text>
            <TextInput
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 bg-gray-50 mb-4"
              placeholder="A short description of your board"
              placeholderTextColor="#9ca3af"
              value={newBoardDesc}
              onChangeText={setNewBoardDesc}
              multiline
            />
            <Text className="text-gray-400 text-xs text-center mb-4">
              You'll be prompted to choose a photo of your board.
            </Text>
            <View className="flex-row gap-x-2">
              <TouchableOpacity
                onPress={() => {
                  setShowAddBoard(false);
                  setNewBoardName("");
                  setNewBoardDesc("");
                }}
                className="flex-1 bg-gray-100 rounded-xl py-3 items-center"
              >
                <Text className="text-gray-600 font-medium">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={addBoard}
                disabled={saving || !newBoardName.trim()}
                className="flex-1 bg-indigo-600 rounded-xl py-3 items-center"
                style={{ opacity: saving || !newBoardName.trim() ? 0.5 : 1 }}
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
      <Text className="text-2xl font-bold text-indigo-600">{value}</Text>
      <Text className="text-gray-400 text-xs text-center mt-0.5">{label}</Text>
    </View>
  );
}
