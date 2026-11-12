import { Tabs } from "expo-router";
import { useColorScheme } from "@/components/useColorScheme";
import { SymbolView } from "expo-symbols";
import { View, Image, Text } from "react-native";

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const tint = isDark ? "#f59e0b" : "#d97706";
  const inactive = isDark ? "#64748b" : "#94a3b8";
  const tabBg = isDark ? "#161922" : "#ffffff";
  const borderColor = isDark ? "#262a36" : "#e2e8f0";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: tint,
        tabBarInactiveTintColor: inactive,
        tabBarStyle: {
          backgroundColor: tabBg,
          borderTopColor: borderColor,
          height: 60,
          paddingBottom: 8,
        },
        headerStyle: { backgroundColor: tabBg },
        headerTintColor: isDark ? "#f1f5f9" : "#0f172a",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Vehicles",
          headerTitle: () => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Image
                source={require("@/assets/images/icon.png")}
                style={{ width: 24, height: 24, borderRadius: 5 }}
              />
              <Text style={{ fontSize: 17, fontWeight: "700", color: isDark ? "#f1f5f9" : "#0f172a" }}>
                CarBaddie
              </Text>
            </View>
          ),
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: "car.fill", android: "directions_car", web: "directions_car" }} tintColor={color} size={26} />
          ),
        }}
      />
      <Tabs.Screen
        name="service-types"
        options={{
          title: "Services",
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: "wrench.and.screwdriver.fill", android: "build", web: "build" }} tintColor={color} size={26} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color }) => (
            <SymbolView name={{ ios: "gearshape.fill", android: "settings", web: "settings" }} tintColor={color} size={26} />
          ),
        }}
      />
    </Tabs>
  );
}
