import type { Metadata } from 'next';
import './globals.css';
import './streak-tuning.css';

export const metadata: Metadata = {
  title: 'BeatForge',
  description: '5 lane web rhythm game prototype',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
