import { db } from "@/lib/db";
import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

const COOLDOWN_SECONDS = 60;

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startCooldown() {
    setCooldown(COOLDOWN_SECONDS);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function sendCode() {
    if (!email.trim() || cooldown > 0) return;
    setLoading(true);
    setErrorMsg("");
    try {
      await db.auth.sendMagicCode({ email: email.trim() });
      setSentEmail(email.trim());
      startCooldown();
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
      await db.auth.signInWithMagicCode({ email: sentEmail, code: code.trim() });
    } catch (e: any) {
      setErrorMsg(e.body?.message ?? e.message ?? "Invalid code.");
      setLoading(false);
    }
  }

  const sendDisabled = loading || !email.trim() || cooldown > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-indigo-50 dark:bg-gray-900"
    >
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl shadow-lg p-8">
          <Text className="text-3xl font-bold text-indigo-600 mb-1">HomeBoard</Text>
          <Text className="text-gray-400 dark:text-gray-500 mb-8 text-sm">Sign in to your account</Text>

          {!sentEmail ? (
            <>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Email</Text>
              <TextInput
                className="border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-base text-gray-800 dark:text-gray-100 mb-4 bg-gray-50 dark:bg-gray-700"
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
                disabled={sendDisabled}
                className="bg-indigo-600 rounded-xl py-3 items-center"
                style={{ opacity: sendDisabled ? 0.5 : 1 }}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text className="text-white font-semibold text-base">
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Send code"}
                  </Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text className="text-gray-600 dark:text-gray-300 text-sm mb-4">
                Code sent to{" "}
                <Text className="font-semibold text-gray-800 dark:text-gray-100">{sentEmail}</Text>
              </Text>
              <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">Magic code</Text>
              <TextInput
                className="border border-gray-200 dark:border-gray-600 rounded-xl px-4 py-3 text-base text-gray-800 dark:text-gray-100 mb-4 bg-gray-50 dark:bg-gray-700 tracking-widest"
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
                  <Text className="text-white font-semibold text-base">Verify</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (cooldown === 0) sendCode();
                }}
                disabled={cooldown > 0}
              >
                <Text className={`text-sm text-center ${cooldown > 0 ? "text-gray-400" : "text-indigo-500"}`}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setSentEmail(""); setCode(""); setErrorMsg(""); }}
                style={{ marginTop: 8 }}
              >
                <Text className="text-indigo-500 text-sm text-center">Use a different email</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
