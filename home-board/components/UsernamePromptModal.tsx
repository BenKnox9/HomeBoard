import { db } from "@/lib/db";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

function sanitizeUsername(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
  return cleaned.slice(0, 30);
}

export default function UsernamePromptModal() {
  const { user } = db.useAuth();
  const { data } = db.useQuery(
    user ? { $users: { $: { where: { id: user.id } } } } : null
  );
  const currentUsername = data?.$users?.[0]?.username as string | undefined;

  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const handledRef = useRef(false);

  useEffect(() => {
    if (!user || data === undefined || handledRef.current) return;
    if (currentUsername) return;
    handledRef.current = true;

    const base = sanitizeUsername(user.email?.split("@")[0] ?? "user") || "user";
    setValue(base);
    setVisible(true);

    (async () => {
      let attempt = base;
      for (let i = 0; i < 5; i++) {
        try {
          await db.transact([db.tx.$users[user.id].update({ username: attempt })]);
          setValue(attempt);
          return;
        } catch {
          attempt = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
        }
      }
    })();
  }, [user, data, currentUsername]);

  async function save() {
    if (!user) return;
    const next = sanitizeUsername(value);
    if (!next) {
      setErrorMsg("Username can only contain letters, numbers, and underscores.");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      await db.transact([db.tx.$users[user.id].update({ username: next })]);
      setValue(next);
      setVisible(false);
    } catch {
      setErrorMsg("That username is taken — try another.");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24 }}
      >
        <View style={{ backgroundColor: "#fff", borderRadius: 24, width: "100%", maxWidth: 360, padding: 28 }}>
          <Text style={{ fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 8, textAlign: "center" }}>
            Choose a username
          </Text>
          <Text style={{ fontSize: 14, color: "#6b7280", lineHeight: 20, marginBottom: 20, textAlign: "center" }}>
            Other climbers will see this on routes you set. We&apos;ve picked one for you, but feel free to change it.
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12, paddingHorizontal: 14, marginBottom: 8, backgroundColor: "#f9fafb" }}>
            <Text style={{ fontSize: 15, color: "#9ca3af", fontWeight: "600" }}>@</Text>
            <TextInput
              style={{ flex: 1, paddingVertical: 12, paddingHorizontal: 4, fontSize: 15, color: "#111827" }}
              value={value}
              onChangeText={(t) => setValue(sanitizeUsername(t))}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={30}
              placeholder="username"
              placeholderTextColor="#9ca3af"
            />
          </View>

          {errorMsg ? (
            <Text style={{ color: "#ef4444", fontSize: 13, marginBottom: 8 }}>{errorMsg}</Text>
          ) : null}

          <TouchableOpacity
            onPress={save}
            disabled={saving || !value.trim()}
            style={{ backgroundColor: "#6366f1", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8, opacity: saving || !value.trim() ? 0.5 : 1 }}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Save</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setVisible(false)} style={{ marginTop: 12 }}>
            <Text style={{ color: "#9ca3af", fontSize: 14, textAlign: "center" }}>
              Keep @{value}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
