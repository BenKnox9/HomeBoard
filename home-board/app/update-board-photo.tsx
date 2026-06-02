import { db } from "@/lib/db";
import { prepareImage } from "@/lib/imageUtils";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
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
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const { data } = db.useQuery(
    boardId
      ? { boards: { $: { where: { id: boardId } }, photo: {} } }
      : null
  );
  const board = (data?.boards?.[0] as any);
  const ghostUrl = board?.photo?.url as string | undefined;
  const oldPhotoId = board?.photo?.id as string | undefined;
  const ghostOpacity = OPACITY_STEPS[opacityStep];

  function cycleOpacity() {
    setOpacityStep((s) => (s + 1) % OPACITY_STEPS.length);
  }

  async function doUpload(photoUri: string) {
    if (!boardId) return;
    setUploading(true);
    setUploadError(null);
    try {
      const prepared = await prepareImage({ uri: photoUri });
      const filename = `board_${Date.now()}.jpg`;
      const result = await db.storage.uploadFile(
        `boards/${boardId}/${filename}`,
        { uri: prepared.uri, name: filename, type: prepared.mimeType } as any
      );
      const fileId = result.data?.id;
      if (!fileId) throw new Error("Upload failed — please try again.");

      // Unlink and delete old photo before linking new one
      const txs: any[] = [db.tx.boards[boardId].link({ photo: fileId })];
      if (oldPhotoId) {
        txs.push(db.tx.$files[oldPhotoId].delete());
      }
      await db.transact(txs);

      router.replace({ pathname: "/verify-routes", params: { boardId } });
    } catch (e: any) {
      setUploadError(e.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function capture() {
    if (!cameraRef.current || uploading || !boardId) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      setCapturedUri(photo.uri);
      await doUpload(photo.uri);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to capture photo.");
    }
  }

  async function retry() {
    if (!capturedUri) return;
    await doUpload(capturedUri);
  }

  // ── Permission states ─────────────────────────────────────────────────────

  if (!permission) {
    return <View style={{ flex: 1, backgroundColor: "#000" }} />;
  }

  if (!permission.granted) {
    const canAsk = permission.canAskAgain !== false;
    return (
      <View style={styles.permScreen}>
        <Ionicons name="camera-outline" size={56} color="#6366f1" style={{ marginBottom: 20 }} />
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          HomeBoard uses your camera to capture a new board photo with the previous photo as a ghost overlay for easy alignment.
        </Text>
        <TouchableOpacity
          onPress={canAsk ? requestPermission : () => Linking.openSettings()}
          style={styles.permBtn}
        >
          <Text style={styles.permBtnText}>
            {canAsk ? "Allow camera" : "Open settings"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Camera view ───────────────────────────────────────────────────────────

  const opacityLabel =
    ghostOpacity === 0 ? "Ghost off" : `Ghost ${Math.round(ghostOpacity * 100)}%`;

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

      {ghostUrl && ghostOpacity > 0 && (
        <Image
          source={{ uri: ghostUrl }}
          style={[StyleSheet.absoluteFill, { opacity: ghostOpacity }]}
          contentFit="contain"
          pointerEvents="none"
        />
      )}

      {/* Full-screen upload overlay */}
      {uploading && (
        <View style={styles.uploadOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.uploadOverlayText}>Uploading…</Text>
        </View>
      )}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.pill}>
          <Text style={[styles.pillText, { fontWeight: "700" }]}>Update board</Text>
        </View>

        <View style={styles.pill}>
          <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.7)" />
          <Text style={styles.pillText}>Align board edges to ghost</Text>
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

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 28 }]}>
        {uploadError ? (
          <>
            <Text style={[styles.hint, { color: "#fca5a5" }]}>{uploadError}</Text>
            <TouchableOpacity onPress={retry} style={styles.retryBtn} activeOpacity={0.75}>
              <Ionicons name="refresh" size={20} color="#6366f1" />
              <Text style={styles.retryBtnText}>Try again</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              Frame the board to match the ghost, then tap to capture
            </Text>
            <TouchableOpacity
              onPress={capture}
              disabled={uploading}
              style={[styles.captureBtn, uploading && { opacity: 0.6 }]}
              activeOpacity={0.75}
            >
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>
          </>
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
  permTitle: { color: "#fff", fontSize: 22, fontWeight: "700", marginBottom: 12, textAlign: "center" },
  permBody: { color: "rgba(255,255,255,0.6)", fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 32 },
  permBtn: { backgroundColor: "#6366f1", borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
  permBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },

  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    zIndex: 10,
  },
  uploadOverlayText: { color: "#fff", fontSize: 16, fontWeight: "600" },

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
  captureBtnInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: "#fff" },

  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  retryBtnText: { color: "#6366f1", fontWeight: "700", fontSize: 16 },
});
