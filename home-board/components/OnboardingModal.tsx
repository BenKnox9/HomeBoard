import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const STORAGE_KEY = "@homeboard_onboarding_done";
const { width: SCREEN_W } = Dimensions.get("window");

const SLIDES = [
  {
    icon: "image-outline" as const,
    title: "Create your board",
    body: "Start by taking or picking a photo of your climbing wall. This becomes your board — a canvas for all your routes.",
  },
  {
    icon: "hand-left-outline" as const,
    title: "Place holds",
    body: "Tap anywhere on the board photo to mark a hold. Green = start, red = finish, blue = hand/foot, purple = feet only.",
  },
  {
    icon: "trophy-outline" as const,
    title: "Set routes and log ascents",
    body: "Give each route a name and grade, then log your climbs to track progress. Like and comment on routes set by others.",
  },
  {
    icon: "camera-outline" as const,
    title: "Update your board",
    body: "When you add holds to your board, take a new photo with the old one as a ghost overlay to keep your routes aligned.",
  },
];

export default function OnboardingModal() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (!val) setVisible(true);
    });
  }, []);

  async function finish() {
    await AsyncStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 }}>
        <View style={{ backgroundColor: "#fff", borderRadius: 24, width: Math.min(SCREEN_W - 48, 360), padding: 32 }}>
          {/* Icon */}
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center", marginBottom: 20, alignSelf: "center" }}>
            <Ionicons name={slide.icon} size={32} color="#6366f1" />
          </View>

          {/* Text */}
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827", textAlign: "center", marginBottom: 12 }}>
            {slide.title}
          </Text>
          <Text style={{ fontSize: 15, color: "#6b7280", textAlign: "center", lineHeight: 22, marginBottom: 28 }}>
            {slide.body}
          </Text>

          {/* Dot indicators */}
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 24 }}>
            {SLIDES.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === step ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: i === step ? "#6366f1" : "#e5e7eb",
                }}
              />
            ))}
          </View>

          {/* Buttons */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {!isLast && (
              <TouchableOpacity
                onPress={finish}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", alignItems: "center" }}
              >
                <Text style={{ color: "#9ca3af", fontWeight: "500" }}>Skip</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={isLast ? finish : () => setStep((s) => s + 1)}
              style={{ flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: "#6366f1", alignItems: "center" }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                {isLast ? "Get started" : "Next"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
