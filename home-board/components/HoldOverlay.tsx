import { id } from "@instantdb/react-native";
import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export type HoldColor = "red" | "purple" | "blue" | "green";
export type HoldSize = "small" | "medium" | "large";

export interface Hold {
  id: string;
  x: number; // 0–1 fraction of the image content area (not the container)
  y: number; // 0–1 fraction of the image content area
  color: HoldColor;
  size?: HoldSize;
  sequence?: number; // order number for "Force sequence" mode (blue holds only)
}

export const HOLD_COLORS: Record<HoldColor, string> = {
  red: "#ef4444",
  purple: "#a855f7",
  blue: "#3b82f6",
  green: "#22c55e",
};

export const HOLD_SIZE = 32;
export const HOLD_SIZES: Record<HoldSize, number> = { small: 20, medium: 32, large: 48 };

export function colorWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export interface ContainArea {
  offsetX: number;
  offsetY: number;
  displayW: number;
  displayH: number;
}

interface HoldOverlayProps {
  photoUrl: string | undefined;
  holds: Hold[];
  mode: "interactive" | "display";
  activeColor?: HoldColor;
  activeSize?: HoldSize;
  onHoldsChange?: (holds: Hold[]) => void;
  zoomable?: boolean; // display mode only: enable pinch-to-zoom and pan
}

export default function HoldOverlay({
  photoUrl,
  holds,
  mode,
  activeColor = "red",
  activeSize = "medium",
  onHoldsChange,
  zoomable = false,
}: HoldOverlayProps) {
  const [layout, setLayout] = useState({ width: 1, height: 1 });
  // Natural image dimensions — used to compute the "contain" display area
  const [naturalSize, setNaturalSize] = useState({ width: 1, height: 1 });

  // Zoom/pan shared values (used only by interactive and zoomable-display modes)
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);
  // Container dimensions in shared values so pan/pinch worklets can clamp
  const containerW = useSharedValue(1);
  const containerH = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  // Compute where the image actually appears within the container when
  // contentFit="contain" (letterboxed to preserve aspect ratio).
  function computeContainArea(): ContainArea {
    const { width: nW, height: nH } = naturalSize;
    const { width: cW, height: cH } = layout;
    // Until the image loads, treat the whole container as the image area.
    if (nW <= 1 || nH <= 1 || cW <= 1 || cH <= 1) {
      return { offsetX: 0, offsetY: 0, displayW: cW, displayH: cH };
    }
    const imageAspect = nW / nH;
    const containerAspect = cW / cH;
    if (imageAspect > containerAspect) {
      // Image is wider → fit to container width, letterbox top/bottom
      const displayW = cW;
      const displayH = cW / imageAspect;
      return { offsetX: 0, offsetY: (cH - displayH) / 2, displayW, displayH };
    } else {
      // Image is taller → fit to container height, letterbox left/right
      const displayH = cH;
      const displayW = cH * imageAspect;
      return { offsetX: (cW - displayW) / 2, offsetY: 0, displayW, displayH };
    }
  }

  function handleHoldTap(fracX: number, fracY: number) {
    if (!onHoldsChange) return;
    const area = computeContainArea();
    const tapDX = area.offsetX + fracX * area.displayW;
    const tapDY = area.offsetY + fracY * area.displayH;
    const hitIdx = holds.findIndex((h) => {
      const holdDX = area.offsetX + h.x * area.displayW;
      const holdDY = area.offsetY + h.y * area.displayH;
      const dx = holdDX - tapDX;
      const dy = holdDY - tapDY;
      const hitRadius = HOLD_SIZES[h.size ?? "medium"] / 2 + 8;
      return Math.sqrt(dx * dx + dy * dy) < hitRadius;
    });
    if (hitIdx !== -1) {
      onHoldsChange(holds.filter((_, i) => i !== hitIdx));
    } else {
      onHoldsChange([...holds, { id: id(), x: fracX, y: fracY, color: activeColor, size: activeSize }]);
    }
  }

  // Convert a tap at container coords (sx, sy) — after inverting the zoom
  // transform — into image-content fractions (0–1 of the "contain" display area).
  function handleTap(sx: number, sy: number) {
    const { width: W, height: H } = layout;
    const cx = W / 2;
    const cy = H / 2;
    const tx = translateX.value;
    const ty = translateY.value;
    const s = scale.value;
    // Invert: screen = center + (img - center) * s + translate
    const ix = cx + (sx - cx - tx) / s;
    const iy = cy + (sy - cy - ty) / s;
    const area = computeContainArea();
    const fracX = Math.max(0, Math.min(1, (ix - area.offsetX) / area.displayW));
    const fracY = Math.max(0, Math.min(1, (iy - area.offsetY) / area.displayH));
    handleHoldTap(fracX, fracY);
  }

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const s = Math.max(1, savedScale.value * e.scale);
      scale.value = s;
      // Reclamp translation so the image stays in bounds as scale changes
      const maxTX = (s - 1) * containerW.value / 2;
      const maxTY = (s - 1) * containerH.value / 2;
      translateX.value = Math.max(-maxTX, Math.min(maxTX, translateX.value));
      translateY.value = Math.max(-maxTY, Math.min(maxTY, translateY.value));
    })
    .onEnd(() => {
      if (scale.value <= 1.05) {
        // Zoomed back out — snap image to its original centred position
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTX.value = 0;
        savedTY.value = 0;
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .minDistance(8)
    .onUpdate((e) => {
      // Only pan when zoomed — prevents jiggle at scale=1
      if (scale.value > 1.05) {
        const maxTX = (scale.value - 1) * containerW.value / 2;
        const maxTY = (scale.value - 1) * containerH.value / 2;
        translateX.value = Math.max(-maxTX, Math.min(maxTX, savedTX.value + e.translationX));
        translateY.value = Math.max(-maxTY, Math.min(maxTY, savedTY.value + e.translationY));
      }
    })
    .onEnd(() => {
      if (scale.value <= 1.05) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTX.value = 0;
        savedTY.value = 0;
      } else {
        savedTX.value = translateX.value;
        savedTY.value = translateY.value;
      }
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      handleTap(e.x, e.y);
    });

  const composed = Gesture.Race(tap, Gesture.Simultaneous(pinch, pan));

  function onImageLoad(e: any) {
    const w = e?.source?.width;
    const h = e?.source?.height;
    if (w && h) setNaturalSize({ width: w, height: h });
  }

  // Hold dots are positioned within the image content area (not the full container).
  function renderHoldDots() {
    const area = computeContainArea();
    return holds.map((hold) => {
      const solidColor = HOLD_COLORS[hold.color];
      const dotSize = HOLD_SIZES[hold.size ?? "medium"];
      return (
        <View
          key={hold.id}
          pointerEvents="none"
          style={{
            position: "absolute",
            width: dotSize,
            height: dotSize,
            left: area.offsetX + hold.x * area.displayW - dotSize / 2,
            top: area.offsetY + hold.y * area.displayH - dotSize / 2,
          }}
        >
          <View
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: colorWithAlpha(solidColor, 0.15),
              borderWidth: 3,
              borderColor: solidColor,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.5,
              shadowRadius: 3,
              elevation: 4,
            }}
          />
          {hold.color === "blue" && hold.sequence !== undefined && (
            <View
              style={{
                position: "absolute",
                top: -6,
                right: -6,
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                paddingHorizontal: 3,
                backgroundColor: "#fff",
                borderWidth: 1.5,
                borderColor: solidColor,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: solidColor, fontSize: 10, fontWeight: "700" }}>
                {hold.sequence}
              </Text>
            </View>
          )}
        </View>
      );
    });
  }

  const imageEl = (
    <Image
      source={photoUrl ? { uri: photoUrl } : undefined}
      style={{ width: "100%", height: "100%", backgroundColor: "#000" }}
      contentFit="contain"
      onLoad={onImageLoad}
    />
  );

  const onLayoutHandler = (e: any) => {
    const w = e.nativeEvent.layout.width;
    const h = e.nativeEvent.layout.height;
    setLayout({ width: w, height: h });
    containerW.value = w;
    containerH.value = h;
  };

  if (mode === "interactive") {
    return (
      <GestureDetector gesture={composed}>
        <View
          style={{ flex: 1, overflow: "hidden" }}
          onLayout={onLayoutHandler}
          collapsable={false}
        >
          <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
            {imageEl}
            {renderHoldDots()}
          </Animated.View>
        </View>
      </GestureDetector>
    );
  }

  if (mode === "display" && zoomable) {
    return (
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
        <View
          style={{ flex: 1, overflow: "hidden" }}
          onLayout={onLayoutHandler}
          collapsable={false}
        >
          <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
            {imageEl}
            {renderHoldDots()}
          </Animated.View>
        </View>
      </GestureDetector>
    );
  }

  // Display mode — static (zoom handled by parent)
  return (
    <View style={{ flex: 1 }} onLayout={onLayoutHandler}>
      {imageEl}
      {renderHoldDots()}
    </View>
  );
}
