import { db } from "@/lib/db";
import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function sendCode() {
    if (!email.trim()) return;
    setLoading(true);
    setErrorMsg("");
    try {
      await db.auth.sendMagicCode({ email: email.trim() });
      setSentEmail(email.trim());
    } catch (e: any) {
      setErrorMsg(e.body?.message ?? e.message ?? "Failed to send code.");
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    if (!code.trim()) return;
    setLoading(true);
    setErrorMsg("");
    try {
      await db.auth.signInWithMagicCode({
        email: sentEmail,
        code: code.trim(),
      });
    } catch (e: any) {
      setErrorMsg(e.body?.message ?? e.message ?? "Invalid code.");
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-indigo-50"
    >
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-full max-w-sm bg-white rounded-3xl shadow-lg p-8">
          <Text className="text-3xl font-bold text-indigo-600 mb-1">
            HomeBoard
          </Text>
          <Text className="text-gray-400 mb-8 text-sm">
            Sign in to your account
          </Text>

          {!sentEmail ? (
            <>
              <Text className="text-xs font-semibold text-gray-500 uppercase mb-2">
                Email
              </Text>
              <TextInput
                className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-800 mb-4 bg-gray-50"
                placeholder="you@example.com"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                value={email}
                onChangeText={setEmail}
                onSubmitEditing={sendCode}
                returnKeyType="send"
              />
              {errorMsg ? (
                <Text className="text-red-500 text-sm mb-3">{errorMsg}</Text>
              ) : null}
              <TouchableOpacity
                onPress={sendCode}
                disabled={loading || !email.trim()}
                className="bg-indigo-600 rounded-xl py-3 items-center"
                style={{ opacity: loading || !email.trim() ? 0.5 : 1 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold text-base">
                    Send code
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text className="text-gray-600 text-sm mb-4">
                Code sent to{" "}
                <Text className="font-semibold text-gray-800">{sentEmail}</Text>
              </Text>
              <Text className="text-xs font-semibold text-gray-500 uppercase mb-2">
                Magic code
              </Text>
              <TextInput
                className="border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-800 mb-4 bg-gray-50 tracking-widest"
                placeholder="000000"
                placeholderTextColor="#9ca3af"
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
                onSubmitEditing={verify}
                returnKeyType="done"
                maxLength={8}
                autoFocus
              />
              {errorMsg ? (
                <Text className="text-red-500 text-sm mb-3">{errorMsg}</Text>
              ) : null}
              <TouchableOpacity
                onPress={verify}
                disabled={loading || !code.trim()}
                className="bg-indigo-600 rounded-xl py-3 items-center mb-3"
                style={{ opacity: loading || !code.trim() ? 0.5 : 1 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold text-base">
                    Verify
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setSentEmail("");
                  setCode("");
                  setErrorMsg("");
                }}
              >
                <Text className="text-indigo-500 text-sm text-center">
                  Use a different email
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
