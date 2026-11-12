import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-reanimated";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useColorScheme } from "@/components/useColorScheme";
import { useAutoSync } from "@/src/hooks/useAutoSync";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  anchor: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5 }, // 5 min
  },
});

// Custom dark theme matching CarBaddie desktop unslop palette
const CarBaddieDark = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: "#f59e0b",       // warm amber accent
    background: "#0d0f12",    // dark graphite
    card: "#161922",          // solid graphite card
    text: "#f1f5f9",          // slate-100
    border: "#262a36",        // subtle border
    notification: "#ef4444",
  },
};

const CarBaddieLight = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: "#d97706",       // deep amber accent
    background: "#f8fafc",    // clean slate background
    card: "#ffffff",
    text: "#0f172a",          // slate-900
    border: "#e2e8f0",        // slate-200
    notification: "#ef4444",
  },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return <RootLayoutNav />;
}

// useAutoSync needs the QueryClient, so it must run in a component rendered
// *inside* QueryClientProvider, not in the component that renders the provider.
function AutoSync() {
  useAutoSync();
  return null;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <AutoSync />
      <ThemeProvider value={colorScheme === "dark" ? CarBaddieDark : CarBaddieLight}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="vehicle/[id]/index"
            options={{ title: "Vehicle Details", headerBackTitle: "Back" }}
          />
          <Stack.Screen
            name="vehicle/[id]/add-log"
            options={{ title: "Add Log", presentation: "modal" }}
          />
          <Stack.Screen
            name="vehicle/[id]/edit-log/[logId]"
            options={{ title: "Edit Log", presentation: "modal" }}
          />
          <Stack.Screen
            name="vehicle/[id]/history/[serviceTypeId]"
            options={{ title: "Service History" }}
          />
          <Stack.Screen
            name="vehicle/[id]/settings"
            options={{ title: "Vehicle Settings" }}
          />
          <Stack.Screen
            name="vehicle/new"
            options={{ title: "Add Vehicle", presentation: "modal" }}
          />
          <Stack.Screen
            name="vehicle/[id]/edit"
            options={{ title: "Edit Vehicle", presentation: "modal" }}
          />
          <Stack.Screen
            name="service-type/new"
            options={{ title: "New Service Type", presentation: "modal" }}
          />
          <Stack.Screen
            name="service-type/[id]/edit"
            options={{ title: "Edit Service Type", presentation: "modal" }}
          />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
