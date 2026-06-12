import { Stack } from 'expo-router';
import React from 'react';

export default function SettingsLayout() {
    return (
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="subscription" />
            <Stack.Screen name="financial" />
            <Stack.Screen name="plans" />
            <Stack.Screen name="personal-data" />
            <Stack.Screen name="categories" />
            <Stack.Screen name="legal" />
        </Stack>
    );
}
