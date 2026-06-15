import "../global.css";
import ErrorBoundary from "@/components/ErrorBoundary";
import LoginScreen from "@/components/LoginScreen";
import OnboardingModal from "@/components/OnboardingModal";
import UsernamePromptModal from "@/components/UsernamePromptModal";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { db } from "@/lib/db";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  const { isLoading, user } = db.useAuth();
  const isDark = useColorScheme() === "dark";

  if (!loaded || isLoading) {
    return (
      <ThemeProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <View className="flex-1 items-center justify-center bg-white dark:bg-gray-900">
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        </GestureHandlerRootView>
      </ThemeProvider>
    );
  }

  if (!user) {
    return (
      <ThemeProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <LoginScreen />
          <StatusBar style="auto" />
        </GestureHandlerRootView>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ErrorBoundary>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false, title: "Profile" }} />
            <Stack.Screen name="route/[id]" options={{ headerShown: false }} />
            <Stack.Screen
              name="playlist/[id]"
              options={{
                headerStyle: { backgroundColor: isDark ? "#111827" : "#ffffff" },
                headerTintColor: isDark ? "#e5e7eb" : "#111827",
              }}
            />
            <Stack.Screen
              name="create-route"
              options={{
                presentation: "modal",
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="edit-route"
              options={{
                headerTitle: "Edit route",
                presentation: "modal",
                headerTransparent: true,
                headerTintColor: "#fff",
              }}
            />
            <Stack.Screen
              name="update-board-photo"
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="verify-routes"
              options={{ headerShown: false }}
            />
          </Stack>
          <OnboardingModal />
          <UsernamePromptModal />
          <StatusBar style="auto" />
        </ErrorBoundary>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
