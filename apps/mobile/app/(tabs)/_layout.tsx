import { Tabs, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { View, Image } from "react-native";
import { Text } from "@/components/Themed";
import { font, useTheme } from "@/src/theme";
import { IconButton } from "@/components/Controls";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVehicles } from "@/src/hooks/useDatabase";

export default function TabLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const vehicleCount = useVehicles().data?.length ?? 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 12, ...font("500") },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 72 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
        },
        headerStyle: { backgroundColor: colors.card },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { ...font("600"), fontSize: 17 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Vehicles",
          headerRight: () => (
            <View style={{ flexDirection: "row" }}>
              {vehicleCount > 1 && <IconButton name="arrange" label="Arrange garage" color={colors.text} onPress={() => router.push("/arrange")} />}
              <IconButton name="add" label="Add vehicle" color={colors.text} onPress={() => router.push("/vehicle/new")} />
            </View>
          ),
          headerTitle: () => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }} accessibilityRole="header">
              <Image
                source={require("@/assets/images/icon.png")}
                style={{ width: 24, height: 24, borderRadius: 6 }}
                accessibilityIgnoresInvertColors
              />
              <Text style={{ fontSize: 17, fontWeight: "600", color: colors.text }}>CarBaddie</Text>
            </View>
          ),
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: "car.fill", android: "directions_car", web: "directions_car" }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="service-types"
        options={{
          title: "Service types",
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: "wrench.and.screwdriver.fill", android: "build", web: "build" }} tintColor={color} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: "gearshape.fill", android: "settings", web: "settings" }} tintColor={color} size={24} />
          ),
        }}
      />
    </Tabs>
  );
}
