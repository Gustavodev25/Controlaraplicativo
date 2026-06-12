import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

// ---------------------------------------------------------------------------
// CRASH-LOOP DETECTION + RECOVERY
// ---------------------------------------------------------------------------
// Expo's ErrorRecovery tries to relaunch from a cached JS bundle when the app
// crashes. If the cached bundle contains the same bug, it creates an infinite
// crash → recovery → crash loop that ends in a SIGABRT.
//
// We use a simple counter in AsyncStorage: increment on mount, reset after
// 5 seconds of stable execution. If the counter exceeds a threshold we
// clear the expo-updates cache to break the loop.
// ---------------------------------------------------------------------------
const CRASH_LOOP_STORAGE_KEY = '@controlar_crash_loop_count';
const CRASH_LOOP_THRESHOLD = 3;

function detectAndBreakCrashLoop() {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;

    AsyncStorage.getItem(CRASH_LOOP_STORAGE_KEY)
      .then((raw: string | null) => {
        const count = parseInt(raw || '0', 10) || 0;
        const nextCount = count + 1;

        // Persist incremented count immediately
        AsyncStorage.setItem(CRASH_LOOP_STORAGE_KEY, String(nextCount)).catch(() => {});

        if (nextCount >= CRASH_LOOP_THRESHOLD) {
          // We're in a crash loop — try to clear the expo-updates cache
          try {
            const Updates = require('expo-updates');
            if (typeof Updates.clearUpdateCacheExperimentalAsync === 'function') {
              Updates.clearUpdateCacheExperimentalAsync().catch(() => {});
            }
          } catch {
            // expo-updates may not be available — that's fine
          }
          // Reset counter so we don't keep clearing
          AsyncStorage.setItem(CRASH_LOOP_STORAGE_KEY, '0').catch(() => {});
        }

        // If the app survives for 5 seconds, it's stable — reset counter
        setTimeout(() => {
          AsyncStorage.setItem(CRASH_LOOP_STORAGE_KEY, '0').catch(() => {});
        }, 5000);
      })
      .catch(() => {});
  } catch {
    // AsyncStorage itself failed to load — nothing we can do
  }
}

// Run crash-loop detection immediately during module evaluation
detectAndBreakCrashLoop();

// ---------------------------------------------------------------------------
// GLOBAL ERROR HANDLER
// ---------------------------------------------------------------------------
// Prevents uncaught native module errors from crashing the app in production
// builds (TestFlight / App Store).
//
// CRITICAL: We do NOT forward FATAL errors to the default handler because
// React Native's default handler calls `abort()`, which triggers Expo's
// ErrorRecovery.crash() → StartupProcedure.throwException() → SIGABRT.
// By intercepting fatal errors here, the app can survive module-level
// failures (e.g. react-native-iap on unsupported iOS versions).
// ---------------------------------------------------------------------------
if (typeof ErrorUtils !== 'undefined') {
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    try {
      console.error('[Controlar+] Global error:', isFatal ? 'FATAL' : 'non-fatal', error);
    } catch {
      // Even logging can fail
    }

    // Only forward NON-FATAL errors. Fatal error forwarding triggers abort()
    // which causes the SIGABRT crash via ErrorRecovery.crash().
    if (!isFatal && typeof originalHandler === 'function') {
      originalHandler(error, false);
    }
    // Fatal errors are intentionally swallowed here. The ErrorBoundary and
    // component-level try-catch blocks will handle any UI recovery needed.
  });
}

import { ErrorBoundary } from '@/components/ErrorBoundary';
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
import React, { useEffect } from 'react';
import { InteractionManager, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// enableFreeze was removed — it causes crashes in production builds
// with Expo SDK 56 + expo-router when the Stack navigator is initializing.
// The freeze optimization is not essential and can be re-enabled after
// confirming app stability in TestFlight.

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
      try { offlineSync.stop(); } catch (_e) { /* ignore */ }
      return;
    }

    let cancelled = false;
    let task: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
    const timer = setTimeout(() => {
      task = InteractionManager.runAfterInteractions(() => {
        if (!cancelled) {
          try { offlineSync.start(); } catch (_e) { /* ignore */ }
        }
      });
    }, 800);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      task?.cancel?.();
      try { offlineSync.stop(); } catch (_e) { /* ignore */ }
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
    // Return a stable empty view to avoid returning null which can crash
    // some versions of react-native-screens/expo-router.
    return <View style={{ flex: 1, backgroundColor: '#0C0C0C' }} />;
  }

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}
