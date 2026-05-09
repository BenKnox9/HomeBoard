import { gradeBadgeColor } from "@/lib/grades";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, View, Text } from "react-native";

interface RouteCardProps {
  route: {
    id: string;
    name: string;
    grade: string;
    ascents?: { id: string }[];
  };
  onPress: () => void;
}

export default function RouteCard({ route, onPress }: RouteCardProps) {
  const ascentCount = route.ascents?.length ?? 0;
  const badgeColor = gradeBadgeColor(route.grade);

  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white rounded-2xl p-4 mb-3 flex-row items-center"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
      }}
    >
      <View
        className="rounded-xl items-center justify-center mr-4"
        style={{
          backgroundColor: badgeColor,
          width: 52,
          height: 52,
        }}
      >
        <Text className="text-white font-bold text-sm">{route.grade}</Text>
      </View>

      <View className="flex-1">
        <Text className="text-gray-800 font-semibold text-base" numberOfLines={1}>
          {route.name}
        </Text>
      </View>

      <View className="flex-row items-center gap-x-1">
        <Ionicons name="checkmark-circle" size={16} color="#6366f1" />
        <Text className="text-indigo-600 font-semibold text-sm">
          {ascentCount}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color="#d1d5db" className="ml-2" />
    </TouchableOpacity>
  );
}
