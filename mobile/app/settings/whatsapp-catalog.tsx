/**
 * Catálogo do WhatsApp e do Instagram: a loja liga um link (feed) e a Meta lê os produtos publicados sozinha.
 * Só entram produtos publicados e com foto; nome de marca nunca vai no catálogo. Só o administrador altera.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

import PageHeader from '@/components/layout/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Colors } from '@/constants/Colors';
import { useBrandingColors } from '@/store/brandingStore';
import {
  CatalogFeedStatus, disableCatalogFeed, getCatalogFeed, getWhatsappCatalogStatus, rotateCatalogFeed,
  setWhatsappCatalogVisible, WhatsappCatalogStatus,
} from '@/services/whatsappService';
import { parseApiError } from '@/utils/apiError';

type Confirm = null | 'rotate' | 'disable';

export default function WhatsappCatalogScreen() {
  const router = useRouter();
  const brand = useBrandingColors();
  const [st, setSt] = useState<CatalogFeedStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [wa, setWa] = useState<WhatsappCatalogStatus | null>(null);
  const [waError, setWaError] = useState('');
  const [waBusy, setWaBusy] = useState(false);

  // pergunta à Meta como está o catálogo no número (sem adivinhar por que a lojinha não aparece)
  const checkWhatsapp = useCallback(() => {
    setWaBusy(true);
    setWaError('');
    getWhatsappCatalogStatus()
      .then(setWa)
      .catch((e) => setWaError(parseApiError(e) || 'Não consegui consultar o WhatsApp.'))
      .finally(() => setWaBusy(false));
  }, []);
  useEffect(checkWhatsapp, [checkWhatsapp]);

  const showOnWhatsapp = () => {
    setWaBusy(true);
    setWaError('');
    setWhatsappCatalogVisible(true)
      .then(setWa)
      .catch((e) => setWaError(parseApiError(e) || 'Não consegui ligar o catálogo no WhatsApp.'))
      .finally(() => setWaBusy(false));
  };

  const load = useCallback(() => {
    getCatalogFeed()
      .then(setSt)
      .catch((e) => setError(parseApiError(e) || 'Não foi possível carregar.'));
  }, []);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<CatalogFeedStatus>, ok: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setSt(await fn());
      setMessage(ok);
    } catch (e: any) {
      setError(parseApiError(e) || 'Não foi possível concluir.');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  // navigator.clipboard falha em página sem permissão ou sem gesto do usuário; o plano B é copiar por um campo escondido
  const copyWeb = async (url: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      /* cai no plano B */
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  };

  const copy = async () => {
    if (!st?.url) return;
    setCopyFailed(false);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      if (await copyWeb(st.url)) {
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } else {
        setCopyFailed(true);
      }
      return;
    }
    try {
      await Share.share({ message: st.url });
    } catch {
      setCopyFailed(true);
    }
  };

  const noPhoto = st?.missing_photo_products ?? [];

  return (
    <View style={styles.container}>
      <PageHeader title="Catálogo do WhatsApp" subtitle="Também vale para o Instagram" showBackButton onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!message && <Text style={[styles.ok, { color: brand.primary }]}>{message}</Text>}
        <View style={styles.card}>
          <Text style={styles.title}>O que vai para o catálogo</Text>
          <Text style={styles.note}>
            Os produtos publicados que têm foto, com nome, descrição e preço do cadastro. Produto sem foto fica de fora, porque a Meta
            recusa. Nome de marca é retirado do título e da descrição, e o catálogo sai com o nome da sua loja.
          </Text>
          {st && (
            <View style={styles.stats}>
              <Stat label="Publicados" value={String(st.published_products)} />
              <Stat label="No catálogo" value={String(st.items)} />
              <Stat label="Sem foto" value={String(st.skipped_no_photo)} warn={st.skipped_no_photo > 0} />
            </View>
          )}
          {!!st && st.brand_removed > 0 && (
            <Text style={styles.note}>Nome de marca retirado em {st.brand_removed} item(ns). Confira os títulos no catálogo.</Text>
          )}
          {!!st && (st.skipped_no_price > 0 || st.skipped_no_name > 0 || st.products_no_variants > 0) && (
            <Text style={styles.warn}>
              Também ficaram de fora: {st.skipped_no_price} sem preço, {st.skipped_no_name} sem nome e {st.products_no_variants} produto(s) sem
              variação.
            </Text>
          )}
        </View>

        {noPhoto.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.title}>Publicados sem foto</Text>
            <Text style={styles.note}>Adicione a foto no produto para ele entrar no catálogo.</Text>
            {noPhoto.map((p) => (
              <Text key={p.id} style={styles.listItem}>• {p.name}</Text>
            ))}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.title}>Link do catálogo</Text>
          {st?.enabled && st.url ? (
            <>
              <Text selectable style={styles.url}>{st.url}</Text>
              <View style={styles.actions}>
                <Button mode="contained" buttonColor={copied ? '#16A34A' : brand.primary} icon={copied ? 'check' : 'content-copy'} onPress={copy} disabled={busy}>
                  {copied ? 'Link copiado' : 'Copiar link'}
                </Button>
                <Button mode="outlined" onPress={() => setConfirm('rotate')} disabled={busy}>Gerar outro link</Button>
                <Button mode="text" textColor={Colors.light.error} onPress={() => setConfirm('disable')} disabled={busy}>Desligar</Button>
              </View>
              {copied && <Text style={[styles.ok, { color: '#16A34A' }]}>Link copiado. Cole na Meta, no feed de dados do catálogo.</Text>}
              {copyFailed && <Text style={styles.error}>Não consegui copiar sozinho. Toque no link acima, selecione tudo e copie.</Text>}
            </>
          ) : (
            <>
              <Text style={styles.note}>O catálogo está desligado. Ligue para gerar o link que a Meta vai ler.</Text>
              <Button mode="contained" buttonColor={brand.primary} style={styles.single} loading={busy} disabled={busy || !st}
                onPress={() => run(rotateCatalogFeed, 'Catálogo ligado. Copie o link e siga o passo a passo.')}>
                Ligar o catálogo
              </Button>
            </>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Situação no WhatsApp</Text>
          <Text style={styles.note}>O que a Meta informa agora sobre o catálogo no número {wa?.phone || 'da loja'}.</Text>
          {!!waError && <Text style={styles.warn}>{waError}</Text>}
          {wa && (
            <>
              <StatusLine
                ok={wa.catalog_visible}
                label="Catálogo visível para as clientes"
                hint={wa.catalog_visible === false ? 'Desligado: a lojinha não aparece na conversa nem no perfil.' : undefined}
              />
              <StatusLine ok={wa.cart_enabled === false ? true : wa.cart_enabled === null ? null : false}
                label={wa.cart_enabled ? 'Carrinho ligado (a caixa do Provador ainda não lê pedidos)' : 'Carrinho desligado'} />
              {/* lista vazia SEM erro = o acesso do Provador (token sem permissão de catálogos) não enxerga; não é prova de que
                  falta o catálogo: o Gerenciador do WhatsApp é quem mostra a ligação */}
              <StatusLine
                ok={wa.catalogs.length > 0 ? true : null}
                label={wa.catalogs.length > 0
                  ? `Catálogo ligado à conta: ${wa.catalogs.map((c) => c.name || c.id).join(', ')}`
                  : 'Catálogo ligado: não confirmado pelo Provador'}
                hint={wa.catalogs.length > 0 ? undefined
                  : 'O acesso do Provador à Meta não tem permissão para listar catálogos. Confira a ligação no Gerenciador do WhatsApp, em Ferramentas da conta, Catálogo.'}
              />
              {wa.account && (
                <StatusLine
                  ok={wa.account.has_number}
                  label={`Conta consultada: ${wa.account.name || 'sem nome'} (${wa.account.id})`}
                  hint={wa.account.has_number === false
                    ? 'O número da loja não pertence a esta conta: o Provador está olhando a conta errada.'
                    : wa.account.has_number === null ? 'A Meta não respondeu se o número é desta conta.' : undefined}
                />
              )}
              {wa.problems.map((p) => <Text key={p} style={styles.warn}>{p}</Text>)}
              {wa.catalog_visible === false && (
                <Button mode="contained" buttonColor={brand.primary} style={styles.single} loading={waBusy} disabled={waBusy}
                  onPress={showOnWhatsapp}>
                  Mostrar o catálogo no WhatsApp
                </Button>
              )}
            </>
          )}
          <Button mode="outlined" style={styles.single} loading={waBusy && !wa} disabled={waBusy} onPress={checkWhatsapp}>
            Verificar de novo
          </Button>
          <Text style={styles.note}>
            Tudo certo aqui e a lojinha ainda não aparece? A Meta revisa os produtos antes de mostrar (pode levar até 24 horas).
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Passo a passo na Meta</Text>
          <Text style={styles.step}>1. No Gerenciador de Comércio da Meta, crie um catálogo de produtos online.</Text>
          <Text style={styles.step}>2. Adicione produtos por arquivo de dados, use o URL acima e deixe a leitura a cada hora, moeda BRL.</Text>
          <Text style={styles.step}>3. No Gerenciador do WhatsApp, abra Ferramentas da conta, Catálogo, escolha esse catálogo e conecte ao número.</Text>
          <Text style={styles.step}>4. Ligue "Mostrar ícone do catálogo" e deixe o carrinho desligado.</Text>
          <Text style={styles.note}>Depois disso, publicar ou despublicar um produto aqui muda o catálogo sozinho em até 1 hora. Cada produto vai uma vez só, com as cores e os tamanhos que têm peça escritos na descrição.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Conectar o Instagram ao perfil do WhatsApp</Text>
          <Text style={styles.step}>1. No app WhatsApp Business, abra Ferramentas.</Text>
          <Text style={styles.step}>2. Toque em Conectar no cartão "Conecte o Instagram".</Text>
          <Text style={styles.step}>3. Entre na conta do Instagram da loja e autorize.</Text>
          <Text style={styles.note}>Esse passo é feito à mão por quem tem a senha do Instagram, uma vez por loja.</Text>
        </View>

      </ScrollView>

      <ConfirmDialog
        visible={confirm === 'rotate'}
        title="Gerar outro link?"
        message="O link atual para de funcionar. Cole o novo link no catálogo da Meta, senão ele deixa de atualizar."
        confirmText="Gerar outro"
        type="warning"
        loading={busy}
        onConfirm={() => run(rotateCatalogFeed, 'Novo link gerado. Atualize o catálogo na Meta.')}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        visible={confirm === 'disable'}
        title="Desligar o catálogo?"
        message="A Meta não consegue mais ler os produtos. O que já está no catálogo continua lá até você apagar na Meta."
        confirmText="Desligar"
        type="warning"
        loading={busy}
        onConfirm={() => run(disableCatalogFeed, 'Catálogo desligado.')}
        onCancel={() => setConfirm(null)}
      />
    </View>
  );
}

function StatusLine({ ok, label, hint }: { ok: boolean | null; label: string; hint?: string }) {
  const icon = ok === null ? 'help-circle-outline' : ok ? 'checkmark-circle' : 'close-circle';
  const color = ok === null ? Colors.light.textTertiary : ok ? Colors.light.success : Colors.light.error;
  return (
    <View style={styles.statusLine}>
      <Ionicons name={icon} size={18} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={styles.statusText}>{label}</Text>
        {!!hint && <Text style={styles.note}>{hint}</Text>}
      </View>
    </View>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, warn && { color: Colors.light.error }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  content: { padding: 16, paddingBottom: 48 },
  card: { backgroundColor: Colors.light.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.light.border },
  title: { fontSize: 16, fontWeight: '700', color: Colors.light.text },
  note: { fontSize: 13, lineHeight: 19, color: Colors.light.textSecondary, marginTop: 6 },
  warn: { fontSize: 13, lineHeight: 19, color: Colors.light.error, marginTop: 8 },
  step: { fontSize: 14, lineHeight: 21, color: Colors.light.text, marginTop: 8 },
  listItem: { fontSize: 14, color: Colors.light.text, marginTop: 6 },
  url: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 8, backgroundColor: Colors.light.background, padding: 10, borderRadius: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  single: { marginTop: 12, alignSelf: 'flex-start' },   // botão do tamanho do texto, não da largura do cartão
  stats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stat: { flex: 1, backgroundColor: Colors.light.background, borderRadius: 12, padding: 10, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700', color: Colors.light.text },
  statLabel: { fontSize: 12, color: Colors.light.textSecondary, marginTop: 2 },
  error: { color: Colors.light.error, marginTop: 6, marginBottom: 6 },
  statusLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  statusText: { fontSize: 14, color: Colors.light.text, fontWeight: '600' },
  ok: { marginTop: 6, marginBottom: 6, fontWeight: '600' },
});
