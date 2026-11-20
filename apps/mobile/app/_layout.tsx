import { useFonts } from "expo-font";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import "react-native-reanimated";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useColorScheme } from "@/components/useColorScheme";
import { useAutoSync } from "@/src/hooks/useAutoSync";
import { useReminders } from "@/src/hooks/useReminders";
import { navigationTheme } from "@/src/theme";
import { FONT_FILES } from "@/src/fonts";
import { loadAppearance, useAppearance } from "@/src/appearance";

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

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FONT_FILES,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  const [appearanceReady, setAppearanceReady] = useState(false);
  useEffect(() => {
    loadAppearance().finally(() => setAppearanceReady(true));
  }, []);

  if (!loaded || !appearanceReady) return null;

  return <RootLayoutNav />;
}

// useAutoSync and useReminders need the QueryClient, so they must run in a component rendered
// *inside* QueryClientProvider, not in the component that renders the provider.
function AutoSync() {
  useAutoSync();
  useReminders();
  return null;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { accent } = useAppearance();

  // The app draws edge to edge (Expo SDK 58), so on Android the window no longer shrinks for the
  // keyboard: forms use KeyboardAwareScrollView and sheets KeyboardAvoidingView, both from
  // react-native-keyboard-controller, which needs this provider at the root.
  return (
    <KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
    <QueryClientProvider client={queryClient}>
      <AutoSync />
      <ThemeProvider value={navigationTheme(colorScheme, accent)}>
        <Stack screenOptions={{ headerShadowVisible: false, headerBackButtonDisplayMode: "minimal" }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="vehicle/[id]/index"
            options={{ title: "Vehicle" }}
          />
          <Stack.Screen
            name="vehicle/[id]/add-log"
            options={{ title: "Add visit", presentation: "modal" }}
          />
          <Stack.Screen
            name="vehicle/[id]/edit-log/[logId]"
            options={{ title: "Edit log", presentation: "modal" }}
          />
          <Stack.Screen
            name="vehicle/[id]/edit-visit/[visitId]"
            options={{ title: "Edit visit", presentation: "modal" }}
          />
          <Stack.Screen
            name="vehicle/[id]/history/[serviceTypeId]"
            options={{ title: "Service history" }}
          />
          <Stack.Screen
            name="vehicle/[id]/settings"
            options={{ title: "Vehicle settings" }}
          />
          <Stack.Screen
            name="vehicle/[id]/odometer"
            options={{ title: "Odometer" }}
          />
          <Stack.Screen
            name="arrange"
            options={{ title: "Arrange garage" }}
          />
          <Stack.Screen
            name="vehicle/new"
            options={{ title: "Add vehicle", presentation: "modal" }}
          />
          <Stack.Screen
            name="vehicle/[id]/edit"
            options={{ title: "Edit vehicle", presentation: "modal" }}
          />
          <Stack.Screen
            name="service-type/new"
            options={{ title: "New service type", presentation: "modal" }}
          />
          <Stack.Screen
            name="service-type/[id]/edit"
            options={{ title: "Edit service type", presentation: "modal" }}
          />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
    </KeyboardProvider>
  );
}
