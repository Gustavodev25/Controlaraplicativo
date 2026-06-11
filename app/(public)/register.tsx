import { useRouter, type Href } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, Info, Lock, Mail, User as UserIcon } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { KeyboardAvoidingViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { UniversalBackground } from '@/components/UniversalBackground';
import { AuthButton } from '@/components/ui/AuthButton';
import { AuthInput } from '@/components/ui/AuthInput';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const KEYBOARD_BEHAVIOR: KeyboardAvoidingViewProps['behavior'] = Platform.select({ ios: 'padding', android: 'height' });

export default function RegisterScreen() {
    const router = useRouter();
    const { signUp } = useAuthContext();
    const { showError, showToast } = useToast();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleRegister = useCallback(async () => {
        if (!name || !email || !password) {
            showError('Por favor, preencha todos os campos.');
            return;
        }

        if (password.length < 6) {
            showError('A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        if (!termsAccepted) {
            showError('Você precisa aceitar os Termos de Uso para continuar.');
            return;
        }

        setIsLoading(true);
        try {
            const result = await signUp(email, password, name);

            if (result.success) {
                showToast('Conta Controlar+ criada. Use Apple Sandbox só na compra da App Store.', 'success');
                router.replace('/settings/plans?forced=true');
            } else {
                showError(result.error || 'Erro ao criar conta.');
                setIsLoading(false);
            }
        } catch {
            showError('Ocorreu um erro inesperado.');
            setIsLoading(false);
        }
    }, [name, email, password, termsAccepted, signUp, showError, showToast, router]);

    const goBack = () => router.back();
    const togglePasswordVisibility = () => setShowPassword(prev => !prev);
    const handleOpenTerms = useCallback(() => {
        router.push('/settings/legal/terms' as Href);
    }, [router]);

    return (
        <UniversalBackground>
            <KeyboardAvoidingView
                behavior={KEYBOARD_BEHAVIOR}
                style={styles.keyboardView}
                keyboardVerticalOffset={0}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                >
                    {/* Header - Minimalist */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={goBack} style={styles.backButton}>
                            <ArrowLeft size={24} color="#faf9f5" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.centerContainer}>
                        <View style={styles.titleSection}>
                            <View style={styles.logoContainer}>
                                <Image
                                    source={require('@/assets/images/icon.png')}
                                    style={styles.logo}
                                    resizeMode="contain"
                                />
                            </View>
                            <ThemedText type="title" style={styles.title}>Comece sua jornada</ThemedText>
                            <ThemedText style={styles.subtitle}>Crie sua conta e assuma o controle total das suas finanças.</ThemedText>
                        </View>

                        <View style={styles.form}>
                            {Platform.OS === 'ios' ? (
                                <View style={styles.credentialNotice}>
                                    <View style={styles.credentialNoticeIcon}>
                                        <Info size={18} color="#d97757" />
                                    </View>
                                    <View style={styles.credentialNoticeCopy}>
                                        <Text style={styles.credentialNoticeTitle}>Crie sua conta Controlar+</Text>
                                        <Text style={styles.credentialNoticeText}>
                                            Este cadastro é para entrar no app. Não use Apple Sandbox aqui; ela só aparece quando a App Store abrir a compra do plano.
                                        </Text>
                                    </View>
                                </View>
                            ) : null}

                            <AuthInput
                                label="Nome Completo"
                                placeholder="Seu nome"
                                icon={UserIcon}
                                value={name}
                                onChangeText={setName}
                            />
                            <AuthInput
                                label="E-mail"
                                placeholder="seu@email.com"
                                icon={Mail}
                                value={email}
                                onChangeText={setEmail}
                                autoCapitalize="none"
                                keyboardType="email-address"
                            />
                            <AuthInput
                                label="Senha"
                                placeholder="Mínimo 6 caracteres"
                                icon={Lock}
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPassword}
                                rightIcon={
                                    <TouchableOpacity onPress={togglePasswordVisibility}>
                                        {showPassword ? <EyeOff size={20} color="#9ca3af" /> : <Eye size={20} color="#9ca3af" />}
                                    </TouchableOpacity>
                                }
                            />

                            <View style={styles.termsRow}>
                                <TouchableOpacity
                                    onPress={() => setTermsAccepted(prev => !prev)}
                                    activeOpacity={0.7}
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked: termsAccepted }}
                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                <View style={[styles.checkbox, termsAccepted && styles.checkboxChecked]}>
                                    {termsAccepted && <Text style={styles.checkmark}>✓</Text>}
                                </View>
                                </TouchableOpacity>
                                <Text style={styles.termsText}>
                                    Eu li e concordo com os{' '}
                                    <Text
                                        style={styles.termsLink}
                                        onPress={handleOpenTerms}
                                        accessibilityRole="link"
                                    >
                                        Termos de Uso
                                    </Text>
                                </Text>
                            </View>

                            <AuthButton
                                title="Continuar para o Plano"
                                onPress={handleRegister}
                                isLoading={isLoading}
                                style={styles.button}
                            />

                            <TouchableOpacity onPress={goBack} style={styles.loginLink}>
                                <Text style={styles.loginLinkText}>Já tem uma conta? <Text style={styles.loginLinkHighlight}>Entrar</Text></Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </UniversalBackground>
    );
}

const styles = StyleSheet.create({
    keyboardView: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    header: {
        paddingTop: Platform.OS === 'ios' ? 60 : 50,
        paddingHorizontal: 24,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 10
    },
    backButton: { width: 44, height: 44, justifyContent: 'center' },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        paddingHorizontal: 32,
        paddingVertical: 100,
    },
    titleSection: {
        alignItems: 'flex-start',
        marginBottom: 40,
    },
    logoContainer: {
        width: 56,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    logo: {
        width: 56,
        height: 56,
        borderRadius: 14,
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: '#faf9f5',
        marginBottom: 10,
        textAlign: 'left',
        letterSpacing: -1,
    },
    subtitle: {
        fontSize: 16,
        color: '#9ca3af',
        fontWeight: '400',
        textAlign: 'left',
        lineHeight: 24,
        paddingRight: 20,
    },
    form: {
        width: '100%',
        gap: 16,
    },
    credentialNotice: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(217, 119, 87, 0.1)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(217, 119, 87, 0.35)',
    },
    credentialNoticeIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(217, 119, 87, 0.14)',
    },
    credentialNoticeCopy: {
        flex: 1,
    },
    credentialNoticeTitle: {
        fontSize: 13,
        color: '#faf9f5',
        fontWeight: '700',
        marginBottom: 4,
    },
    credentialNoticeText: {
        fontSize: 12,
        color: '#d1d5db',
        lineHeight: 17,
    },
    button: {
        marginTop: 12,
    },
    loginLink: {
        marginTop: 24,
        alignItems: 'flex-start',
    },
    loginLinkText: {
        fontSize: 14,
        color: '#9ca3af',
    },
    loginLinkHighlight: {
        color: '#d97757',
        fontWeight: 'bold'
    },
    termsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginVertical: 4
    },
    checkbox: {
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: '#4b5563',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxChecked: {
        backgroundColor: '#d97757',
        borderColor: '#d97757',
    },
    checkmark: { fontSize: 10, color: '#fff', fontWeight: 'bold' },
    termsText: { fontSize: 13, color: '#9ca3af' },
    termsLink: { color: '#d97757', fontWeight: '600' },
});
