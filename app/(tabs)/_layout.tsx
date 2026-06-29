import { GlobalSyncBanner } from '@/components/ui/GlobalSyncBanner';
import { IosCoreLoader } from '@/components/ui/IosCoreLoader';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { useAuthContext } from '@/contexts/AuthContext';
import { BlurView } from 'expo-blur';
import { Redirect, router, Tabs } from 'expo-router';
import {
  Bell,
  CalendarDays,
  CreditCard,
  Home,
  Landmark,
  PiggyBank,
  Repeat,
  WalletCards,
} from 'lucide-react-native';
import { type ComponentType, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  ZoomOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ACCENT_ORANGE = '#D97757';
const TEXT_DARK = '#F2F2F2';
const TEXT_MUTED = '#8E8E93';

const TAB_BAR_HEIGHT = 46;
const TAB_BAR_WIDTH = Math.min(SCREEN_WIDTH * 0.78, 320);
const TAB_BAR_RADIUS = 23;

const ACTIVE_PILL_WIDTH = 40;
const ACTIVE_PILL_HEIGHT = 30;
const ACTIVE_PILL_RADIUS = 12;

const MENU_WIDTH = 190;

const SPRING_ENTRY = {
  damping: 18,
  stiffness: 210,
  mass: 1,
  overshootClamping: false,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
} as const;

const SPRING_MORPH = {
  damping: 18,
  stiffness: 190,
  mass: 1,
  overshootClamping: false,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
} as const;

const SPRING_STRETCH = {
  damping: 13,
  stiffness: 170,
  mass: 1.05,
  overshootClamping: false,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
} as const;

const SPRING_RECOIL = {
  damping: 18,
  stiffness: 155,
  mass: 1,
  overshootClamping: false,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
} as const;

const SPRING_SETTLE = {
  damping: 24,
  stiffness: 170,
  mass: 1,
  overshootClamping: false,
  restDisplacementThreshold: 0.001,
  restSpeedThreshold: 0.001,
} as const;

const MICRO_SPRING = {
  damping: 18,
  stiffness: 390,
  mass: 0.55,
  overshootClamping: false,
} as const;

const TABS = [
  { key: 'dashboard', Icon: Home },
  { key: 'open-finance', Icon: Landmark },
  { key: 'transactions', Icon: WalletCards },
  { key: 'recurrence', Icon: CalendarDays },
  { key: 'planning', Icon: PiggyBank },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function getVisualTabFromRoute(routeName: string): TabKey {
  if (routeName === 'invoices') return 'transactions';

  return TABS.some((tab) => tab.key === routeName)
    ? (routeName as TabKey)
    : 'dashboard';
}

function getTabIndex(tabKey: TabKey) {
  return TABS.findIndex((tab) => tab.key === tabKey);
}

function getIndicatorX(tabKey: TabKey, barWidth = TAB_BAR_WIDTH) {
  const itemWidth = barWidth / TABS.length;
  const index = Math.max(getTabIndex(tabKey), 0);

  return index * itemWidth + (itemWidth - ACTIVE_PILL_WIDTH) / 2;
}

type MenuKey = 'transactions' | 'recurrence' | null;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface TabItemProps {
  Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  isActive: boolean;
  onPress: () => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

const TabItem = ({
  Icon,
  isActive,
  onPress,
  onInteractionStart,
  onInteractionEnd,
}: TabItemProps) => {
  const activeProgress = useSharedValue(isActive ? 1 : 0);
  const pressProgress = useSharedValue(0);

  useEffect(() => {
    activeProgress.value = withSpring(isActive ? 1 : 0, MICRO_SPRING);
  }, [isActive, activeProgress]);

  const itemStyle = useAnimatedStyle(() => {
    const pressScale = interpolate(
      pressProgress.value,
      [0, 1],
      [1, 0.955],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scale: pressScale }],
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      activeProgress.value,
      [0, 1],
      [0.94, 1.06],
      Extrapolation.CLAMP
    );

    return {
      opacity: interpolate(activeProgress.value, [0, 1], [0.72, 1], Extrapolation.CLAMP),
      transform: [
        { translateY: pressProgress.value * 0.6 },
        { scale },
      ],
    };
  });

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        onInteractionStart?.();
        pressProgress.value = withSpring(1, MICRO_SPRING);
      }}
      onPressOut={() => {
        onInteractionEnd?.();
        pressProgress.value = withSpring(0, MICRO_SPRING);
      }}
      onTouchCancel={onInteractionEnd}
      style={[styles.tabItem, itemStyle]}
    >
      <Animated.View style={[styles.iconContainer, iconStyle]}>
        <Icon
          size={20}
          color={isActive ? ACCENT_ORANGE : TEXT_MUTED}
          strokeWidth={isActive ? 2.35 : 2}
        />
      </Animated.View>
    </AnimatedPressable>
  );
};

function CustomTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();

  const currentRouteName = state.routes[state.index].name;
  const initialActiveTab = getVisualTabFromRoute(currentRouteName);

  const [activeTab, setActiveTab] = useState<TabKey>(() => initialActiveTab);
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const [visibleMenu, setVisibleMenu] = useState<MenuKey>(null);

  const reducedMotionRef = useRef(false);

  const barVisibility = useSharedValue(0);
  const barSquash = useSharedValue(1);
  const barPressProgress = useSharedValue(0);
  const barMorphProgress = useSharedValue(0);

  const targetBarWidth = useSharedValue(TAB_BAR_WIDTH);
  const targetBarHeight = useSharedValue(TAB_BAR_HEIGHT);
  const targetBarRadius = useSharedValue(TAB_BAR_RADIUS);

  const indicatorTargetX = useSharedValue(getIndicatorX(initialActiveTab));
  const indicatorTargetWidth = useSharedValue(ACTIVE_PILL_WIDTH);
  const indicatorSquash = useSharedValue(1);
  const liquidFlash = useSharedValue(0);

  const menuProgress = useSharedValue(0);
  const menuSquash = useSharedValue(1);
  const menuContentReveal = useSharedValue(0);

  const animatedBarWidth = useDerivedValue(() =>
    withSpring(targetBarWidth.value, SPRING_MORPH)
  );

  const animatedBarHeight = useDerivedValue(() =>
    withSpring(targetBarHeight.value, SPRING_MORPH)
  );

  const animatedBarRadius = useDerivedValue(() =>
    withSpring(targetBarRadius.value, SPRING_MORPH)
  );

  const animatedIndicatorX = useDerivedValue(() =>
    withSpring(indicatorTargetX.value, SPRING_MORPH)
  );

  const animatedIndicatorWidth = useDerivedValue(() =>
    withSpring(indicatorTargetWidth.value, SPRING_MORPH)
  );

  const tabWidth = tabBarWidth > 0 ? tabBarWidth / TABS.length : TAB_BAR_WIDTH / TABS.length;

  const tabBarLeft = (SCREEN_WIDTH - TAB_BAR_WIDTH) / 2;
  const screenTabWidth = TAB_BAR_WIDTH / TABS.length;

  const transactionsAnchorX = tabBarLeft + screenTabWidth * 2 + screenTabWidth / 2;
  const recurrenceAnchorX = tabBarLeft + screenTabWidth * 3 + screenTabWidth / 2;

  const activeMenuAnchorX =
    visibleMenu === 'recurrence' ? recurrenceAnchorX : transactionsAnchorX;

  const menuLeft = Math.max(
    14,
    Math.min(activeMenuAnchorX - MENU_WIDTH / 2, SCREEN_WIDTH - MENU_WIDTH - 14)
  );

  const menuBottom = 68 + Math.max(insets.bottom - 8, 0);

  const menuIconColor = '#F2F2F2';

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) reducedMotionRef.current = enabled;
    });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      reducedMotionRef.current = enabled;
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const reduced = reducedMotionRef.current;

    barSquash.value = 0.84;

    barVisibility.value = reduced
      ? withTiming(1, { duration: 120 })
      : withSpring(1, SPRING_ENTRY);

    barSquash.value = reduced
      ? withTiming(1, { duration: 120 })
      : withSequence(
        withSpring(1.075, SPRING_STRETCH),
        withSpring(0.982, SPRING_RECOIL),
        withSpring(1, SPRING_SETTLE)
      );
  }, [barVisibility, barSquash]);

  useEffect(() => {
    if (!visibleMenu) {
      setActiveTab(getVisualTabFromRoute(currentRouteName));
    }
  }, [currentRouteName, visibleMenu]);

  useEffect(() => {
    if (tabWidth > 0) {
      const centeredX = getIndicatorX(
        activeTab,
        tabBarWidth > 0 ? tabBarWidth : TAB_BAR_WIDTH
      );

      indicatorTargetX.value = centeredX;
      indicatorTargetWidth.value = ACTIVE_PILL_WIDTH;

      const reduced = reducedMotionRef.current;

      if (reduced) {
        indicatorSquash.value = withTiming(1, { duration: 120 });
      } else {
        indicatorSquash.value = withSequence(
          withSpring(1.065, SPRING_STRETCH),
          withSpring(0.986, SPRING_RECOIL),
          withSpring(1, SPRING_SETTLE)
        );
      }

      liquidFlash.value = 0;
      liquidFlash.value = withSequence(
        withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) })
      );
    }
  }, [
    activeTab,
    tabBarWidth,
    tabWidth,
    indicatorTargetX,
    indicatorTargetWidth,
    indicatorSquash,
    liquidFlash,
  ]);

  useEffect(() => {
    const isOpen = !!visibleMenu;
    const reduced = reducedMotionRef.current;

    targetBarWidth.value = isOpen ? TAB_BAR_WIDTH + 8 : TAB_BAR_WIDTH;
    targetBarHeight.value = isOpen ? TAB_BAR_HEIGHT + 2 : TAB_BAR_HEIGHT;
    targetBarRadius.value = isOpen ? TAB_BAR_RADIUS + 2 : TAB_BAR_RADIUS;

    if (isOpen) {
      menuSquash.value = 0.84;
      menuContentReveal.value = 0;

      menuProgress.value = reduced
        ? withTiming(1, { duration: 120 })
        : withSpring(1, SPRING_ENTRY);

      menuSquash.value = reduced
        ? withTiming(1, { duration: 120 })
        : withSequence(
          withSpring(1.075, SPRING_STRETCH),
          withSpring(0.982, SPRING_RECOIL),
          withSpring(1, SPRING_SETTLE)
        );

      menuContentReveal.value = withTiming(1, {
        duration: reduced ? 90 : 220,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      menuContentReveal.value = withTiming(0, {
        duration: 90,
        easing: Easing.out(Easing.quad),
      });

      menuSquash.value = withTiming(0.84, {
        duration: 150,
        easing: Easing.inOut(Easing.cubic),
      });

      menuProgress.value = withTiming(0, {
        duration: 180,
        easing: Easing.inOut(Easing.cubic),
      });
    }

  }, [
    visibleMenu,
    menuProgress,
    menuSquash,
    menuContentReveal,
    targetBarWidth,
    targetBarHeight,
    targetBarRadius,
  ]);

  const closeMenus = () => {
    setVisibleMenu(null);
    setActiveTab(getVisualTabFromRoute(currentRouteName));
  };

  const startNavMorph = () => {
    barPressProgress.value = withSpring(1, {
      damping: 17,
      stiffness: 260,
      mass: 0.42,
    });

    barMorphProgress.value = withSpring(1, {
      damping: 14,
      stiffness: 190,
      mass: 0.48,
    });
  };

  const endNavMorph = () => {
    barPressProgress.value = withSpring(0, {
      damping: 16,
      stiffness: 220,
      mass: 0.45,
    });

    barMorphProgress.value = withSpring(0, {
      damping: 12,
      stiffness: 150,
      mass: 0.52,
    });
  };

  const handlePress = (tabKey: TabKey) => {
    if (tabKey === 'transactions' || tabKey === 'recurrence') {
      const nextMenu: MenuKey = visibleMenu === tabKey ? null : tabKey;

      if (nextMenu && visibleMenu !== nextMenu) {
        menuProgress.value = 0;
        menuSquash.value = 0.84;
        menuContentReveal.value = 0;
      }

      setVisibleMenu(nextMenu);

      if (nextMenu) {
        setActiveTab(nextMenu);
      } else if (currentRouteName === 'invoices') {
        setActiveTab('transactions');
      } else {
        setActiveTab(getVisualTabFromRoute(currentRouteName));
      }

      return;
    }

    setVisibleMenu(null);
    setActiveTab(tabKey);
    navigation.navigate(tabKey);
  };

  const handleTransactionsPress = () => {
    setVisibleMenu(null);
    setActiveTab('transactions');
    router.push(`/transactions?filter=account`);
  };

  const handleInvoicesPress = () => {
    setVisibleMenu(null);
    setActiveTab('transactions');
    router.push('/invoices');
  };

  const handleSubscriptionsPress = () => {
    setVisibleMenu(null);
    setActiveTab('recurrence');
    router.push({
      pathname: '/recurrence',
      params: { tab: 'subscriptions' },
    });
  };

  const handleRemindersPress = () => {
    setVisibleMenu(null);
    setActiveTab('recurrence');
    router.push({
      pathname: '/recurrence',
      params: { tab: 'reminders' },
    });
  };

  const tabBarAnimatedStyle = useAnimatedStyle(() => {
    const pressed = barPressProgress.value;
    const morph = barMorphProgress.value;

    const stretchX = interpolate(
      barSquash.value,
      [0.84, 0.982, 1, 1.075],
      [0.93, 0.992, 1, 1.032],
      Extrapolation.CLAMP
    );

    const stretchY = interpolate(
      barSquash.value,
      [0.84, 0.982, 1, 1.075],
      [1.07, 1.012, 1, 0.982],
      Extrapolation.CLAMP
    );

    const baseScaleX = interpolate(
      barVisibility.value,
      [0, 0.34, 0.72, 1],
      [0.22, 1.024, 0.994, 1],
      Extrapolation.CLAMP
    );

    const baseScaleY = interpolate(
      barVisibility.value,
      [0, 0.42, 0.8, 1],
      [0.18, 0.95, 1.008, 1],
      Extrapolation.CLAMP
    );

    const translateY = interpolate(
      barVisibility.value,
      [0, 0.5, 0.82, 1],
      [26, -3, 1, 0],
      Extrapolation.CLAMP
    );

    return {
      width: animatedBarWidth.value,
      height: animatedBarHeight.value,
      opacity: interpolate(barVisibility.value, [0, 0.22, 1], [0, 0.88, 1]),
      transform: [
        { translateY: translateY + pressed * 1.2 },
        { scaleX: baseScaleX * stretchX * (1 + morph * 0.01 - pressed * 0.01) },
        { scaleY: baseScaleY * stretchY * (1 + morph * 0.012 + pressed * 0.006) },
      ],
    };
  });

  const tabBarInnerAnimatedStyle = useAnimatedStyle(() => {
    const pressed = barPressProgress.value;
    const morph = barMorphProgress.value;

    return {
      borderRadius: animatedBarRadius.value + morph * 3 - pressed * 1,
      backgroundColor: '#171717',
    };
  });

  const tabBarContentCounterStyle = useAnimatedStyle(() => {
    const counterX = interpolate(
      barSquash.value,
      [0.84, 0.982, 1, 1.075],
      [1.08, 1.01, 1, 0.97],
      Extrapolation.CLAMP
    );

    const counterY = interpolate(
      barSquash.value,
      [0.84, 0.982, 1, 1.075],
      [0.94, 0.988, 1, 1.02],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scaleX: counterX }, { scaleY: counterY }],
    };
  });

  const indicatorLayerCounterStyle = useAnimatedStyle(() => {
    const counterX = interpolate(
      barSquash.value,
      [0.84, 0.982, 1, 1.075],
      [1.08, 1.01, 1, 0.97],
      Extrapolation.CLAMP
    );

    const counterY = interpolate(
      barSquash.value,
      [0.84, 0.982, 1, 1.075],
      [0.94, 0.988, 1, 1.02],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ scaleX: counterX }, { scaleY: counterY }],
    };
  });

  const indicatorStyle = useAnimatedStyle(() => ({
    width: animatedIndicatorWidth.value,
    transform: [{ translateX: animatedIndicatorX.value }],
  }));

  const indicatorInnerStyle = useAnimatedStyle(() => {
    const flashScaleX = interpolate(
      liquidFlash.value,
      [0, 0.45, 1],
      [1, 1.12, 1],
      Extrapolation.CLAMP
    );

    const flashScaleY = interpolate(
      liquidFlash.value,
      [0, 0.45, 1],
      [1, 0.96, 1],
      Extrapolation.CLAMP
    );

    const stretchX = interpolate(
      indicatorSquash.value,
      [0.982, 1, 1.075],
      [0.992, 1, 1.055],
      Extrapolation.CLAMP
    );

    const stretchY = interpolate(
      indicatorSquash.value,
      [0.982, 1, 1.075],
      [1.012, 1, 0.965],
      Extrapolation.CLAMP
    );

    return {
      transform: [
        { scaleX: flashScaleX * stretchX },
        { scaleY: flashScaleY * stretchY },
      ],
    };
  });

  const menuAnimatedStyle = useAnimatedStyle(() => {
    const p = menuProgress.value;
    const startX = activeMenuAnchorX - (menuLeft + MENU_WIDTH / 2);

    const stretchX = interpolate(
      menuSquash.value,
      [0.84, 0.982, 1, 1.075],
      [0.93, 0.992, 1, 1.032],
      Extrapolation.CLAMP
    );

    const stretchY = interpolate(
      menuSquash.value,
      [0.84, 0.982, 1, 1.075],
      [1.07, 1.012, 1, 0.982],
      Extrapolation.CLAMP
    );

    const baseScaleX = interpolate(
      p,
      [0, 0.36, 0.72, 1],
      [0.2, 1.032, 0.994, 1],
      Extrapolation.CLAMP
    );

    const baseScaleY = interpolate(
      p,
      [0, 0.42, 0.8, 1],
      [0.18, 0.95, 1.01, 1],
      Extrapolation.CLAMP
    );

    return {
      opacity: interpolate(p, [0, 0.22, 1], [0, 0.88, 1], Extrapolation.CLAMP),
      transform: [
        {
          translateX: interpolate(p, [0, 1], [startX, 0], Extrapolation.CLAMP),
        },
        {
          translateY: interpolate(
            p,
            [0, 0.55, 0.82, 1],
            [28, -3, 1, 0],
            Extrapolation.CLAMP
          ),
        },
        { scaleX: baseScaleX * stretchX },
        { scaleY: baseScaleY * stretchY },
      ],
    };
  });

  const menuContentAnimatedStyle = useAnimatedStyle(() => {
    const counterX = interpolate(
      menuSquash.value,
      [0.84, 0.982, 1, 1.075],
      [1.08, 1.01, 1, 0.97],
      Extrapolation.CLAMP
    );

    const counterY = interpolate(
      menuSquash.value,
      [0.84, 0.982, 1, 1.075],
      [0.94, 0.988, 1, 1.02],
      Extrapolation.CLAMP
    );

    return {
      opacity: menuContentReveal.value,
      transform: [
        {
          translateY: interpolate(menuContentReveal.value, [0, 1], [4, 0], Extrapolation.CLAMP),
        },
        { scaleX: counterX },
        { scaleY: counterY },
      ],
    };
  });

  const menuArrowStyle = useAnimatedStyle(() => {
    const p = menuProgress.value;

    return {
      opacity: interpolate(p, [0, 0.76, 1], [0, 0, 1], Extrapolation.CLAMP),
      transform: [
        { rotate: '45deg' },
        {
          scale: interpolate(p, [0, 1], [0.38, 1], Extrapolation.CLAMP),
        },
      ],
    };
  });

  return (
    <View style={styles.fullScreenContainer} pointerEvents="box-none">
      {!!visibleMenu && (
        <View style={[StyleSheet.absoluteFill, styles.backdropLayer]}>
          <BlurView
            intensity={10}
            tint="dark"
            blurMethod="dimezisBlurViewSdk31Plus"
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={styles.backdropBlurTint} />
          <Pressable
            style={[StyleSheet.absoluteFill, styles.backdropPressable]}
            onPress={closeMenus}
          />
        </View>
      )}

      {!!visibleMenu && (
        <Animated.View
          exiting={ZoomOut.duration(130)}
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
            <View pointerEvents="none" style={styles.menuBlurTint} />
            <Animated.View style={[styles.menuContent, menuContentAnimatedStyle]}>
              {visibleMenu === 'transactions' && (
                <>
                  <TouchableOpacity
                    activeOpacity={0.78}
                    style={styles.menuItem}
                    onPress={handleTransactionsPress}
                  >
                    <View style={styles.menuIconBubble}>
                      <WalletCards size={17} color={menuIconColor} strokeWidth={2.1} />
                    </View>

                    <View style={styles.menuTextBlock}>
                      <Text style={styles.menuText}>Transações</Text>
                      <Text style={styles.menuDescription}>Entradas, saídas e filtros</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.menuDivider} />

                  <TouchableOpacity
                    activeOpacity={0.78}
                    style={styles.menuItem}
                    onPress={handleInvoicesPress}
                  >
                    <View style={styles.menuIconBubble}>
                      <CreditCard size={17} color={menuIconColor} strokeWidth={2.1} />
                    </View>

                    <View style={styles.menuTextBlock}>
                      <Text style={styles.menuText}>Cartão de Crédito</Text>
                      <Text style={styles.menuDescription}>Faturas e lançamentos</Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}

              {visibleMenu === 'recurrence' && (
                <>
                  <TouchableOpacity
                    activeOpacity={0.78}
                    style={styles.menuItem}
                    onPress={handleSubscriptionsPress}
                  >
                    <View style={styles.menuIconBubble}>
                      <Repeat size={17} color={menuIconColor} strokeWidth={2.1} />
                    </View>

                    <View style={styles.menuTextBlock}>
                      <Text style={styles.menuText}>Assinaturas</Text>
                      <Text style={styles.menuDescription}>Pagamentos recorrentes</Text>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.menuDivider} />

                  <TouchableOpacity
                    activeOpacity={0.78}
                    style={styles.menuItem}
                    onPress={handleRemindersPress}
                  >
                    <View style={styles.menuIconBubble}>
                      <Bell size={17} color={menuIconColor} strokeWidth={2.1} />
                    </View>

                    <View style={styles.menuTextBlock}>
                      <Text style={styles.menuText}>Lembretes</Text>
                      <Text style={styles.menuDescription}>Alertas e vencimentos</Text>
                    </View>
                  </TouchableOpacity>
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
          tabBarAnimatedStyle,
          {
            bottom: 14 + Math.max(insets.bottom, 0),
          },
        ]}
      >
        <Animated.View
          style={[styles.tabBarInner, tabBarInnerAnimatedStyle]}
          onLayout={(event) => setTabBarWidth(event.nativeEvent.layout.width)}
        >
          {tabBarWidth > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[styles.indicatorLayer, indicatorLayerCounterStyle]}
            >
              <Animated.View style={[styles.indicatorWrapper, indicatorStyle]}>
                <Animated.View style={[styles.indicatorFill, indicatorInnerStyle]} />
              </Animated.View>
            </Animated.View>
          )}

          <Animated.View style={[styles.tabsSection, tabBarContentCounterStyle]}>
            {TABS.map((tab) => (
              <TabItem
                key={tab.key}
                Icon={tab.Icon}
                isActive={activeTab === tab.key}
                onPress={() => handlePress(tab.key)}
                onInteractionStart={startNavMorph}
                onInteractionEnd={endNavMorph}
              />
            ))}
          </Animated.View>
        </Animated.View>
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
      screenOptions={{ headerShown: false }}
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
    backgroundColor: '#0A0A0A',
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

  backdropBlurTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },

  backdropPressable: {},

  tabBarShadow: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 10,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.24,
    shadowRadius: 18,
  },

  tabBarInner: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: '#171717',
    borderWidth: 1,
    borderColor: '#242424',
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
    zIndex: 7,
    position: 'relative',
    paddingTop: 0,
  },


  iconContainer: {
    width: ACTIVE_PILL_WIDTH,
    height: ACTIVE_PILL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },

  tabIcon: {
    width: 25,
    height: 25,
  },

  indicatorLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: TAB_BAR_HEIGHT,
    zIndex: 4,
  },

  indicatorWrapper: {
    position: 'absolute',
    left: 0,
    top: (TAB_BAR_HEIGHT - ACTIVE_PILL_HEIGHT) / 2,
    height: ACTIVE_PILL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 4,
  },

  indicatorFill: {
    width: ACTIVE_PILL_WIDTH,
    height: ACTIVE_PILL_HEIGHT,
    borderRadius: ACTIVE_PILL_RADIUS,
    backgroundColor: 'rgba(217,119,87,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(217,119,87,0.34)',
    shadowColor: ACCENT_ORANGE,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.16,
    shadowRadius: 9,
    elevation: 2,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(23,23,23,0.72)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
  },

  menuBlurTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(18,18,18,0.66)',
    zIndex: 1,
  },

  menuContent: {
    paddingVertical: 2,
    paddingHorizontal: 0,
    zIndex: 2,
    backgroundColor: 'transparent',
  },

  menuItem: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 0,
  },

  menuIconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },

  menuIcon: {
    width: 21,
    height: 21,
  },

  menuTextBlock: {
    flex: 1,
  },

  menuText: {
    color: TEXT_DARK,
    fontSize: 12.5,
    fontWeight: '700',
    letterSpacing: 0,
  },

  menuDescription: {
    marginTop: 2,
    color: TEXT_MUTED,
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0,
  },

  menuDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 0,
    marginLeft: 0,
    marginRight: 0,
    backgroundColor: '#282828',
  },

  menuArrow: {
    width: 14,
    height: 14,
    marginTop: -7,
    backgroundColor: 'rgba(18,18,18,0.92)',
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    zIndex: 1,
  },
});
