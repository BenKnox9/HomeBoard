import { db } from "@/lib/db";
import { prepareImage } from "@/lib/imageUtils";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const OPACITY_STEPS = [0.5, 0.3, 0.15, 0];

export default function UpdateBoardPhotoScreen() {
  const { boardId: boardIdParam, isNew: isNewParam } = useLocalSearchParams<{ boardId: string; isNew: string }>();
  const boardId = Array.isArray(boardIdParam) ? boardIdParam[0] : boardIdParam;
  const isNew = isNewParam === "true";
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [uploading, setUploading] = useState(false);
  const [opacityStep, setOpacityStep] = useState(0);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedDimensions, setCapturedDimensions] = useState<{ width?: number; height?: number }>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [cameraKey, setCameraKey] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  // Tracks a $files record that's been uploaded but not yet linked to the
  // board, so a failed link transact can be retried without re-uploading,
  // and abandoned uploads can be deleted to avoid orphaning storage.
  const pendingUploadRef = useRef<{ uri: string; fileId: string } | null>(null);
  // Synchronous guard against double-tap races — React state (`uploading`)
  // doesn't update until the next render, so a fast double-tap can otherwise
  // start two concurrent uploads before either is reflected in the UI.
  const inFlightRef = useRef(false);

  const { data } = db.useQuery(
    boardId
      ? { boards: { $: { where: { id: boardId } }, photo: {}, routes: {} } }
      : null
  );
  const board = (data?.boards?.[0] as any);
  const ghostUrl = board?.photo?.url as string | undefined;
  const oldPhotoId = board?.photo?.id as string | undefined;
  const hasRoutes = ((board?.routes ?? []) as any[]).length > 0;
  const ghostOpacity = OPACITY_STEPS[opacityStep];

  function cycleOpacity() {
    setOpacityStep((s) => (s + 1) % OPACITY_STEPS.length);
  }

  async function doUpload(photoUri: string, width?: number, height?: number) {
    if (!boardId || inFlightRef.current) return;
    inFlightRef.current = true;
    setUploading(true);
    setUploadError(null);
    try {
      let fileId: string;
      if (pendingUploadRef.current?.uri === photoUri) {
        // Already uploaded on a previous attempt for this exact photo —
        // reuse it instead of uploading another copy.
        fileId = pendingUploadRef.current.fileId;
      } else {
        const prepared = await prepareImage({ uri: photoUri, width, height });
        const filename = `board_${Date.now()}.jpg`;
        const result = await db.storage.uploadFile(
          `boards/${boardId}/${filename}`,
          { uri: prepared.uri, name: filename, type: prepared.mimeType } as any
        );
        const uploadedId = result.data?.id;
        if (!uploadedId) throw new Error("Upload failed — please try again.");
        fileId = uploadedId;
        pendingUploadRef.current = { uri: photoUri, fileId };
      }

      // Unlink and delete old photo before linking new one
      const txs: any[] = [db.tx.boards[boardId].link({ photo: fileId })];
      if (oldPhotoId) {
        txs.push(db.tx.$files[oldPhotoId].delete());
      }
      await db.transact(txs);
      pendingUploadRef.current = null;

      if (hasRoutes) {
        router.replace({ pathname: "/verify-routes", params: { boardId } });
      } else {
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      setUploadError(e.message ?? "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      inFlightRef.current = false;
    }
  }

  async function capture() {
    if (!cameraRef.current || uploading || !boardId) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      setCapturedUri(photo.uri);
      setCapturedDimensions({ width: photo.width, height: photo.height });
      await doUpload(photo.uri, photo.width, photo.height);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to capture photo.");
    }
  }

  async function retry() {
    // For a library pick, capturedUri is never set, but pendingUploadRef
    // still holds the uri/fileId of the failed attempt — reuse that so
    // retry doesn't dead-end after a library-pick failure.
    const uri = capturedUri ?? pendingUploadRef.current?.uri;
    if (!uri) return;
    await doUpload(uri, capturedDimensions.width, capturedDimensions.height);
  }

  async function pickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      await doUpload(asset.uri, asset.width, asset.height);
    }
  }

  const handleBack = useCallback(async function handleBack() {
    // If a previous attempt uploaded a file that was never linked (e.g. the
    // link transact failed), delete it now rather than abandoning it.
    const pending = pendingUploadRef.current;
    if (pending) {
      if (pending.fileId === oldPhotoId) {
        // The link transact for this file may have actually applied
        // server-side even though it threw (e.g. the ack was lost) — this
        // fileId is now the board's live photo. Don't delete it, just drop
        // our stale reference.
        pendingUploadRef.current = null;
      } else {
        try {
          await db.transact([db.tx.$files[pending.fileId].delete()]);
          pendingUploadRef.current = null;
        } catch (e: any) {
          Alert.alert(
            "Error",
            e.message ?? "Failed to clean up the uploaded photo. Please check your connection and try again."
          );
          return;
        }
      }
    }
    if (capturedUri) {
      setCapturedUri(null);
      setCapturedDimensions({});
      setUploadError(null);
      setCameraKey((k) => k + 1);
      return;
    }
    if (isNew && boardId) {
      await db.transact([db.tx.boards[boardId].delete()]);
    }
    router.back();
  }, [oldPhotoId, capturedUri, isNew, boardId]);

  // Android hardware back must route through handleBack() too — otherwise it
  // pops the screen directly and skips the pendingUploadRef cleanup above.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (uploading) return true;
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [handleBack, uploading]);

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
          BackyardBoard uses your camera to capture a new board photo with the previous photo as a ghost overlay for easy alignment.
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
      <Stack.Screen options={{ gestureEnabled: false }} />
      <CameraView key={cameraKey} ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />

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
        <TouchableOpacity onPress={handleBack} accessibilityLabel="Go back" style={styles.pill} disabled={uploading}>
          <Ionicons name="arrow-back" size={16} color="#fff" />
        </TouchableOpacity>

        {ghostUrl && (
          <View style={styles.pill}>
            <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.pillText}>Align board edges to ghost</Text>
          </View>
        )}

        {ghostUrl && (
          <TouchableOpacity onPress={cycleOpacity} style={styles.pill}>
            <Ionicons
              name={ghostOpacity === 0 ? "eye-off-outline" : "eye-outline"}
              size={16}
              color="#fff"
            />
            <Text style={styles.pillText}>{opacityLabel}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Bottom bar */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 28 }]}>
        {uploadError ? (
          <>
            <Text style={[styles.hint, { color: "#fca5a5" }]}>{uploadError}</Text>
            <TouchableOpacity onPress={retry} disabled={uploading} style={styles.retryBtn} activeOpacity={0.75}>
              <Ionicons name="refresh" size={20} color="#6366f1" />
              <Text style={styles.retryBtnText}>Try again</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.hint}>
              {ghostUrl
                ? "Frame the board to match the ghost, then tap to capture"
                : "Take a photo of your board or choose one from your library"}
            </Text>
            <View style={styles.captureRow}>
              <TouchableOpacity
                onPress={pickFromLibrary}
                disabled={uploading}
                accessibilityLabel="Choose from library"
                style={[styles.libraryBtn, uploading && { opacity: 0.4 }]}
                activeOpacity={0.75}
              >
                <Ionicons name="image-outline" size={28} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={capture}
                disabled={uploading}
                accessibilityLabel="Capture photo"
                style={[styles.captureBtn, uploading && { opacity: 0.6 }]}
                activeOpacity={0.75}
              >
                <View style={styles.captureBtnInner} />
              </TouchableOpacity>
            </View>
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

  captureRow: {
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  libraryBtn: {
    position: "absolute",
    left: 60,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  captureRowSpacer: { flex: 1 },
});
