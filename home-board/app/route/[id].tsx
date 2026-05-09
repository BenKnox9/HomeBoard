import HoldOverlay, { Hold } from "@/components/HoldOverlay";
import { db } from "@/lib/db";
import { gradeBadgeColor } from "@/lib/grades";
import { id } from "@instantdb/react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function RouteDetailScreen() {
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = db.useAuth();
  const [falls, setFalls] = useState(0);
  const [logging, setLogging] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const { isLoading, error, data } = db.useQuery(
    user && routeId
      ? {
          routes: {
            $: { where: { id: routeId } },
            board: { photo: {} },
            ascents: { user: {} },
            likes: { user: {} },
            comments: {
              $: { order: { createdAt: "asc" } },
              user: {},
            },
          },
          $users: {
            $: { where: { id: user.id } },
            selectedBoard: {},
            playlists: { routes: {} },
          },
        }
      : null
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (error || !data?.routes?.[0]) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-6">
        <Text className="text-red-500 text-center">
          {error?.message ?? "Route not found"}
        </Text>
      </View>
    );
  }

  const route = data.routes[0];
  const currentUser = data.$users?.[0];
  const allAscents = route.ascents ?? [];
  const myAscents = allAscents.filter((a: any) => a.user?.id === user?.id);
  const lastAscent = [...myAscents].sort(
    (a: any, b: any) => b.loggedAt - a.loggedAt
  )[0];

  const holds: Hold[] = (() => {
    try {
      return JSON.parse(route.holds ?? "[]");
    } catch {
      return [];
    }
  })();

  const badgeColor = gradeBadgeColor(route.grade);
  const photoUrl = route.board?.photo?.url;
  const userPlaylists = currentUser?.playlists ?? [];

  // Likes
  const allLikes: any[] = route.likes ?? [];
  const myLike = allLikes.find((l: any) => l.user?.id === user?.id);
  const isLiked = !!myLike;

  // Comments
  const comments: any[] = route.comments ?? [];

  async function logAscent() {
    if (!user || !routeId) return;
    setLogging(true);
    try {
      const ascentId = id();
      await db.transact([
        db.tx.ascents[ascentId]
          .update({ attempts: falls, loggedAt: Date.now() })
          .link({ route: routeId, user: user.id }),
      ]);
      setFalls(0);
    } finally {
      setLogging(false);
    }
  }

  async function toggleLike() {
    if (!user || !routeId) return;
    if (isLiked && myLike) {
      await db.transact([db.tx.likes[myLike.id].delete()]);
    } else {
      const likeId = id();
      await db.transact([
        db.tx.likes[likeId]
          .update({ createdAt: Date.now() })
          .link({ route: routeId, user: user.id }),
      ]);
    }
  }

  async function submitComment() {
    if (!user || !routeId || !commentText.trim()) return;
    setSubmittingComment(true);
    try {
      const commentId = id();
      await db.transact([
        db.tx.comments[commentId]
          .update({ text: commentText.trim(), createdAt: Date.now() })
          .link({ route: routeId, user: user.id }),
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
    const isInPlaylist = (pl.routes ?? []).some((r: any) => r.id === routeId);
    if (isInPlaylist) {
      await db.transact([db.tx.playlists[pl.id].unlink({ routes: routeId })]);
    } else {
      await db.transact([db.tx.playlists[pl.id].link({ routes: routeId })]);
    }
  }

  function commentAuthor(comment: any): string {
    if (comment.user?.id === user?.id) return "You";
    const email: string | undefined = comment.user?.email;
    if (email) return email.split("@")[0];
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

  return (
    <View className="flex-1 bg-gray-50">
      {/* Board photo — tap to open full-screen viewer */}
      <Pressable
        style={{ height: 300, backgroundColor: "#1f2937" }}
        onPress={() => setShowPhotoModal(true)}
      >
        <HoldOverlay photoUrl={photoUrl} holds={holds} mode="display" />
        <View className="absolute bottom-3 right-3 bg-black/50 rounded-lg px-2 py-1 flex-row items-center gap-x-1">
          <Ionicons name="expand-outline" size={12} color="#fff" />
          <Text className="text-white text-xs">Tap to zoom</Text>
        </View>
      </Pressable>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        {/* Route info */}
        <View className="bg-white rounded-2xl p-4 mb-4">
          <View className="flex-row items-center gap-x-3 mb-2">
            <View
              className="rounded-xl items-center justify-center"
              style={{ backgroundColor: badgeColor, width: 52, height: 52 }}
            >
              <Text className="text-white font-bold text-sm">{route.grade}</Text>
            </View>
            <View className="flex-1">
              <Text className="text-gray-800 font-bold text-xl">{route.name}</Text>
            </View>
          </View>
          {route.description ? (
            <Text className="text-gray-500 text-sm mt-1">{route.description}</Text>
          ) : null}
        </View>

        {/* Stats */}
        <View className="bg-white rounded-2xl p-4 mb-4 flex-row">
          <View className="flex-1 items-center">
            <Text className="text-2xl font-bold text-indigo-600">
              {allAscents.length}
            </Text>
            <Text className="text-gray-400 text-xs mt-0.5">Total Ascents</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-2xl font-bold text-indigo-600">
              {myAscents.length}
            </Text>
            <Text className="text-gray-400 text-xs mt-0.5">Your Ascents</Text>
          </View>
          <View className="flex-1 items-center">
            <Text className="text-sm font-bold text-indigo-600 text-center">
              {lastAscent
                ? new Date(lastAscent.loggedAt).toLocaleDateString()
                : "—"}
            </Text>
            <Text className="text-gray-400 text-xs mt-0.5">Last Ascent</Text>
          </View>
        </View>

        {/* Fall counter & log */}
        <View className="bg-white rounded-2xl p-4 mb-4">
          <Text className="text-xs font-semibold text-gray-400 uppercase mb-3">
            Current Attempt
          </Text>
          <View className="flex-row items-center justify-center gap-x-6 mb-4">
            <TouchableOpacity
              onPress={() => setFalls(Math.max(0, falls - 1))}
              className="bg-gray-100 rounded-full items-center justify-center"
              style={{ width: 48, height: 48 }}
            >
              <Text className="text-gray-700 text-2xl font-light">−</Text>
            </TouchableOpacity>
            <View className="items-center">
              <Text className="text-4xl font-bold text-gray-800">{falls}</Text>
              <Text className="text-gray-400 text-xs">
                {falls === 1 ? "fall" : "falls"}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setFalls(falls + 1)}
              className="bg-gray-100 rounded-full items-center justify-center"
              style={{ width: 48, height: 48 }}
            >
              <Text className="text-gray-700 text-2xl font-light">+</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={logAscent}
            disabled={logging}
            className="bg-indigo-600 rounded-xl py-3 items-center"
            style={{ opacity: logging ? 0.5 : 1 }}
          >
            {logging ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold">Log Ascent</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Like & playlist row */}
        <View className="flex-row gap-x-3 mb-4">
          <TouchableOpacity
            onPress={toggleLike}
            className="flex-1 bg-white rounded-2xl py-3 flex-row items-center justify-center gap-x-2"
          >
            <Ionicons
              name={isLiked ? "heart" : "heart-outline"}
              size={20}
              color={isLiked ? "#ef4444" : "#6b7280"}
            />
            <Text
              className="font-semibold text-sm"
              style={{ color: isLiked ? "#ef4444" : "#6b7280" }}
            >
              {allLikes.length} {allLikes.length === 1 ? "Like" : "Likes"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowPlaylistModal(true)}
            className="flex-1 bg-white rounded-2xl py-3 flex-row items-center justify-center gap-x-2"
          >
            <Ionicons name="bookmark-outline" size={20} color="#6b7280" />
            <Text className="text-gray-500 font-semibold text-sm">Playlist</Text>
          </TouchableOpacity>
        </View>

        {/* Comments */}
        <View className="bg-white rounded-2xl p-4 mb-4">
          <Text className="text-xs font-semibold text-gray-400 uppercase mb-3">
            Comments ({comments.length})
          </Text>

          {comments.length === 0 ? (
            <Text className="text-gray-400 text-sm text-center py-2">
              No comments yet. Be the first!
            </Text>
          ) : (
            comments.map((c: any) => (
              <View
                key={c.id}
                className="flex-row items-start mb-3 pb-3 border-b border-gray-50"
              >
                {/* Avatar circle */}
                <View
                  className="rounded-full items-center justify-center mr-3 mt-0.5"
                  style={{
                    width: 28,
                    height: 28,
                    backgroundColor:
                      c.user?.id === user?.id ? "#6366f1" : "#e5e7eb",
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{
                      color: c.user?.id === user?.id ? "#fff" : "#6b7280",
                    }}
                  >
                    {commentAuthor(c).charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-x-2 mb-0.5">
                    <Text className="text-gray-700 font-semibold text-xs">
                      {commentAuthor(c)}
                    </Text>
                    <Text className="text-gray-300 text-xs">{timeAgo(c.createdAt)}</Text>
                  </View>
                  <Text className="text-gray-600 text-sm">{c.text}</Text>
                </View>
                {c.user?.id === user?.id && (
                  <TouchableOpacity
                    onPress={() => deleteComment(c.id)}
                    className="ml-2 p-1"
                  >
                    <Ionicons name="close" size={14} color="#d1d5db" />
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}

          {/* Comment input */}
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <View className="flex-row items-center gap-x-2 mt-2">
              <TextInput
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800"
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
                className="bg-indigo-600 rounded-xl px-3 py-2"
                style={{ opacity: submittingComment || !commentText.trim() ? 0.4 : 1 }}
              >
                {submittingComment ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={16} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </ScrollView>

      {/* Full-screen photo modal */}
      <Modal
        visible={showPhotoModal}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setShowPhotoModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: "#000" }}>
          <HoldOverlay
            photoUrl={photoUrl}
            holds={holds}
            mode="display"
            zoomable
          />
          <TouchableOpacity
            onPress={() => setShowPhotoModal(false)}
            style={{
              position: "absolute",
              top: 56,
              right: 16,
              backgroundColor: "rgba(0,0,0,0.5)",
              borderRadius: 20,
              width: 40,
              height: 40,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <View
            style={{
              position: "absolute",
              bottom: 40,
              left: 0,
              right: 0,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>
              Pinch to zoom · Drag to pan
            </Text>
          </View>
        </View>
      </Modal>

      {/* Playlist Modal */}
      <Modal
        visible={showPlaylistModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPlaylistModal(false)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 justify-end"
          activeOpacity={1}
          onPress={() => setShowPlaylistModal(false)}
        >
          <View className="bg-white rounded-t-3xl p-6">
            <Text className="text-lg font-bold text-gray-800 mb-4">
              Add to Playlist
            </Text>
            {userPlaylists.length === 0 ? (
              <Text className="text-gray-400 text-center py-2 mb-4">
                No playlists yet — create one in your Profile.
              </Text>
            ) : (
              userPlaylists.map((pl: any) => {
                const inPlaylist = (pl.routes ?? []).some(
                  (r: any) => r.id === routeId
                );
                return (
                  <TouchableOpacity
                    key={pl.id}
                    onPress={() => togglePlaylist(pl)}
                    className="flex-row items-center py-3 border-b border-gray-100"
                  >
                    <View
                      className="w-5 h-5 rounded-full border-2 mr-3 items-center justify-center"
                      style={{
                        borderColor: inPlaylist ? "#6366f1" : "#d1d5db",
                        backgroundColor: inPlaylist ? "#6366f1" : "transparent",
                      }}
                    >
                      {inPlaylist && (
                        <Text className="text-white text-xs">✓</Text>
                      )}
                    </View>
                    <Text className="text-gray-800 flex-1">{pl.name}</Text>
                    <Text className="text-gray-400 text-xs">
                      {pl.routes?.length ?? 0} routes
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
            <TouchableOpacity
              onPress={() => setShowPlaylistModal(false)}
              className="mt-4 bg-gray-100 rounded-xl py-3 items-center"
            >
              <Text className="text-gray-600 font-medium">Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
