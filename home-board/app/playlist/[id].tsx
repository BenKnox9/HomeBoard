import RouteCard from "@/components/RouteCard";
import { db } from "@/lib/db";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  FlatList,
  Text,
  View,
} from "react-native";

export default function PlaylistDetailScreen() {
  const { id: playlistId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { isLoading, error, data } = db.useQuery(
    playlistId
      ? {
          playlists: {
            $: { where: { id: playlistId } },
            routes: {
              ascents: {},
            },
          },
        }
      : null
  );

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (error || !data?.playlists?.[0]) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-6">
        <Text className="text-red-500 text-center">
          {error?.message ?? "Playlist not found"}
        </Text>
      </View>
    );
  }

  const playlist = data.playlists[0];
  const routes = playlist.routes ?? [];

  return (
    <View className="flex-1 bg-gray-50">
      {/* Set the native header title dynamically — playlist name + route count */}
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={{ alignItems: "center" }}>
              <Text style={{ fontWeight: "700", fontSize: 17, color: "#111827" }}>
                {playlist.name}
              </Text>
              <Text style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>
                {routes.length} route{routes.length !== 1 ? "s" : ""}
              </Text>
            </View>
          ),
        }}
      />

      {routes.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 text-base">
            No routes in this playlist yet.
          </Text>
          <Text className="text-gray-400 text-sm mt-1">
            Add routes from their detail page.
          </Text>
        </View>
      ) : (
        <FlatList
          data={routes}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <RouteCard
              route={item}
              onPress={() =>
                router.push({
                  pathname: "/route/[id]",
                  params: {
                    id: item.id,
                    routeIds: JSON.stringify(routes.map((r) => r.id)),
                  },
                })
              }
            />
          )}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </View>
  );
}
