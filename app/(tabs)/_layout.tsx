import { GlobalSyncBanner } from '@/components/ui/GlobalSyncBanner';
import { IosCoreLoader } from '@/components/ui/IosCoreLoader';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { useAuthContext } from '@/contexts/AuthContext';
import { Redirect, Tabs } from 'expo-router';
import {
  Bell,
  CalendarDays,
  CreditCard,
  House,
  Landmark,
  PiggyBank,
  Repeat2,
  WalletCards,
  type LucideIcon,
} from 'lucide-react-native';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TAB_BAR_HEIGHT = 58;
const TAB_BAR_MAX_WIDTH = 340;
const TAB_BAR_WIDTH_RATIO = 0.78;
const TAB_BAR_RADIUS = 34;

const ACTIVE_PILL_SIZE = 38;
const ACTIVE_PILL_RADIUS = ACTIVE_PILL_SIZE / 2;

const MENU_WIDTH = 195;

const COLORS = {
  background: '#141414',
  surface: '#101010',
  surfaceElevated: '#121212',
  surfaceSoft: '#1A1A1A',
  border: '#252525',
  borderSoft: '#202020',
  text: '#F4F1EF',
  textMuted: 'rgba(244,241,239,0.48)',
  iconInactive: '#F7F2EF',
  accent: '#D97757',
  accentSoft: 'rgba(217,119,87,0.18)',
  accentStrong: 'rgba(217,119,87,0.28)',
  backdrop: 'rgba(0,0,0,0.46)',
};

const SPRING_FAST = {
  damping: 22,
  stiffness: 220,
  mass: 0.9,
  overshootClamping: false,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
} as const;

const SPRING_SOFT = {
  damping: 24,
  stiffness: 180,
  mass: 0.95,
  overshootClamping: false,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
} as const;

const TABS = [
  { key: 'dashboard', title: 'Visão Geral', icon: House },
  { key: 'open-finance', title: 'Contas Bancárias', icon: Landmark },
  { key: 'transactions', title: 'Transações', icon: WalletCards },
  { key: 'recurrence', title: 'Recorrências', icon: CalendarDays },
  { key: 'planning', title: 'Caixinhas', icon: PiggyBank },
] as const;

type TabKey = (typeof TABS)[number]['key'];
type MenuKey = 'transactions' | 'recurrence' | null;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface TabItemProps {
  title: string;
  icon: LucideIcon;
  isActive: boolean;
  onPress: () => void;
}

const TabItem = memo(({ title, icon: IconSource, isActive, onPress }: TabItemProps) => {
  const activeProgress = useSharedValue(isActive ? 1 : 0);
  const pressProgress = useSharedValue(0);

  useEffect(() => {
    activeProgress.value = withTiming(isActive ? 1 : 0, {
      duration: 160,
      easing: Easing.out(Easing.cubic),
    });
  }, [isActive, activeProgress]);

  const iconStyle = useAnimatedStyle(() => {
    const activeScale = interpolate(
      activeProgress.value,
      [0, 1],
      [0.96, 1.07],
      Extrapolation.CLAMP
    );

    const activeY = interpolate(
      activeProgress.value,
      [0, 1],
      [0, -1],
      Extrapolation.CLAMP
    );

    const pressedScale = interpolate(
      pressProgress.value,
      [0, 1],
      [1, 0.94],
      Extrapolation.CLAMP
    );

    return {
      opacity: interpolate(
        activeProgress.value,
        [0, 1],
        [0.58, 1],
        Extrapolation.CLAMP
      ),
      transform: [
        { translateY: activeY + pressProgress.value * 1.2 },
        { scale: activeScale * pressedScale },
      ],
    };
  });

  const pressLayerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      pressProgress.value,
      [0, 1],
      [0, 1],
      Extrapolation.CLAMP
    ),
    transform: [
      {
        scale: interpolate(
          pressProgress.value,
          [0, 1],
          [0.86, 1],
          Extrapolation.CLAMP
        ),
      },
    ],
  }));

  const handlePressIn = useCallback(() => {
    pressProgress.value = withTiming(1, {
      duration: 80,
      easing: Easing.out(Easing.quad),
    });
  }, [pressProgress]);

  const handlePressOut = useCallback(() => {
    pressProgress.value = withTiming(0, {
      duration: 130,
      easing: Easing.out(Easing.cubic),
    });
  }, [pressProgress]);

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ selected: isActive }}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onTouchCancel={handlePressOut}
      style={styles.tabItem}
    >
      <Animated.View pointerEvents="none" style={[styles.tabPressLayer, pressLayerStyle]} />

      <Animated.View style={[styles.iconContainer, iconStyle]}>
        <IconSource
          size={21}
          color={isActive ? COLORS.accent : COLORS.iconInactive}
          strokeWidth={2.1}
        />
      </Animated.View>
    </AnimatedPressable>
  );
});

TabItem.displayName = 'TabItem';

function getActiveTabFromRoute(routeName: string): string {
  if (routeName === 'invoices') return 'transactions';
  return routeName;
}

function CustomTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const currentRouteName = state.routes[state.index].name;

  const [activeTab, setActiveTab] = useState<string>(() => getActiveTabFromRoute(currentRouteName));
  const [visibleMenu, setVisibleMenu] = useState<MenuKey>(null);

  const reducedMotionRef = useRef(false);

  const barProgress = useSharedValue(0);
  const indicatorX = useSharedValue(0);
  const menuProgress = useSharedValue(0);

  const tabBarWidth = useMemo(() => {
    return Math.min(screenWidth * TAB_BAR_WIDTH_RATIO, TAB_BAR_MAX_WIDTH);
  }, [screenWidth]);

  const tabWidth = tabBarWidth / TABS.length;
  const tabBarLeft = (screenWidth - tabBarWidth) / 2;

  const anchors = useMemo(() => {
    const transactionsIndex = TABS.findIndex((tab) => tab.key === 'transactions');
    const recurrenceIndex = TABS.findIndex((tab) => tab.key === 'recurrence');

    return {
      transactions: tabBarLeft + tabWidth * transactionsIndex + tabWidth / 2,
      recurrence: tabBarLeft + tabWidth * recurrenceIndex + tabWidth / 2,
    };
  }, [tabBarLeft, tabWidth]);

  const activeMenuAnchorX = visibleMenu === 'recurrence' ? anchors.recurrence : anchors.transactions;

  const menuLeft = useMemo(() => {
    return Math.max(
      14,
      Math.min(activeMenuAnchorX - MENU_WIDTH / 2, screenWidth - MENU_WIDTH - 14)
    );
  }, [activeMenuAnchorX, screenWidth]);

  const menuBottom = 90 + Math.max(insets.bottom - 8, 0);
  const tabBottom = 20 + Math.max(insets.bottom, 0);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) {
        reducedMotionRef.current = enabled;
      }
    });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reducedMotionRef.current = enabled;
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const reduced = reducedMotionRef.current;

    barProgress.value = reduced
      ? withTiming(1, { duration: 120 })
      : withSpring(1, SPRING_SOFT);
  }, [barProgress]);

  useEffect(() => {
    if (!visibleMenu) {
      setActiveTab(getActiveTabFromRoute(currentRouteName));
    }
  }, [currentRouteName, visibleMenu]);

  useEffect(() => {
    const index = TABS.findIndex((tab) => tab.key === activeTab);

    if (index < 0) return;

    const nextX = index * tabWidth + (tabWidth - ACTIVE_PILL_SIZE) / 2;

    indicatorX.value = reducedMotionRef.current
      ? withTiming(nextX, { duration: 100 })
      : withSpring(nextX, SPRING_FAST);
  }, [activeTab, indicatorX, tabWidth]);

  useEffect(() => {
    const isOpen = !!visibleMenu;
    const reduced = reducedMotionRef.current;

    menuProgress.value = withTiming(isOpen ? 1 : 0, {
      duration: reduced ? 100 : 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [visibleMenu, menuProgress]);

  const closeMenus = useCallback(() => {
    setVisibleMenu(null);
    setActiveTab(getActiveTabFromRoute(currentRouteName));
  }, [currentRouteName]);

  const handlePress = useCallback(
    (tabKey: TabKey) => {
      if (tabKey === 'transactions' || tabKey === 'recurrence') {
        const nextMenu = visibleMenu === tabKey ? null : tabKey;

        setVisibleMenu(nextMenu);

        if (nextMenu) {
          setActiveTab(nextMenu);
        } else {
          setActiveTab(getActiveTabFromRoute(currentRouteName));
        }

        return;
      }

      setVisibleMenu(null);
      setActiveTab(tabKey);
      navigation.navigate(tabKey);
    },
    [currentRouteName, navigation, visibleMenu]
  );

  const handleTransactionsPress = useCallback(() => {
    setVisibleMenu(null);
    setActiveTab('transactions');
    navigation.navigate('transactions', { filter: 'account' });
  }, [navigation]);

  const handleInvoicesPress = useCallback(() => {
    setVisibleMenu(null);
    setActiveTab('transactions');
    navigation.navigate('invoices');
  }, [navigation]);

  const handleSubscriptionsPress = useCallback(() => {
    setVisibleMenu(null);
    setActiveTab('recurrence');
    navigation.navigate('recurrence', { tab: 'subscriptions' });
  }, [navigation]);

  const handleRemindersPress = useCallback(() => {
    setVisibleMenu(null);
    setActiveTab('recurrence');
    navigation.navigate('recurrence', { tab: 'reminders' });
  }, [navigation]);

  const tabBarAnimatedStyle = useAnimatedStyle(() => {
    const progress = barProgress.value;

    return {
      opacity: interpolate(progress, [0, 1], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateY: interpolate(progress, [0, 1], [18, 0], Extrapolation.CLAMP),
        },
        {
          scale: interpolate(progress, [0, 1], [0.94, 1], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  const menuAnimatedStyle = useAnimatedStyle(() => {
    const progress = menuProgress.value;
    const startX = activeMenuAnchorX - (menuLeft + MENU_WIDTH / 2);

    return {
      opacity: interpolate(progress, [0, 1], [0, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateX: interpolate(progress, [0, 1], [startX * 0.18, 0], Extrapolation.CLAMP),
        },
        {
          translateY: interpolate(progress, [0, 1], [12, 0], Extrapolation.CLAMP),
        },
        {
          scale: interpolate(progress, [0, 1], [0.96, 1], Extrapolation.CLAMP),
        },
      ],
    };
  });

  const menuContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(menuProgress.value, [0, 0.65, 1], [0, 0.7, 1], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(menuProgress.value, [0, 1], [3, 0], Extrapolation.CLAMP),
      },
    ],
  }));

  const menuArrowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(menuProgress.value, [0, 0.75, 1], [0, 0, 1], Extrapolation.CLAMP),
    transform: [
      { rotate: '45deg' },
      {
        scale: interpolate(menuProgress.value, [0, 1], [0.72, 1], Extrapolation.CLAMP),
      },
    ],
  }));

  return (
    <View style={styles.fullScreenContainer} pointerEvents="box-none">
      {!!visibleMenu && (
        <Animated.View
          entering={FadeIn.duration(90)}
          exiting={FadeOut.duration(120)}
          style={[StyleSheet.absoluteFill, styles.backdropLayer]}
        >
          <Pressable
            style={[StyleSheet.absoluteFill, styles.backdropPressable]}
            onPress={closeMenus}
          />
        </Animated.View>
      )}

      {!!visibleMenu && (
        <Animated.View
          entering={FadeIn.duration(90)}
          exiting={FadeOut.duration(110)}
          style={[
            styles.menuContainer,
            {
              left: menuLeft,
              bottom: menuBottom,
            },
            menuAnimatedStyle,
          ]}
        >
          <View style={styles.menuBox}>
            <Animated.View style={[styles.menuContent, menuContentStyle]}>
              {visibleMenu === 'transactions' && (
                <>
                  <Pressable
                    android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
                    style={({ pressed }) => [
                      styles.menuItem,
                      pressed && Platform.OS === 'ios' ? styles.menuItemPressed : null,
                    ]}
                    onPress={handleTransactionsPress}
                  >
                    <View style={styles.menuIconBubble}>
                      <WalletCards size={17} color={COLORS.text} strokeWidth={2} />
                    </View>

                    <View style={styles.menuTextBlock}>
                      <Text style={styles.menuText}>Transações</Text>
                      <Text style={styles.menuDescription}>Entradas, saídas e filtros</Text>
                    </View>
                  </Pressable>

                  <View style={styles.menuDivider} />

                  <Pressable
                    android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
                    style={({ pressed }) => [
                      styles.menuItem,
                      pressed && Platform.OS === 'ios' ? styles.menuItemPressed : null,
                    ]}
                    onPress={handleInvoicesPress}
                  >
                    <View style={styles.menuIconBubble}>
                      <CreditCard size={17} color={COLORS.text} strokeWidth={2} />
                    </View>

                    <View style={styles.menuTextBlock}>
                      <Text style={styles.menuText}>Cartão de Crédito</Text>
                      <Text style={styles.menuDescription}>Faturas e lançamentos</Text>
                    </View>
                  </Pressable>
                </>
              )}

              {visibleMenu === 'recurrence' && (
                <>
                  <Pressable
                    android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
                    style={({ pressed }) => [
                      styles.menuItem,
                      pressed && Platform.OS === 'ios' ? styles.menuItemPressed : null,
                    ]}
                    onPress={handleSubscriptionsPress}
                  >
                    <View style={styles.menuIconBubble}>
                      <Repeat2 size={17} color={COLORS.text} strokeWidth={2} />
                    </View>

                    <View style={styles.menuTextBlock}>
                      <Text style={styles.menuText}>Assinaturas</Text>
                      <Text style={styles.menuDescription}>Pagamentos recorrentes</Text>
                    </View>
                  </Pressable>

                  <View style={styles.menuDivider} />

                  <Pressable
                    android_ripple={{ color: 'rgba(255,255,255,0.05)' }}
                    style={({ pressed }) => [
                      styles.menuItem,
                      pressed && Platform.OS === 'ios' ? styles.menuItemPressed : null,
                    ]}
                    onPress={handleRemindersPress}
                  >
                    <View style={styles.menuIconBubble}>
                      <Bell size={17} color={COLORS.text} strokeWidth={2} />
                    </View>

                    <View style={styles.menuTextBlock}>
                      <Text style={styles.menuText}>Lembretes</Text>
                      <Text style={styles.menuDescription}>Alertas e vencimentos</Text>
                    </View>
                  </Pressable>
                </>
              )}
            </Animated.View>
          </View>

          <Animated.View style={[styles.menuArrow, menuArrowStyle]} />
        </Animated.View>
      )}

      <GlobalSyncBanner />
      <OfflineBanner />

      <Animated.View
        style={[
          styles.tabBarShadow,
          {
            width: tabBarWidth,
            bottom: tabBottom,
          },
          tabBarAnimatedStyle,
        ]}
      >
        <View style={styles.tabBarInner}>
          <View pointerEvents="none" style={styles.innerTopLine} />
          <View pointerEvents="none" style={styles.innerBottomShade} />

          <Animated.View style={[styles.indicatorWrapper, indicatorStyle]}>
            <View style={styles.indicatorPill} />
          </Animated.View>

          <View style={styles.tabsSection}>
            {TABS.map((tab) => (
              <TabItem
                key={tab.key}
                title={tab.title}
                icon={tab.icon}
                isActive={activeTab === tab.key}
                onPress={() => handlePress(tab.key)}
              />
            ))}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuthContext();

  if (isLoading) {
    return <IosCoreLoader style={styles.loadingContainer} />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(public)/welcome" />;
  }

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      detachInactiveScreens
      screenOptions={{
        headerShown: false,
        animation: 'none',
        freezeOnBlur: true,
        lazy: true,
      }}
    >
      <Tabs.Screen name="dashboard" />
      <Tabs.Screen name="open-finance" />
      <Tabs.Screen name="transactions" />
      <Tabs.Screen name="recurrence" />
      <Tabs.Screen name="planning" />
      <Tabs.Screen name="invoices" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },

  fullScreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },

  backdropLayer: {
    zIndex: 1,
  },

  backdropPressable: {
    backgroundColor: COLORS.backdrop,
  },

  tabBarShadow: {
    position: 'absolute',
    alignSelf: 'center',
    height: TAB_BAR_HEIGHT,
    zIndex: 100,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.28,
    shadowRadius: 18,
  },

  tabBarInner: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: TAB_BAR_RADIUS,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  innerTopLine: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.055)',
    zIndex: 2,
  },

  innerBottomShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.12)',
    zIndex: 2,
  },

  tabsSection: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: TAB_BAR_HEIGHT,
    flexDirection: 'row',
    zIndex: 6,
  },

  tabItem: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    zIndex: 7,
  },

  tabPressLayer: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },

  iconContainer: {
    width: ACTIVE_PILL_SIZE,
    height: ACTIVE_PILL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },

  indicatorWrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: ACTIVE_PILL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 4,
  },

  indicatorPill: {
    width: ACTIVE_PILL_SIZE,
    height: ACTIVE_PILL_SIZE,
    borderRadius: ACTIVE_PILL_RADIUS,
    backgroundColor: COLORS.accentSoft,
    borderWidth: 1,
    borderColor: COLORS.accentStrong,
  },

  menuContainer: {
    position: 'absolute',
    width: MENU_WIDTH,
    zIndex: 1000,
    alignItems: 'center',
  },

  menuBox: {
    width: MENU_WIDTH,
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 14,
    },
    shadowOpacity: 0.3,
    shadowRadius: 22,
    elevation: 12,
  },

  menuContent: {
    paddingVertical: 4,
    backgroundColor: COLORS.surface,
  },

  menuItem: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: COLORS.surface,
  },

  menuItemPressed: {
    backgroundColor: COLORS.surfaceElevated,
  },

  menuIconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    backgroundColor: COLORS.surfaceSoft,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
  },

  menuTextBlock: {
    flex: 1,
  },

  menuText: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: -0.2,
  },

  menuDescription: {
    marginTop: 1,
    color: COLORS.textMuted,
    fontSize: 10.5,
    fontWeight: '400',
    letterSpacing: -0.15,
  },

  menuDivider: {
    height: 1,
    backgroundColor: COLORS.border,
  },

  menuArrow: {
    width: 18,
    height: 18,
    marginTop: -9,
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    zIndex: 1,
  },
});
