import RouteCard from "@/components/RouteCard";
import { db } from "@/lib/db";
import { GRADES, gradeIndex } from "@/lib/grades";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  InputAccessoryView,
  Keyboard,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const SEARCH_ACCESSORY_ID = "routes-search";

type SortField = "grade" | "ascents";
type SortDir = "desc" | "asc";
interface SortState {
  field: SortField;
  dir: SortDir;
}

export default function RoutesScreen() {
  const { user } = db.useAuth();
  const [gradeFilters, setGradeFilters] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { isLoading, error, data } = db.useQuery(
    user
      ? {
          $users: {
            $: { where: { id: user.id } },
            selectedBoard: {
              routes: {
                ascents: {},
                creator: {},
              },
            },
          },
        }
      : null
  );

  function cycleSort(field: SortField) {
    if (!sort || sort.field !== field) {
      setSort({ field, dir: "desc" });
    } else if (sort.dir === "desc") {
      setSort({ field, dir: "asc" });
    } else {
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
  const allRoutes = (selectedBoard?.routes ?? []) as any[];

  const q = searchQuery.trim().toLowerCase();
  const isUsernameSearch = q.startsWith("@");
  const searchTerm = isUsernameSearch ? q.slice(1) : q;

  const filteredRoutes = allRoutes
    .filter((r) => {
      if (gradeFilters.size > 0 && !gradeFilters.has(r.grade)) return false;
      if (!searchTerm) return true;
      if (isUsernameSearch) {
        return r.creator?.username?.toLowerCase().includes(searchTerm);
      }
      return (
        r.name?.toLowerCase().includes(searchTerm) ||
        r.creator?.username?.toLowerCase().includes(searchTerm)
      );
    })
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
          <Text className="text-white font-semibold">Go to profile</Text>
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

        {/* Search bar */}
        <View className="flex-row items-center mx-4 mt-2 bg-gray-100 rounded-xl px-3 gap-x-2">
          <Ionicons name="search-outline" size={16} color="#9ca3af" />
          <TextInput
            className="flex-1 py-2 text-sm text-gray-800"
            placeholder="Search by name or @username…"
            placeholderTextColor="#9ca3af"
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            inputAccessoryViewID={SEARCH_ACCESSORY_ID}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={16} color="#9ca3af" />
            </TouchableOpacity>
          )}
        </View>

        {/* Grade filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="pt-2 px-4"
          contentContainerStyle={{ gap: 8, paddingRight: 16 }}
        >
          {(gradeFilters.size > 0 || searchQuery.length > 0) && (
            <TouchableOpacity
              onPress={() => {
                setGradeFilters(new Set());
                setSearchQuery("");
              }}
              className="rounded-full px-3 py-1 flex-row items-center gap-x-1"
              style={{ backgroundColor: "#fee2e2" }}
            >
              <Ionicons name="close" size={11} color="#ef4444" />
              <Text className="text-xs font-semibold" style={{ color: "#ef4444" }}>
                Clear filters
              </Text>
            </TouchableOpacity>
          )}
          {GRADES.map((g) => {
            const active = gradeFilters.has(g);
            return (
              <TouchableOpacity
                key={g}
                onPress={() =>
                  setGradeFilters((prev) => {
                    const next = new Set(prev);
                    next.has(g) ? next.delete(g) : next.add(g);
                    return next;
                  })
                }
                className="rounded-full px-3 py-1"
                style={{ backgroundColor: active ? "#6366f1" : "#e5e7eb" }}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: active ? "#fff" : "#4b5563" }}
                >
                  {g}
                </Text>
              </TouchableOpacity>
            );
          })}
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
                router.push({
                  pathname: "/route/[id]",
                  params: {
                    id: item.id,
                    routeIds: JSON.stringify(filteredRoutes.map((r) => r.id)),
                  },
                })
              }
            />
          )}
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {/* Keyboard dismiss toolbar */}
      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={SEARCH_ACCESSORY_ID}>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", backgroundColor: "#f3f4f6", borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingHorizontal: 16, paddingVertical: 8 }}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Ionicons name="chevron-down" size={16} color="#6366f1" />
              <Text style={{ color: "#6366f1", fontWeight: "600", fontSize: 15 }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
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
