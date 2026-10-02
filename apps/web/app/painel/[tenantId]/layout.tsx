'use client';
import { use, type ReactNode } from 'react';
import { PanelShell } from '../../../components/panel/Shell';
// Casca comum às rotas /painel/[tenantId]/… (convenção do App Router; não cria URL nova).
export default function PanelLayout({ children, params }: { children: ReactNode; params: Promise<{ tenantId: string }> }) {
  const { tenantId } = use(params);
  return <PanelShell key={tenantId} tenantId={tenantId}>{children}</PanelShell>;
}
