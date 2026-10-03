import type { Metadata } from 'next';
import './style.css';
export const metadata: Metadata = { title: 'Plataforma', description: 'Plataforma de comércio para lojistas (nome provisório)', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <html lang="pt-BR"><body>{children}</body></html>; }
