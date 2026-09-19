import type { Metadata } from 'next';
import { PRODUCT_FULL_NAME } from '@klawfin/core';
import './globals.css';
import { Nav } from './Nav';

export const metadata: Metadata = {
  title: PRODUCT_FULL_NAME,
  // The tool is unlisted and holds client financial data.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Nav />
        {children}
      </body>
    </html>
  );
}
