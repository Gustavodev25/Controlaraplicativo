import { UniversalBackground } from '@/components/UniversalBackground';
import { ThemedText } from '@/components/themed-text';
import { useAuthContext } from '@/contexts/AuthContext';
import { useBiometricAuth } from '@/hooks/use-biometric-auth';

import { useRouter } from 'expo-router';
import { CircleCheck } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, LogBox, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// Ignore specific warnings related to Expo Go limitations
LogBox.ignoreLogs([
    'expo-notifications: Android Push notifications',
    'expo-notifications functionality is not fully supported in Expo Go'
]);

export default function Index() {
    const router = useRouter();
    const { isAuthenticated: isFirebaseAuth, isLoading: isAuthLoading, signOut, user } = useAuthContext();

    // Passa o userId para vincular biometria à conta específica
    const {
        isLoading: isBiometricLoading,
        isAuthenticated: isBiometricAuth,
        isBiometricAvailable,
        authenticate,
        biometricType,
        isBiometricEnabled,
        error,
    } = useBiometricAuth(user?.uid);

    const [isAnimComplete, setIsAnimComplete] = useState(false);

    useEffect(() => {
        // Wait until auth state is determined
        if (isAuthLoading || isBiometricLoading) return;

        // User is not logged in, go to welcome screen
        if (!isFirebaseAuth) {
            router.replace('/(public)/welcome');
            return;
        }

        // Se biometria está disponível E HABILITADA
        if (isBiometricAvailable && isBiometricEnabled) {
            // Se ainda não autenticou, espera
            if (!isBiometricAuth) return;
            // Se autenticou mas a animação não acabou, espera
            if (!isAnimComplete) return;
        }

        // Tudo ok, vai pro dashboard
        router.replace('/(tabs)/dashboard');
    }, [
        isAuthLoading,
        isBiometricLoading,
        isFirebaseAuth,
        isBiometricAvailable,
        isBiometricAuth,
        isBiometricEnabled,
        isAnimComplete,
    ]);

    const fadeAnim = useRef(new Animated.Value(0)).current; // 0 = loading, 1 = success

    const SUCCESS_ICON_SIZE = 80;

    // Loader: some com escala reduzindo + rotação
    const loaderOpacity = fadeAnim.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' });
    const loaderScale = fadeAnim.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0.3], extrapolate: 'clamp' });
    const loaderRotate = fadeAnim.interpolate({ inputRange: [0, 0.6], outputRange: ['0deg', '90deg'], extrapolate: 'clamp' });

    // Ícone de sucesso: aparece com escala crescendo.
    const successOpacity = fadeAnim.interpolate({ inputRange: [0.3, 0.8], outputRange: [0, 1], extrapolate: 'clamp' });
    const successScale = fadeAnim.interpolate({ inputRange: [0.3, 0.8], outputRange: [0.5, 1], extrapolate: 'clamp' });

    const readyToFinish = useRef(false);

    const SUCCESS_HOLD_MS = 700;
    const CROSSFADE_DURATION_MS = 400;

    useEffect(() => {
        if (isBiometricAuth) {
            readyToFinish.current = false;

            // Inicia o cross-fade do loader para o ícone de sucesso.
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: CROSSFADE_DURATION_MS,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();

            const finishTimer = setTimeout(() => {
                readyToFinish.current = true;
                setIsAnimComplete(true);
            }, CROSSFADE_DURATION_MS + SUCCESS_HOLD_MS);

            const safetyTimeout = setTimeout(() => {
                if (!readyToFinish.current) {
                    setIsAnimComplete(true);
                }
            }, 6000);

            return () => {
                clearTimeout(finishTimer);
                clearTimeout(safetyTimeout);
            };
        }
    }, [isBiometricAuth]);

    if (isAuthLoading || isBiometricLoading) {
        return <View style={{ flex: 1, backgroundColor: '#000000' }} />;
    }

    // Mantém a tela de biometria visível enquanto biometria está habilitada
    // (inclui: aguardando auth, mostrando animação, E aguardando navegação)
    if (isFirebaseAuth && isBiometricAvailable && isBiometricEnabled) {
        return (
            <UniversalBackground
                backgroundColor="#0C0C0C"
                glowSize={350}
                showParticles={true}
                particleCount={15}
            >
                <View style={styles.centeredContainer}>
                    <View style={styles.unlockContainer}>
                        <View style={styles.logoContainerSplash}>
                            <Image
                                source={require('@/assets/images/icon.png')}
                                style={styles.logoSplash}
                                resizeMode="contain"
                            />
                            <ThemedText type="title" style={styles.titleSplash}>Controlar</ThemedText>
                            <ThemedText style={styles.subtitleSplash}>Gerencie suas finanças com simplicidade e elegância.</ThemedText>
                        </View>
                        <View style={[styles.iconContainer, { width: SUCCESS_ICON_SIZE, height: SUCCESS_ICON_SIZE }]}>
                            {/* Loader - some com rotação e escala */}
                            <Animated.View style={{
                                position: 'absolute',
                                opacity: error ? 0 : loaderOpacity,
                                transform: [
                                    { scale: loaderScale },
                                    { rotate: loaderRotate },
                                ],
                            }}>
                                <ActivityIndicator size="large" color="#F5F5F7" style={{ transform: [{ scale: 1.5 }] }} />
                            </Animated.View>

                            {/* Ícone de sucesso - mesmo tamanho, aparece com escala */}
                            <Animated.View style={{
                                position: 'absolute',
                                opacity: successOpacity,
                                transform: [{ scale: successScale }],
                            }}>
                                <CircleCheck size={58} color="#04D361" strokeWidth={2.2} />
                            </Animated.View>
                        </View>

                        {(!isBiometricAuth && !isAnimComplete) && (
                            <View style={{ alignItems: 'center', marginTop: 16, width: '100%' }}>
                                {error && (
                                    <Text style={{ color: '#FF4C4C', marginBottom: 16, fontFamily: 'AROneSans_400Regular', textAlign: 'center' }}>
                                        {error}
                                    </Text>
                                )}
                                <TouchableOpacity
                                    onPress={() => authenticate()}
                                    style={{
                                        height: 52,
                                        paddingHorizontal: 32,
                                        backgroundColor: 'rgba(217, 119, 87, 0.15)',
                                        borderRadius: 14,
                                        borderWidth: 1,
                                        borderColor: 'rgba(217, 119, 87, 0.3)',
                                        width: '100%',
                                        maxWidth: 220,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <Text style={{ color: '#d97757', fontFamily: 'AROneSans_400Regular', fontSize: 16, letterSpacing: -0.2 }}>
                                        {error ? 'Tentar novamente' : 'Desbloquear'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
            </UniversalBackground>
        );
    }

    return (
        <UniversalBackground
            backgroundColor="#0C0C0C"
            glowSize={350}
            showParticles={true}
            particleCount={15}
        >
            <View style={styles.centeredContainer}>
                <ActivityIndicator size="large" color="#F5F5F7" style={{ transform: [{ scale: 1.5 }] }} />
            </View>
        </UniversalBackground>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a18',
        justifyContent: 'center',
        alignItems: 'center',
    },
    centeredContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    unlockContainer: {
        alignItems: 'flex-start',
        paddingHorizontal: 40,
        width: '100%',
    },
    logoContainerSplash: {
        marginBottom: 24,
        alignItems: 'flex-start',
    },
    logoSplash: {
        width: 56,
        height: 56,
        borderRadius: 14,
        marginBottom: 20,
    },
    titleSplash: {
        fontSize: 32,
        color: '#faf9f5',
        fontFamily: 'AROneSans_400Regular',
        marginBottom: 10,
        letterSpacing: -1,
        textAlign: 'left',
    },
    subtitleSplash: {
        fontSize: 16,
        color: '#9ca3af',
        marginBottom: 40,
        fontWeight: '400',
        textAlign: 'left',
        lineHeight: 24,
        paddingRight: 20,
    },
    iconContainer: {
        marginBottom: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontSize: 24,
        fontFamily: 'AROneSans_400Regular',
        color: '#E1E1E0',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#A0A090',
        marginBottom: 32,
        textAlign: 'center',
    },
    button: {
        backgroundColor: '#d97757',
        paddingVertical: 16,
        paddingHorizontal: 32,
        borderRadius: 12,
        width: '100%',
        maxWidth: 280,
        alignItems: 'center',
        marginBottom: 16,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontFamily: 'AROneSans_400Regular',
    },
    secondaryButton: {
        paddingVertical: 12,
        paddingHorizontal: 32,
        width: '100%',
        maxWidth: 280,
        alignItems: 'center',
    },
    secondaryButtonText: {
        color: '#A0A090',
        fontSize: 14,
        fontFamily: 'AROneSans_400Regular',
    },
});
