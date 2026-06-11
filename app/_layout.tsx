import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { SubscriptionBlocker } from '@/components/SubscriptionBlocker';
import { AuthProvider, useAuthContext } from '@/contexts/AuthContext';
import { CategoryProvider } from '@/contexts/CategoryContext';
import { NetworkProvider } from '@/contexts/NetworkContext';
import { OpenFinanceSyncProvider } from '@/contexts/OpenFinanceSyncContext';
import { PerformanceProvider } from '@/contexts/PerformanceContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { offlineSync } from '@/services/offlineSync';



import {
  AROneSans_400Regular,
  AROneSans_500Medium,
  AROneSans_600SemiBold,
  AROneSans_700Bold,
  useFonts,
} from '@expo-google-fonts/ar-one-sans';
import { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableFreeze } from 'react-native-screens';

enableFreeze(true);

const APP_NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#D97757',
    background: '#0C0C0C',
    card: '#0C0C0C',
    border: 'rgba(255,255,255,0.08)',
    text: '#FFFFFF',
  },
};

function DeferredOfflineSync({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) {
      offlineSync.stop();
      return;
    }

    let cancelled = false;
    let task: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
    const timer = setTimeout(() => {
      task = InteractionManager.runAfterInteractions(() => {
        if (!cancelled) {
          offlineSync.start();
        }
      });
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel?.();
      offlineSync.stop();
    };
  }, [enabled]);

  return null;
}

function RuntimeServices({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthContext();
  const runtimeReady = isAuthenticated && !isLoading;

  return (
    <NetworkProvider enabled={runtimeReady}>
      <DeferredOfflineSync enabled={runtimeReady} />
      {children}
    </NetworkProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    AROneSans_400Regular,
    AROneSans_500Medium,
    AROneSans_600SemiBold,
    AROneSans_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToastProvider>
        <PerformanceProvider>
          <AuthProvider>
            <RuntimeServices>
              <SubscriptionBlocker>
                <CategoryProvider>
                  <OpenFinanceSyncProvider>
                    <ThemeProvider value={APP_NAV_THEME}>
                      <Stack
                        initialRouteName="index"
                        screenOptions={{
                          animation: 'fade',
                          contentStyle: { backgroundColor: '#0C0C0C' },
                        }}
                      >
                        <Stack.Screen name="index" options={{ headerShown: false }} />
                        <Stack.Screen name="(public)" options={{ headerShown: false }} />
                        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                        <Stack.Screen
                          name="settings"
                          options={{
                            headerShown: false,
                            contentStyle: { backgroundColor: '#0C0C0C' },
                          }}
                        />
                        <Stack.Screen name="open-finance/callback" options={{ headerShown: false }} />
                      </Stack>
                      <StatusBar style="light" />
                    </ThemeProvider>
                  </OpenFinanceSyncProvider>
                </CategoryProvider>
              </SubscriptionBlocker>
            </RuntimeServices>
          </AuthProvider>
        </PerformanceProvider>
      </ToastProvider>
    </GestureHandlerRootView>
  );
}


// Force rebuild 7
