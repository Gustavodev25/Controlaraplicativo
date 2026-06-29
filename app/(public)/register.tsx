import { useRouter, type Href } from 'expo-router';
import { ArrowLeft, Eye, EyeOff, Lock, Mail, Phone, User as UserIcon } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import type { KeyboardAvoidingViewProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import { UniversalBackground } from '@/components/UniversalBackground';
import { AuthButton } from '@/components/ui/AuthButton';
import { AuthInput } from '@/components/ui/AuthInput';
import { useAuthContext } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { requestEmailVerificationCode } from '@/services/emailVerification';

const KEYBOARD_BEHAVIOR: KeyboardAvoidingViewProps['behavior'] = Platform.select({ ios: 'padding', android: 'height' });
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60;

type LoadingAction = 'idle' | 'send' | 'verify' | 'resend';

function toPositiveSeconds(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : fallback;
}

function formatCountdown(totalSeconds: number) {
    const safeSeconds = Math.max(0, Math.ceil(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;

    if (minutes <= 0) return `${seconds}s`;
    if (seconds === 0) return `${minutes}m`;

    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export default function RegisterScreen() {
    const router = useRouter();
    const { signUp } = useAuthContext();
    const { showError, showToast } = useToast();
    const otpInputRef = useRef<TextInput>(null);

    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [loadingAction, setLoadingAction] = useState<LoadingAction>('idle');
    const [isVerificationStep, setIsVerificationStep] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');
    const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
    const [isOtpFocused, setIsOtpFocused] = useState(false);
    const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
    const [codeExpiresInSeconds, setCodeExpiresInSeconds] = useState<number | null>(null);

    const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
    const isBusy = loadingAction !== 'idle';
    const isSubmitLoading = loadingAction === 'send' || loadingAction === 'verify';
    const isResending = loadingAction === 'resend';
    const verificationEmailMatches = isVerificationStep && verificationEmail === normalizedEmail;
    const resendCodeLabel = isResending
        ? 'Reenviando...'
        : resendCooldownSeconds > 0
            ? `Reenviar codigo em ${formatCountdown(resendCooldownSeconds)}`
            : 'Reenviar codigo';
    const verificationExpiryText = codeExpiresInSeconds === 0
        ? 'O codigo expirou. Reenvie para receber um novo.'
        : codeExpiresInSeconds
            ? `O codigo expira em ${formatCountdown(codeExpiresInSeconds)}.`
            : 'Confira sua caixa de entrada.';
    const submitButtonTitle = verificationEmailMatches ? 'Verificar e criar conta' : 'Enviar codigo por e-mail';

    useEffect(() => {
        if (resendCooldownSeconds <= 0) return;

        const timeoutId = setTimeout(() => {
            setResendCooldownSeconds(seconds => Math.max(seconds - 1, 0));
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [resendCooldownSeconds]);

    useEffect(() => {
        if (codeExpiresInSeconds === null || codeExpiresInSeconds <= 0) return;

        const timeoutId = setTimeout(() => {
            setCodeExpiresInSeconds(seconds => (
                seconds === null ? null : Math.max(seconds - 1, 0)
            ));
        }, 1000);

        return () => clearTimeout(timeoutId);
    }, [codeExpiresInSeconds]);

    useEffect(() => {
        if (!isVerificationStep) return;

        const timeoutId = setTimeout(() => {
            otpInputRef.current?.focus();
        }, 250);

        return () => clearTimeout(timeoutId);
    }, [isVerificationStep]);

    const focusOtpInput = useCallback(() => {
        otpInputRef.current?.focus();
    }, []);

    const startVerificationStep = useCallback((
        targetEmail: string,
        options?: { resendAfterSeconds?: number; expiresInSeconds?: number; remainingSeconds?: number },
    ) => {
        setVerificationEmail(targetEmail);
        setVerificationCode('');
        setIsVerificationStep(true);
        setResendCooldownSeconds(
            toPositiveSeconds(options?.resendAfterSeconds ?? options?.remainingSeconds, DEFAULT_RESEND_COOLDOWN_SECONDS)
        );
        setCodeExpiresInSeconds(toPositiveSeconds(options?.expiresInSeconds, 0) || null);
    }, []);

    const handleRegister = useCallback(async () => {
        const trimmedName = name.trim();
        const trimmedPhone = phone.trim();
        const trimmedEmail = email.trim();
        const currentNormalizedEmail = trimmedEmail.toLowerCase();

        if (!trimmedName || !trimmedPhone || !trimmedEmail || !password) {
            showError('Por favor, preencha todos os campos.');
            return;
        }

        if (!EMAIL_PATTERN.test(currentNormalizedEmail)) {
            showError('Informe um e-mail valido.');
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

        const hasPendingVerification = isVerificationStep && verificationEmail === currentNormalizedEmail;
        const sanitizedCode = verificationCode.replace(/\D/g, '');

        if (hasPendingVerification && codeExpiresInSeconds === 0) {
            showError('O codigo expirou. Reenvie para receber um novo.');
            return;
        }

        if (hasPendingVerification && sanitizedCode.length !== 6) {
            showError('Informe o codigo de 6 digitos enviado para o seu e-mail.');
            return;
        }

        setLoadingAction(hasPendingVerification ? 'verify' : 'send');
        try {
            if (!hasPendingVerification) {
                const sendResult = await requestEmailVerificationCode({
                    email: trimmedEmail,
                    name: trimmedName,
                });

                if (!sendResult.success) {
                    showError(sendResult.error || 'Nao foi possivel enviar o codigo de verificacao.');
                    if (sendResult.remainingSeconds) {
                        setResendCooldownSeconds(toPositiveSeconds(sendResult.remainingSeconds));
                    }
                    return;
                }

                startVerificationStep(currentNormalizedEmail, sendResult);
                showToast('Enviamos um codigo de verificacao para o seu e-mail.', 'success');
                return;
            }

            const result = await signUp(trimmedEmail, password, trimmedName, trimmedPhone, sanitizedCode);

            if (result.success) {
                showToast('E-mail verificado e conta criada com sucesso!', 'success');
                router.replace('/settings/plans?forced=true');
            } else {
                showError(result.error || 'Erro ao criar conta.');
                if (/expirado|nao solicitado|novo codigo/i.test(result.error || '')) {
                    setCodeExpiresInSeconds(0);
                }
            }
        } catch {
            showError('Ocorreu um erro inesperado.');
        } finally {
            setLoadingAction('idle');
        }
    }, [name, phone, email, password, termsAccepted, isVerificationStep, verificationEmail, verificationCode, codeExpiresInSeconds, signUp, showError, showToast, router, startVerificationStep]);

    const goBack = () => router.back();
    const togglePasswordVisibility = () => setShowPassword(prev => !prev);
    const handleVerificationCodeChange = (value: string) => {
        setVerificationCode(value.replace(/\D/g, '').slice(0, 6));
    };
    const handleResendCode = useCallback(async () => {
        if (isBusy || resendCooldownSeconds > 0) return;

        const trimmedName = name.trim();
        const trimmedEmail = email.trim();
        const currentNormalizedEmail = trimmedEmail.toLowerCase();

        if (!trimmedName || !trimmedEmail) {
            showError('Informe nome e e-mail para reenviar o codigo.');
            return;
        }

        if (!EMAIL_PATTERN.test(currentNormalizedEmail)) {
            showError('Informe um e-mail valido para reenviar o codigo.');
            return;
        }

        setLoadingAction('resend');
        try {
            const sendResult = await requestEmailVerificationCode({
                email: trimmedEmail,
                name: trimmedName,
            });

            if (!sendResult.success) {
                showError(sendResult.error || 'Nao foi possivel reenviar o codigo.');
                if (sendResult.remainingSeconds) {
                    setResendCooldownSeconds(toPositiveSeconds(sendResult.remainingSeconds));
                }
                return;
            }

            startVerificationStep(currentNormalizedEmail, sendResult);
            showToast('Enviamos um novo codigo para o seu e-mail.', 'success');
        } catch {
            showError('Ocorreu um erro ao reenviar o codigo.');
        } finally {
            setLoadingAction('idle');
        }
    }, [isBusy, resendCooldownSeconds, name, email, showError, showToast, startVerificationStep]);
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
                            <ThemedText type="title" style={styles.title}>
                                {isVerificationStep ? 'Verifique seu e-mail' : 'Comece sua jornada'}
                            </ThemedText>
                            <ThemedText style={styles.subtitle}>
                                {isVerificationStep ? 'Insira o código numérico enviado para confirmar.' : 'Crie sua conta e assuma o controle total das suas finanças.'}
                            </ThemedText>
                        </View>
                        <View style={styles.form}>
                            {!isVerificationStep ? (
                                <>
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
                                </>
                            ) : (
                                <View style={styles.verificationSection}>
                                    <Text style={styles.verificationHint}>
                                        Codigo enviado para {verificationEmail || normalizedEmail}.{'\n'}{verificationExpiryText}
                                    </Text>

                                    <View style={styles.otpWrapper}>
                                        <Text style={styles.otpLabel}>Codigo de verificacao</Text>
                                        <TouchableOpacity
                                            activeOpacity={1}
                                            onPress={focusOtpInput}
                                            style={styles.otpContainer}
                                            accessibilityRole="button"
                                            accessibilityLabel="Codigo de verificacao de 6 digitos"
                                            accessibilityValue={{ text: `${verificationCode.length} de 6 digitos preenchidos` }}
                                        >
                                            {Array(6).fill(0).map((_, index) => (
                                                <View 
                                                    key={index} 
                                                    style={[
                                                        styles.otpCell, 
                                                        (verificationCode.length === index || (verificationCode.length === 6 && index === 5)) && isOtpFocused ? styles.otpCellFocused : null
                                                    ]}
                                                >
                                                    <Text style={styles.otpText}>{verificationCode[index] || ''}</Text>
                                                </View>
                                            ))}
                                            <TextInput
                                                ref={otpInputRef}
                                                value={verificationCode}
                                                onChangeText={handleVerificationCodeChange}
                                                maxLength={6}
                                                keyboardType="number-pad"
                                                textContentType="oneTimeCode"
                                                autoComplete="one-time-code"
                                                style={styles.hiddenOtpInput}
                                                editable={!isBusy}
                                                caretHidden
                                                returnKeyType="done"
                                                onFocus={() => setIsOtpFocused(true)}
                                                onBlur={() => setIsOtpFocused(false)}
                                                selectionColor="transparent"
                                            />
                                        </TouchableOpacity>
                                    </View>

                                    <TouchableOpacity
                                        onPress={handleResendCode}
                                        style={styles.resendCodeButton}
                                        disabled={isBusy || resendCooldownSeconds > 0}
                                    >
                                        <Text style={[styles.resendCodeText, (isBusy || resendCooldownSeconds > 0) && styles.disabledText]}>
                                            {resendCodeLabel}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            <AuthButton
                                title={submitButtonTitle}
                                onPress={handleRegister}
                                isLoading={isSubmitLoading}
                                disabled={isResending}
                                style={styles.button}
                            />

                            {!isVerificationStep && (
                                <TouchableOpacity onPress={goBack} style={styles.loginLink}>
                                    <Text style={styles.loginLinkText}>Já tem uma conta? <Text style={styles.loginLinkHighlight}>Entrar</Text></Text>
                                </TouchableOpacity>
                            )}
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
    otpWrapper: {
        marginTop: 12,
        marginBottom: 8,
    },
    otpLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#faf9f5',
        marginBottom: 8,
        paddingLeft: 2,
    },
    otpContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        position: 'relative',
    },
    otpCell: {
        width: 45,
        height: 52,
        backgroundColor: '#1C1C1E',
        borderWidth: 1,
        borderColor: '#2C2C2E',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    otpCellFocused: {
        borderColor: '#d97757',
        backgroundColor: '#242426',
    },
    otpText: {
        color: '#faf9f5',
        fontSize: 20,
        fontWeight: '700',
    },
    hiddenOtpInput: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: 0,
        color: 'transparent',
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
