import { it } from 'vitest';
import { Document, Text, renderToBuffer } from '@react-pdf/renderer';
import { PDFParse } from 'pdf-parse';
import { scoreIntake } from '@klawfin/rubric';
import { completeIntake } from '@klawfin/core/tests/fixtures';
import { Body } from '../src/lib/pdf/ReportDocument.js';
import { buildReportProps } from '../src/lib/pdf/render.js';

async function dump(label: string, doc: any) {
  const buf = await renderToBuffer(doc);
  const p = new PDFParse({ data: new Uint8Array(buf) });
  const r = await p.getText();
  console.log(`[${label}] ` + r.pages.map(pg => `P${pg.num}:${pg.text.includes('Business assessment only')?'OK':'MISS'}`).join(' '));
  await p.destroy();
}

it('real Body in isolation', async () => {
  const score = scoreIntake(completeIntake);
  const props = buildReportProps({
    clientName: 'Havenlock', score, narrative: null,
    reportVersion: 1, generatedOn: '2026-09-19', isPreliminary: false, hasIncompleteWatermark: false,
  });
  await dump('W realBody', (
    <Document><Body {...props}><Text>hello</Text></Body></Document>
  ));
}, 60000);
