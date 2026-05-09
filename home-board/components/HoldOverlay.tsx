import { id } from "@instantdb/react-native";
import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

export type HoldColor = "red" | "purple" | "blue" | "green";

export interface Hold {
  id: string;
  x: number; // 0–1 fraction of image width
  y: number; // 0–1 fraction of image height
  color: HoldColor;
}

const HOLD_COLORS: Record<HoldColor, string> = {
  red: "#ef4444",
  purple: "#a855f7",
  blue: "#3b82f6",
  green: "#22c55e",
};

const HOLD_SIZE = 32;
const TAP_RADIUS = 22;

function colorWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface HoldOverlayProps {
  photoUrl: string | undefined;
  holds: Hold[];
  mode: "interactive" | "display";
  activeColor?: HoldColor;
  onHoldsChange?: (holds: Hold[]) => void;
  zoomable?: boolean; // display mode only: enable pinch-to-zoom and pan
}

export default function HoldOverlay({
  photoUrl,
  holds,
  mode,
  activeColor = "red",
  onHoldsChange,
  zoomable = false,
}: HoldOverlayProps) {
  const [layout, setLayout] = useState({ width: 1, height: 1 });

  // Zoom/pan shared values — always created (hooks must not be conditional)
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  function handleHoldTap(fracX: number, fracY: number) {
    if (!onHoldsChange) return;
    const W = layout.width;
    const H = layout.height;
    const hitIdx = holds.findIndex((h) => {
      const dx = (h.x - fracX) * W;
      const dy = (h.y - fracY) * H;
      return Math.sqrt(dx * dx + dy * dy) < TAP_RADIUS;
    });
    if (hitIdx !== -1) {
      onHoldsChange(holds.filter((_, i) => i !== hitIdx));
    } else {
      onHoldsChange([
        ...holds,
        { id: id(), x: fracX, y: fracY, color: activeColor },
      ]);
    }
  }

  // Convert a tap in the OUTER container's coordinate space (e.x, e.y)
  // to image-space fractions, inverting the Animated.View's transform.
  //
  // Transform applied to inner view: scale around center, then translate.
  // Screen pos: sx = cx + (ix - cx) * s + tx
  // Inverted:   ix = cx + (sx - cx - tx) / s
  function handleTap(sx: number, sy: number) {
    const W = layout.width;
    const H = layout.height;
    const cx = W / 2;
    const cy = H / 2;
    const tx = translateX.value;
    const ty = translateY.value;
    const s = scale.value;
    const ix = cx + (sx - cx - tx) / s;
    const iy = cy + (sy - cy - ty) / s;
    const fracX = Math.max(0, Math.min(1, ix / W));
    const fracY = Math.max(0, Math.min(1, iy / H));
    handleHoldTap(fracX, fracY);
  }

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, savedScale.value * e.scale);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const pan = Gesture.Pan()
    .minDistance(8)
    .onUpdate((e) => {
      translateX.value = savedTX.value + e.translationX;
      translateY.value = savedTY.value + e.translationY;
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        translateX.value = 0;
        translateY.value = 0;
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

  const holdDots = holds.map((hold) => {
    const solidColor = HOLD_COLORS[hold.color];
    return (
      <View
        key={hold.id}
        pointerEvents="none"
        style={{
          position: "absolute",
          width: HOLD_SIZE,
          height: HOLD_SIZE,
          borderRadius: HOLD_SIZE / 2,
          // Transparent centre — just a coloured ring
          backgroundColor: colorWithAlpha(solidColor, 0.15),
          borderWidth: 3,
          borderColor: solidColor,
          left: hold.x * layout.width - HOLD_SIZE / 2,
          top: hold.y * layout.height - HOLD_SIZE / 2,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.5,
          shadowRadius: 3,
          elevation: 4,
        }}
      />
    );
  });

  if (mode === "interactive") {
    return (
      // GestureDetector wraps the outer plain View (no transform applied here)
      // so e.x/e.y are always in the container's coordinate space, making the
      // inverse-transform math in handleTap reliable at any zoom level.
      <GestureDetector gesture={composed}>
        <View
          style={{ flex: 1, overflow: "hidden" }}
          onLayout={(e) =>
            setLayout({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })
          }
          collapsable={false}
        >
          <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
            <Image
              source={photoUrl ? { uri: photoUrl } : undefined}
              style={{ width: "100%", height: "100%", backgroundColor: "#1f2937" }}
              contentFit="cover"
            />
            {holdDots}
          </Animated.View>
        </View>
      </GestureDetector>
    );
  }

  // Display mode with zoom/pan enabled (e.g. full-screen photo viewer)
  if (mode === "display" && zoomable) {
    return (
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
        <View
          style={{ flex: 1, overflow: "hidden" }}
          onLayout={(e) =>
            setLayout({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })
          }
          collapsable={false}
        >
          <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
            <Image
              source={photoUrl ? { uri: photoUrl } : undefined}
              style={{ width: "100%", height: "100%", backgroundColor: "#1f2937" }}
              contentFit="cover"
            />
            {holdDots}
          </Animated.View>
        </View>
      </GestureDetector>
    );
  }

  // Display mode — static, no zoom
  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) =>
        setLayout({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
    >
      <Image
        source={photoUrl ? { uri: photoUrl } : undefined}
        style={{ width: "100%", height: "100%", backgroundColor: "#1f2937" }}
        contentFit="cover"
      />
      {holdDots}
    </View>
  );
}
