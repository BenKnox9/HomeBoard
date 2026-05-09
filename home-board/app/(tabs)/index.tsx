import RouteCard from "@/components/RouteCard";
import { db } from "@/lib/db";
import { GRADES, gradeIndex } from "@/lib/grades";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type SortField = "grade" | "ascents";
type SortDir = "desc" | "asc";
interface SortState {
  field: SortField;
  dir: SortDir;
}

export default function RoutesScreen() {
  const { user } = db.useAuth();
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>(null);

  const { isLoading, error, data } = db.useQuery(
    user
      ? {
          $users: {
            $: { where: { id: user.id } },
            selectedBoard: {
              routes: {
                ascents: {},
              },
            },
          },
        }
      : null
  );

  function cycleSort(field: SortField) {
    if (!sort || sort.field !== field) {
      // First press on this field → descending
      setSort({ field, dir: "desc" });
    } else if (sort.dir === "desc") {
      // Second press → ascending
      setSort({ field, dir: "asc" });
    } else {
      // Third press → off
      setSort(null);
    }
  }

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-6">
        <Text className="text-red-500 text-center">{error.message}</Text>
      </View>
    );
  }

  const selectedBoard = data?.$users?.[0]?.selectedBoard;
  const allRoutes = selectedBoard?.routes ?? [];

  const filteredRoutes = allRoutes
    .filter((r) => gradeFilter === null || r.grade === gradeFilter)
    .sort((a, b) => {
      if (!sort) return 0;
      if (sort.field === "grade") {
        const diff = gradeIndex(a.grade) - gradeIndex(b.grade);
        return sort.dir === "asc" ? diff : -diff;
      }
      const diff = (a.ascents?.length ?? 0) - (b.ascents?.length ?? 0);
      return sort.dir === "asc" ? diff : -diff;
    });

  if (!selectedBoard) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-8">
        <Text className="text-2xl font-bold text-gray-700 mb-2 text-center">
          No board selected
        </Text>
        <Text className="text-gray-400 text-center mb-6">
          Go to your profile to add or select a board.
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/(tabs)/profile")}
          className="bg-indigo-600 rounded-xl px-6 py-3"
        >
          <Text className="text-white font-semibold">Go to Profile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  function SortButton({ field, label }: { field: SortField; label: string }) {
    const active = sort?.field === field;
    return (
      <TouchableOpacity
        onPress={() => cycleSort(field)}
        className="flex-row items-center rounded-lg px-3 py-1.5 gap-x-1"
        style={{ backgroundColor: active ? "#6366f1" : "#f3f4f6" }}
      >
        <Text
          className="text-xs font-semibold"
          style={{ color: active ? "#fff" : "#6b7280" }}
        >
          {label}
        </Text>
        {active && (
          <Ionicons
            name={sort?.dir === "desc" ? "chevron-down" : "chevron-up"}
            size={12}
            color="#fff"
          />
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* Header */}
      <View className="pt-14 px-4 pb-3 bg-white border-b border-gray-100">
        <Text className="text-xl font-bold text-gray-800">
          {selectedBoard.name}
        </Text>
        <Text className="text-gray-400 text-xs mt-0.5">
          {allRoutes.length} route{allRoutes.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* Filter & sort bar */}
      <View className="bg-white border-b border-gray-100 pb-2">
        {/* Sort buttons */}
        <View className="flex-row px-4 pt-2 gap-x-2">
          <SortButton field="grade" label="By grade" />
          <SortButton field="ascents" label="By ascents" />
        </View>

        {/* Grade filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="pt-2 px-4"
          contentContainerStyle={{ gap: 8 }}
        >
          {GRADES.map((g) => (
            <TouchableOpacity
              key={g}
              onPress={() => setGradeFilter(gradeFilter === g ? null : g)}
              className="rounded-full px-3 py-1"
              style={{
                backgroundColor: gradeFilter === g ? "#6366f1" : "#e5e7eb",
              }}
            >
              <Text
                className="text-xs font-semibold"
                style={{ color: gradeFilter === g ? "#fff" : "#4b5563" }}
              >
                {g}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Route list */}
      {filteredRoutes.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <Text className="text-gray-400 text-base">
            {allRoutes.length === 0
              ? "No routes yet — tap + to add one"
              : "No routes match this filter"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRoutes}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <RouteCard
              route={item}
              onPress={() =>
                router.push({ pathname: "/route/[id]", params: { id: item.id } })
              }
            />
          )}
          contentContainerStyle={{ padding: 16 }}
        />
      )}

      {/* Floating + button */}
      <TouchableOpacity
        onPress={() => router.push("/create-route")}
        className="absolute bottom-8 right-6 bg-indigo-600 rounded-full items-center justify-center"
        style={{
          width: 56,
          height: 56,
          shadowColor: "#6366f1",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 6,
        }}
      >
        <Text className="text-white text-3xl font-light" style={{ lineHeight: 54 }}>
          +
        </Text>
      </TouchableOpacity>
    </View>
  );
}
