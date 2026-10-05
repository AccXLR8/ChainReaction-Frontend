import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Reactor — Chain Reaction Arena',
  description: 'Join the arena and play Chain Reaction in real time.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
