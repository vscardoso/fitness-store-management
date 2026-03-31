import { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, Alert } from 'react-native';
import { Text, TextInput, Button, ActivityIndicator } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import PageHeader from '@/components/layout/PageHeader';
import { Colors, theme, PRESET_THEMES } from '@/constants/Colors';
import { useBrandingStore } from '@/store/brandingStore';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

export default function BrandingScreen() {
  const router = useRouter();
  const { branding, applyPreset, uploadLogoToServer, saveToServer, fetchFromServer, setBranding } = useBrandingStore();

  const [name, setName] = useState(branding.name);
  const [tagline, setTagline] = useState(branding.tagline);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  useEffect(() => {
    fetchFromServer().catch(() => {});
  }, [fetchFromServer]);

  useEffect(() => {
    setName(branding.name);
    setTagline(branding.tagline);
  }, [branding.name, branding.tagline]);

  const handleApplyPreset = (preset: typeof PRESET_THEMES[number]) => {
    applyPreset(preset);
  };

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      try {
        setUploadingLogo(true);
        await uploadLogoToServer(result.assets[0].uri);
      } catch {
        Alert.alert('Erro', 'Não foi possível enviar o logo. Tente novamente.');
      } finally {
        setUploadingLogo(false);
      }
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Atenção', 'O nome da loja é obrigatório.');
      return;
    }
    try {
      setSaving(true);

      // Mantem o estado local atualizado para persistencia imediata.
      setBranding({
        name: name.trim(),
        tagline: tagline.trim(),
      });

      await saveToServer({
        name: name.trim(),
        tagline: tagline.trim() || undefined,
        primary_color: branding.primaryColor,
        secondary_color: branding.secondaryColor,
        accent_color: branding.accentColor,
      });
      setSuccessVisible(true);
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar. Verifique a conexão.');
    } finally {
      setSaving(false);
    }
  };

  const logoUri = branding.logoUri;

  return (
    <View style={styles.container}>
      <PageHeader
        title="Identidade da Loja"
        subtitle="Personalize cores e logo"
        showBackButton
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content}>

        {/* Logo */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Logo</Text>
          <TouchableOpacity style={styles.logoContainer} onPress={pickLogo} activeOpacity={0.8}
            disabled={uploadingLogo}>
            {uploadingLogo ? (
              <View style={[styles.logoPlaceholder, { backgroundColor: branding.primaryColor + '20' }]}>
                <ActivityIndicator color={branding.primaryColor} />
              </View>
            ) : logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logoImage} />
            ) : (
              <View style={[styles.logoPlaceholder, { backgroundColor: branding.primaryColor + '20' }]}>
                <Ionicons name="storefront-outline" size={40} color={branding.primaryColor} />
              </View>
            )}
            {!uploadingLogo && (
              <View style={styles.logoEditBadge}>
                <Ionicons name="camera" size={14} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Nome e slogan */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informações</Text>
          <TextInput
            label="Nome da loja *"
            value={name}
            onChangeText={setName}
            mode="outlined"
            style={styles.input}
          />
          <TextInput
            label="Slogan (opcional)"
            value={tagline}
            onChangeText={setTagline}
            mode="outlined"
            style={styles.input}
          />
        </View>

        {/* Paletas */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Paleta de Cores</Text>
          <View style={styles.presets}>
            {PRESET_THEMES.map((preset) => {
              const active = preset.primary === branding.primaryColor;
              return (
                <TouchableOpacity
                  key={preset.name}
                  style={[styles.preset, active && styles.presetActive]}
                    onPress={() => handleApplyPreset(preset)}
                  activeOpacity={0.8}
                >
                  <View style={styles.presetColors}>
                    <View style={[styles.presetDot, { backgroundColor: preset.primary }]} />
                    <View style={[styles.presetDot, { backgroundColor: preset.secondary }]} />
                    <View style={[styles.presetDot, { backgroundColor: preset.accent }]} />
                  </View>
                  <Text style={[styles.presetName, active && { color: branding.primaryColor }]}>
                    {preset.name}
                  </Text>
                  {active && (
                    <Ionicons name="checkmark-circle" size={16} color={branding.primaryColor} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Preview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preview</Text>
          <View style={[styles.preview, { backgroundColor: branding.primaryColor }]}>
            {logoUri
              ? <Image source={{ uri: logoUri }} style={styles.previewLogo} />
              : <Ionicons name="storefront-outline" size={28} color="#fff" />
            }
            <Text style={styles.previewName}>{name || 'Nome da loja'}</Text>
            <Text style={styles.previewTagline}>{tagline || 'Slogan aqui'}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Button mode="contained" onPress={handleSave} style={styles.saveBtn}
            buttonColor={branding.primaryColor} loading={saving} disabled={saving}>
            Salvar Identidade
          </Button>
        </View>
      </ScrollView>
      <ConfirmDialog
        visible={successVisible}
        title="Identidade Salva!"
        message="Cores e informações da loja foram atualizadas com sucesso."
        type="success"
        confirmText="Ok"
        cancelText=""
        icon="checkmark-circle"
        onConfirm={() => { setSuccessVisible(false); router.back(); }}
        onCancel={() => { setSuccessVisible(false); router.back(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.backgroundSecondary },
  content: { padding: theme.spacing.md, gap: theme.spacing.lg, paddingBottom: 40 },
  section: {
    backgroundColor: Colors.light.card,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    ...theme.shadows.sm,
  },
  sectionTitle: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  logoContainer: { alignSelf: 'center', position: 'relative' },
  logoImage: { width: 96, height: 96, borderRadius: theme.borderRadius.xl },
  logoPlaceholder: {
    width: 96, height: 96, borderRadius: theme.borderRadius.xl,
    alignItems: 'center', justifyContent: 'center',
  },
  logoEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.light.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  input: { backgroundColor: '#fff' },
  presets: { gap: theme.spacing.sm },
  preset: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    padding: theme.spacing.sm, borderRadius: theme.borderRadius.lg,
    borderWidth: 1.5, borderColor: Colors.light.border,
  },
  presetActive: { borderColor: Colors.light.primary, backgroundColor: Colors.light.primaryLight },
  presetColors: { flexDirection: 'row', gap: 4 },
  presetDot: { width: 14, height: 14, borderRadius: 7 },
  presetName: { flex: 1, fontSize: theme.fontSize.md, color: Colors.light.text },
  preview: {
    borderRadius: theme.borderRadius.lg, padding: theme.spacing.lg,
    alignItems: 'center', gap: theme.spacing.xs,
  },
  previewLogo: { width: 48, height: 48, borderRadius: theme.borderRadius.md },
  previewName: { fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold, color: '#fff' },
  previewTagline: { fontSize: theme.fontSize.sm, color: 'rgba(255,255,255,0.85)' },
  actions: { gap: theme.spacing.sm },
  saveBtn: { borderRadius: theme.borderRadius.lg },
});
