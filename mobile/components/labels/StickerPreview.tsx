/**
 * Prévia do adesivo do verso da tag, em escala real (mm), com o mesmo desenho do PDF do servidor
 * (`label_pdf_service.py`): nome | cor e tamanho | preço | QR e código. Só o que a cliente pode ver.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

export interface StickerPreviewData {
  name: string;
  color?: string | null;
  size?: string | null;
  price?: number | null;
  code?: string | null; // '#101-1'
  qr?: string | null; // 'PV#101-1'
}

const ZONES = [15, 13, 11, 21]; // mesma proporção do PDF (soma 60)
const PT = 25.4 / 72; // 1 pt em mm
const INK = '#111111';

function brl(value?: number | null): string {
  if (value == null || Number.isNaN(Number(value))) return 'Consulte';
  return 'R$ ' + Number(value).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export default function StickerPreview({
  data,
  widthMm,
  heightMm,
  pxPerMm,
}: {
  data: StickerPreviewData;
  widthMm: number;
  heightMm: number;
  pxPerMm: number;
}) {
  const s = pxPerMm;
  const unit = heightMm / ZONES.reduce((a, b) => a + b, 0);
  const zone = ZONES.map((z) => z * unit * s);
  const pad = 3 * s;
  const fs = (pt: number) => pt * PT * s;
  const qrSize = Math.min(17, ZONES[3] * unit - 2) * s;
  const size = (data.size || 'U').toUpperCase();
  const box = 8.5 * s;

  return (
    <View
      accessibilityLabel={`Prévia do adesivo ${widthMm} por ${heightMm} milímetros`}
      style={[styles.sheet, { width: widthMm * s, height: heightMm * s }]}
    >
      <View style={[styles.zone, { height: zone[0], paddingHorizontal: pad }]}>
        <Text numberOfLines={2} style={[styles.bold, { fontSize: fs(10.2), lineHeight: fs(11.4), textAlign: 'center' }]}>
          {data.name}
        </Text>
      </View>

      <View style={[styles.zone, styles.rule, { height: zone[1], marginHorizontal: pad, flexDirection: 'row', alignItems: 'center' }]}>
        <View style={{ flex: 1, paddingRight: 2 * s }}>
          <Text style={[styles.bold, { fontSize: fs(5.4) }]}>COR</Text>
          <Text numberOfLines={1} style={[styles.bold, { fontSize: fs(9) }]}>
            {data.color || 'Única'}
          </Text>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.bold, { fontSize: fs(5.4) }]}>TAM</Text>
          <View style={[styles.sizeBox, { width: box, height: box, borderRadius: 1.6 * s, borderWidth: Math.max(1, 0.4 * s) }]}>
            <Text style={[styles.bold, { fontSize: fs(size.length > 2 ? 10 : 14.7) }]}>{size}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.zone, styles.rule, { height: zone[2], marginHorizontal: pad, alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={[styles.bold, { fontSize: fs(18) }]}>{brl(data.price)}</Text>
      </View>

      <View style={[styles.zone, styles.rule, { height: zone[3], marginHorizontal: pad, flexDirection: 'row', alignItems: 'center' }]}>
        <View style={{ width: qrSize, height: qrSize }}>
          {data.qr ? <QRCode value={data.qr} size={qrSize} color={INK} backgroundColor="#fff" ecl="M" quietZone={0} /> : null}
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={[styles.bold, { fontSize: fs(5.4) }]}>CÓDIGO</Text>
          <Text numberOfLines={1} style={[styles.bold, { fontSize: fs(19.8) }]}>
            {data.code || '#----'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d4d4d8',
    borderRadius: 3,
    overflow: 'hidden',
  },
  zone: { justifyContent: 'center' },
  rule: { borderTopWidth: 1, borderTopColor: INK },
  bold: { color: INK, fontWeight: '800' },
  sizeBox: { borderColor: INK, alignItems: 'center', justifyContent: 'center' },
});
