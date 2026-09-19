import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';

import { PRODUCT_FULL_NAME } from '@klawfin/core';
import './globals.css';
import { Nav } from './Nav';

/**
 * Two typefaces, each with one job.
 *
 * Inter carries the interface: it is unremarkable at small sizes, which is
 * what an intake form of ninety fields needs.
 *
 * Fraunces carries the score and the page titles. A serif on the composite is
 * the whole reason this reads as an assessment rather than a dashboard - the
 * number is a judgement being presented, not a metric being monitored.
 *
 * `display: swap` so a slow font never blocks the score from appearing.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  axes: ['SOFT', 'WONK'],
});

export const metadata: Metadata = {
  title: PRODUCT_FULL_NAME,
  // The tool is unlisted and holds client financial data.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen font-sans">
        <Nav />
        {children}
      </body>
    </html>
  );
}
