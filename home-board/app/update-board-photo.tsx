import { db } from "@/lib/db";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const OPACITY_STEPS = [0.5, 0.3, 0.15, 0];

export default function UpdateBoardPhotoScreen() {
  const { boardId: boardIdParam } = useLocalSearchParams<{ boardId: string }>();
  const boardId = Array.isArray(boardIdParam) ? boardIdParam[0] : boardIdParam;
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [uploading, setUploading] = useState(false);
  const [opacityStep, setOpacityStep] = useState(0);
  const cameraRef = useRef<CameraView>(null);

  // Query current board photo to use as ghost overlay
  const { data } = db.useQuery(
    boardId
      ? { boards: { $: { where: { id: boardId } }, photo: {} } }
      : null
  );
  const ghostUrl = (data?.boards?.[0] as any)?.photo?.url as string | undefined;
  const ghostOpacity = OPACITY_STEPS[opacityStep];

  function cycleOpacity() {
    setOpacityStep((s) => (s + 1) % OPACITY_STEPS.length);
  }

  async function capture() {
    if (!cameraRef.current || uploading || !boardId) return;
    setUploading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      const filename = `board_${Date.now()}.jpg`;
      const result = await db.storage.uploadFile(
        `boards/${boardId}/${filename}`,
        { uri: photo.uri, name: filename, type: "image/jpeg" } as any
      );
      const fileId = result.data?.id;
      if (!fileId) throw new Error("Upload failed — please try again.");
      await db.transact([db.tx.boards[boardId].link({ photo: fileId })]);
      router.replace({
        pathname: "/verify-routes",
        params: { boardId },
      });
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to update board photo.");
    } finally {
      setUploading(false);
    }
  }

  // ── Permission states ─────────────────────────────────────────────────────

  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.permScreen}>
        <Ionicons
          name="camera-outline"
          size={56}
          color="#6366f1"
          style={{ marginBottom: 20 }}
        />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          HomeBoard uses your camera to capture a new board photo with the
          previous photo as a ghost overlay for easy alignment.
        </Text>
        <TouchableOpacity onPress={requestPermission} style={styles.permBtn}>
          <Text style={styles.permBtnText}>Allow camera</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
        >
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
            Cancel
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Camera view ───────────────────────────────────────────────────────────

  const opacityLabel =
    ghostOpacity === 0 ? "Ghost off" : `Ghost ${Math.round(ghostOpacity * 100)}%`;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* Live camera feed */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {/* Ghost overlay — old board photo at reduced opacity */}
      {ghostUrl && ghostOpacity > 0 && (
        <Image
          source={{ uri: ghostUrl }}
          style={[StyleSheet.absoluteFill, { opacity: ghostOpacity }]}
          contentFit="contain"
          pointerEvents="none"
        />
      )}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.pill}>
          <Text style={[styles.pillText, { fontWeight: "700" }]}>Update board</Text>
        </View>

        <View style={styles.pill}>
          <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.7)" />
          <Text style={styles.pillText}>Align board to ghost outline</Text>
        </View>

        <TouchableOpacity onPress={cycleOpacity} style={styles.pill}>
          <Ionicons
            name={ghostOpacity === 0 ? "eye-off-outline" : "eye-outline"}
            size={16}
            color="#fff"
          />
          <Text style={styles.pillText}>{opacityLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom bar — capture button */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 28 }]}>
        <Text style={styles.hint}>
          Frame the board to match the ghost, then tap to capture
        </Text>
        <TouchableOpacity
          onPress={capture}
          disabled={uploading}
          style={[styles.captureBtn, uploading && { opacity: 0.6 }]}
          activeOpacity={0.75}
        >
          {uploading ? (
            <ActivityIndicator color="#6366f1" size="large" />
          ) : (
            <View style={styles.captureBtnInner} />
          )}
        </TouchableOpacity>
        {uploading && (
          <Text style={[styles.hint, { marginTop: 12 }]}>Uploading…</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  permScreen: {
    flex: 1,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  permTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  permBody: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },
  permBtn: {
    backgroundColor: "#6366f1",
    borderRadius: 14,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  permBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

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

  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hint: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 20,
    paddingHorizontal: 32,
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 3,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  captureBtnInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },
});
