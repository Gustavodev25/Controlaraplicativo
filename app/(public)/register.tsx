import { useRouter, type Href } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Phone, ShieldCheck, User as UserIcon } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { KeyboardAvoidingViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { UniversalBackground } from '@/components/UniversalBackground';
import { AuthButton } from '@/components/ui/AuthButton';
import { AuthInput } from '@/components/ui/AuthInput';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { requestEmailVerificationCode } from '@/services/emailVerification';

const KEYBOARD_BEHAVIOR: KeyboardAvoidingViewProps['behavior'] = Platform.select({ ios: 'padding', android: 'height' });

export default function RegisterScreen() {
    const router = useRouter();
    const { signUp } = useAuthContext();
    const { showError, showToast } = useToast();

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isVerificationStep, setIsVerificationStep] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

    const handleRegister = useCallback(async () => {
        const trimmedName = name.trim();
        const trimmedPhone = phone.trim();
        const trimmedEmail = email.trim();

        if (!trimmedName || !trimmedPhone || !trimmedEmail || !password) {
            showError('Por favor, preencha todos os campos.');
            return;
        }

        const phoneDigits = trimmedPhone.replace(/\D/g, '');
        if (phoneDigits.length < 10) {
            showError('Informe um telefone valido com DDD.');
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
            const normalizedEmail = trimmedEmail.toLowerCase();
            const hasPendingVerification = isVerificationStep && verificationEmail === normalizedEmail;

            if (!hasPendingVerification) {
                const sendResult = await requestEmailVerificationCode({
                    email: trimmedEmail,
                    name: trimmedName,
                });

                if (!sendResult.success) {
                    showError(sendResult.error || 'Nao foi possivel enviar o codigo de verificacao.');
                    setIsLoading(false);
                    return;
                }

                setVerificationEmail(normalizedEmail);
                setVerificationCode('');
                setIsVerificationStep(true);
                showToast('Enviamos um codigo de verificacao para o seu e-mail.', 'success');
                setIsLoading(false);
                return;
            }

            const sanitizedCode = verificationCode.replace(/\D/g, '');
            if (sanitizedCode.length !== 6) {
                showError('Informe o codigo de 6 digitos enviado para o seu e-mail.');
                setIsLoading(false);
                return;
            }

            const result = await signUp(trimmedEmail, password, trimmedName, trimmedPhone, sanitizedCode);

            if (result.success) {
                showToast('E-mail verificado e conta criada com sucesso!', 'success');
                router.replace('/settings/plans?forced=true');
            } else {
                showError(result.error || 'Erro ao criar conta.');
                setIsLoading(false);
            }
        } catch {
            showError('Ocorreu um erro inesperado.');
            setIsLoading(false);
        }
    }, [name, phone, email, password, termsAccepted, isVerificationStep, verificationEmail, verificationCode, signUp, showError, showToast, router]);

    const goBack = () => router.back();
    const togglePasswordVisibility = () => setShowPassword(prev => !prev);
    const handleVerificationCodeChange = (value: string) => {
        setVerificationCode(value.replace(/\D/g, '').slice(0, 6));
    };
    const handleResendCode = useCallback(async () => {
        const trimmedName = name.trim();
        const trimmedEmail = email.trim();

        if (!trimmedName || !trimmedEmail) {
            showError('Informe nome e e-mail para reenviar o codigo.');
            return;
        }

        setIsLoading(true);
        try {
            const sendResult = await requestEmailVerificationCode({
                email: trimmedEmail,
                name: trimmedName,
            });

            if (!sendResult.success) {
                showError(sendResult.error || 'Nao foi possivel reenviar o codigo.');
                setIsLoading(false);
                return;
            }

            setVerificationEmail(trimmedEmail.toLowerCase());
            setVerificationCode('');
            setIsVerificationStep(true);
            showToast('Enviamos um novo codigo para o seu e-mail.', 'success');
            setIsLoading(false);
        } catch {
            showError('Ocorreu um erro ao reenviar o codigo.');
            setIsLoading(false);
        }
    }, [name, email, showError, showToast]);
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

                            <AuthInput
                                label="Nome Completo"
                                placeholder="Seu nome"
                                icon={UserIcon}
                                value={name}
                                onChangeText={setName}
                            />
                            <AuthInput
                                label="Telefone"
                                placeholder="(00) 00000-0000"
                                icon={Phone}
                                value={phone}
                                onChangeText={setPhone}
                                keyboardType="phone-pad"
                                textContentType="telephoneNumber"
                                autoComplete="tel"
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

                            {isVerificationStep && (
                                <View style={styles.verificationSection}>
                                    <Text style={styles.verificationHint}>
                                        Codigo enviado para {verificationEmail || email.trim()}. Confira sua caixa de entrada.
                                    </Text>
                                    <AuthInput
                                        label="Codigo de verificacao"
                                        placeholder="000000"
                                        icon={ShieldCheck}
                                        value={verificationCode}
                                        onChangeText={handleVerificationCodeChange}
                                        keyboardType="number-pad"
                                        textContentType="oneTimeCode"
                                        autoComplete="one-time-code"
                                        maxLength={6}
                                    />
                                    <TouchableOpacity
                                        onPress={handleResendCode}
                                        style={styles.resendCodeButton}
                                        disabled={isLoading}
                                    >
                                        <Text style={[styles.resendCodeText, isLoading && styles.disabledText]}>
                                            Reenviar codigo
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}

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
                                title={isVerificationStep && verificationEmail === email.trim().toLowerCase() ? 'Verificar e Criar Conta' : 'Enviar Codigo por E-mail'}
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
        paddingTop: Platform.OS === 'ios' ? 100 : 80,
        paddingBottom: 30,
    },
    titleSection: {
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    logoContainer: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    logo: {
        width: 44,
        height: 44,
        borderRadius: 12,
    },
    title: {
        fontSize: 26,
        fontWeight: '800',
        color: '#faf9f5',
        marginBottom: 4,
        textAlign: 'left',
        letterSpacing: -1,
    },
    subtitle: {
        fontSize: 14,
        color: '#9ca3af',
        fontWeight: '400',
        textAlign: 'left',
        lineHeight: 20,
        paddingRight: 20,
    },
    form: {
        width: '100%',
        gap: 8,
    },
    button: {
        marginTop: 4,
    },
    verificationSection: {
        gap: 8,
        marginTop: 2,
        marginBottom: 4,
    },
    verificationHint: {
        color: '#d1d5db',
        fontSize: 13,
        lineHeight: 18,
    },
    resendCodeButton: {
        alignSelf: 'flex-start',
        paddingVertical: 4,
    },
    resendCodeText: {
        color: '#d97757',
        fontSize: 13,
        fontWeight: '700',
    },
    disabledText: {
        opacity: 0.6,
    },
    loginLink: {
        marginTop: 12,
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
