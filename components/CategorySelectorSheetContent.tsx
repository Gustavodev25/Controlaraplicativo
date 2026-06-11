import { CategoryGroup } from '@/constants/defaultCategories';
import { IosCoreLoader } from '@/components/ui/IosCoreLoader';
import { BlurView } from 'expo-blur';
import React, { useEffect, useState } from 'react';
import {
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CategorySelectorSheetContentProps {
    categories: CategoryGroup[];
    loading?: boolean;
    onSelect: (categoryKey: string) => void;
}

export function CategorySelectorSheetContent({
    categories,
    loading,
    onSelect,
}: CategorySelectorSheetContentProps) {
    const [search, setSearch] = useState('');

    useEffect(() => {
        setSearch('');
    }, [categories]);

    const normalizedSearch = search.trim().toLowerCase();
    const filteredCategories = categories.map(group => ({
        ...group,
        items: group.items.filter(item =>
            item.label.toLowerCase().includes(normalizedSearch) ||
            group.title.toLowerCase().includes(normalizedSearch)
        )
    })).filter(group => group.items.length > 0);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>
                    Mudar categoria
                </Text>
                <Text style={styles.subtitle}>
                    Escolha uma nova categoria para esta transação.
                </Text>
            </View>

            <View style={styles.searchBar}>
                <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Buscar categoria"
                    placeholderTextColor="#8E8E93"
                    autoCorrect={false}
                />
            </View>

            <Text style={styles.sectionTitle}>CATEGORIAS</Text>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {filteredCategories.length === 0 ? (
                    <View style={styles.groupCard}>
                        <View style={styles.emptyContainer}>
                            <Text style={styles.emptyText}>Nenhuma categoria encontrada</Text>
                        </View>
                    </View>
                ) : (
                    filteredCategories.map((group) => (
                        <View key={group.title} style={styles.groupContainer}>
                            <Text style={styles.groupTitle}>{group.title}</Text>
                            <View style={styles.groupCard}>
                                {group.items.map((item, index) => (
                                    <React.Fragment key={item.key}>
                                        <TouchableOpacity
                                            style={styles.categoryRow}
                                            activeOpacity={0.72}
                                            onPress={() => onSelect(item.key)}
                                            accessibilityRole="button"
                                        >
                                            <Text style={styles.categoryLabel} numberOfLines={1}>
                                                {item.label}
                                            </Text>
                                        </TouchableOpacity>
                                        {index < group.items.length - 1 && <View style={styles.divider} />}
                                    </React.Fragment>
                                ))}
                            </View>
                        </View>
                    ))
                )}
            </ScrollView>

            {loading && (
                <View style={styles.loadingOverlay}>
                    <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                    <IosCoreLoader fill={false} style={styles.loaderContainer} />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        maxHeight: SCREEN_HEIGHT * 0.74,
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 28,
        backgroundColor: '#111111',
    },
    header: {
        paddingVertical: 18,
    },
    title: {
        color: '#FFFFFF',
        fontSize: 18,
        fontFamily: 'AROneSans_600SemiBold',
    },
    subtitle: {
        color: '#8E8E93',
        fontSize: 13,
        fontFamily: 'AROneSans_400Regular',
        marginTop: 3,
    },
    searchBar: {
        backgroundColor: '#171717',
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#242424',
        height: 48,
        justifyContent: 'center',
        paddingHorizontal: 16,
        marginBottom: 24,
    },
    searchInput: {
        color: '#FFFFFF',
        fontSize: 15,
        fontFamily: 'AROneSans_400Regular',
        height: '100%',
        padding: 0,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '500',
        color: '#8E8E93',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    scrollView: {
        flexGrow: 0,
        maxHeight: SCREEN_HEIGHT * 0.44,
    },
    scrollContent: {
        paddingBottom: 20,
    },
    groupContainer: {
        marginBottom: 24,
    },
    groupTitle: {
        fontSize: 12,
        fontWeight: '500',
        color: '#8E8E93',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    groupCard: {
        backgroundColor: '#171717',
        borderRadius: 14,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#242424',
        overflow: 'hidden',
    },
    categoryRow: {
        minHeight: 48,
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    categoryLabel: {
        color: '#F4F1EF',
        fontSize: 15,
        fontFamily: 'AROneSans_400Regular',
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#282828',
    },
    emptyContainer: {
        paddingVertical: 24,
        paddingHorizontal: 16,
        alignItems: 'center',
    },
    emptyText: {
        color: '#606060',
        fontSize: 14,
        fontFamily: 'AROneSans_400Regular',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 22,
        overflow: 'hidden',
        zIndex: 999,
    },
    loaderContainer: {
        alignItems: 'center',
        backgroundColor: 'rgba(26, 26, 26, 0.8)',
        padding: 24,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#2A2A2A',
    },
});
