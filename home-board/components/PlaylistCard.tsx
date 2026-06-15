import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, View, Text, useColorScheme } from "react-native";

interface PlaylistCardProps {
  playlist: {
    id: string;
    name: string;
    routes?: { id: string }[];
    creator?: { username?: string; email?: string };
  };
  onPress: () => void;
}

export default function PlaylistCard({ playlist, onPress }: PlaylistCardProps) {
  const isDark = useColorScheme() === "dark";
  const routeCount = playlist.routes?.length ?? 0;
  const ownerLabel = playlist.creator?.username
    ? `@${playlist.creator.username}`
    : playlist.creator?.email
    ? playlist.creator.email.split("@")[0]
    : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-indigo-50 dark:bg-indigo-950 rounded-2xl p-4 mb-3 flex-row items-center border border-indigo-100 dark:border-indigo-900"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: isDark ? 0 : 0.06,
        shadowRadius: 4,
        elevation: isDark ? 0 : 2,
      }}
    >
      <View
        className="rounded-xl items-center justify-center mr-4"
        style={{
          backgroundColor: "#6366f1",
          width: 52,
          height: 52,
        }}
      >
        <Ionicons name="albums" size={22} color="#fff" />
      </View>

      <View className="flex-1">
        <Text className="text-gray-800 dark:text-gray-100 font-semibold text-base" numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text className="text-gray-400 dark:text-gray-500 text-xs mt-0.5" numberOfLines={1}>
          {routeCount} route{routeCount !== 1 ? "s" : ""}
          {ownerLabel ? ` · ${ownerLabel}` : ""}
        </Text>
      </View>

      <View className="flex-row items-center gap-x-1 bg-indigo-100 dark:bg-indigo-900 rounded-full px-2 py-1">
        <Ionicons name="list-outline" size={12} color="#6366f1" />
        <Text className="text-indigo-500 dark:text-indigo-300 font-semibold text-xs">
          Playlist
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={isDark ? "#4b5563" : "#d1d5db"} className="ml-2" />
    </TouchableOpacity>
  );
}
