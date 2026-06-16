import { Linking } from 'react-native';

const CANCELLATION_WHATSAPP_PHONE = '5511947595786';
const CANCELLATION_WHATSAPP_TEXT = 'Ola! Quero cancelar minha assinatura do Controlar+.';

export async function openCancellationWhatsApp(details: {
    email?: string | null;
    platform?: string | null;
} = {}): Promise<void> {
    const message = [
        CANCELLATION_WHATSAPP_TEXT,
        details.email ? `E-mail: ${details.email}` : null,
        details.platform ? `Origem: ${details.platform}` : null,
    ].filter(Boolean).join('\n');
    const encodedMessage = encodeURIComponent(message);
    const appUrl = `whatsapp://send?phone=${CANCELLATION_WHATSAPP_PHONE}&text=${encodedMessage}`;
    const webUrl = `https://wa.me/${CANCELLATION_WHATSAPP_PHONE}?text=${encodedMessage}`;

    try {
        await Linking.openURL(appUrl);
    } catch {
        await Linking.openURL(webUrl);
    }
}
