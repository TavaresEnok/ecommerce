'use client';
// Configurações por tarefa (DESIGN.md §5.1). Cada seção é um destino próprio, com URL estável e dados independentes.
import { use } from 'react';
import { notFound } from 'next/navigation';
import { DataSettings, DeliverySettings, DomainSettings, PlanSettings, SecuritySettings, StoreDataSettings } from '../../../../../components/panel/settings';

const SECTIONS: Record<string, () => React.ReactNode> = {
  loja: () => <StoreDataSettings />,
  entregas: () => <DeliverySettings />,
  dominio: () => <DomainSettings />,
  seguranca: () => <SecuritySettings />,
  plano: () => <PlanSettings />,
  dados: () => <DataSettings />,
};
export default function Settings({ params }: { params: Promise<{ secao: string }> }) {
  const { secao } = use(params), render = SECTIONS[secao];
  if (!render) notFound();
  return render();
}
