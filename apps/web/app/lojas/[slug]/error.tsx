'use client';
// Falha ao carregar a vitrine (API fora do ar, limite de requisições): mensagem em linguagem do comprador e nova tentativa.
export default function StoreError({ reset }: { error: Error; reset: () => void }) {
  return <div className="surface-store"><main id="conteudo" className="store-wrap reading">
    <h1>Vitrine indisponível no momento</h1>
    <p>Não foi possível carregar esta página agora. Nenhum pedido foi alterado. Aguarde alguns segundos e tente de novo.</p>
    <p><button type="button" className="btn btn-primary" onClick={() => { reset(); location.reload(); }}>Tentar de novo</button></p>
  </main></div>;
}
