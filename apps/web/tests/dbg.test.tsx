import { it } from 'vitest';
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { PDFParse } from 'pdf-parse';
import { styles } from '../src/lib/pdf/theme.js';

async function dump(label: string, doc: any) {
  const buf = await renderToBuffer(doc);
  const p = new PDFParse({ data: new Uint8Array(buf) });
  const r = await p.getText();
  console.log(`[${label}] "${r.text.replace(/\s+/g,' ').slice(0,110)}"`);
  await p.destroy();
}

it('page-number variants', async () => {
  // AA: fixed Text with render, sibling of the footer View (not nested inside)
  await dump('AA sibling-fixed-render', (
    <Document><Page size="A4" style={styles.page} wrap>
      <Text>b</Text>
      <View style={styles.footer} fixed><Text style={styles.micro}>FOOT</Text></View>
      <Text style={{ position:'absolute', bottom: 14, right: 52, fontSize: 7.5 }} fixed
            render={({ pageNumber, totalPages }: any) => `Page ${pageNumber} of ${totalPages}`} />
    </Page></Document>
  ));

  // BB: render on the fixed VIEW, returning JSX
  await dump('BB view-render', (
    <Document><Page size="A4" style={styles.page} wrap>
      <Text>b</Text>
      <View style={styles.footer} fixed render={({ pageNumber, totalPages }: any) => (
        <View><Text style={styles.micro}>FOOT</Text><Text style={styles.micro}>{`Page ${pageNumber} of ${totalPages}`}</Text></View>
      )} />
    </Page></Document>
  ));

  // CC: footer View fixed, page number as a plain fixed Text child WITHOUT render
  await dump('CC no-render-at-all', (
    <Document><Page size="A4" style={styles.page} wrap>
      <Text>b</Text>
      <View style={styles.footer} fixed>
        <Text style={styles.micro}>FOOT</Text>
        <Text style={styles.micro}>STATIC</Text>
      </View>
    </Page></Document>
  ));
}, 60000);
