// Rótulos e tons de estado (DESIGN.md §8.2). Os códigos internos continuam os da API; só a apresentação é traduzida.
export type Tone = 'success' | 'warning' | 'danger' | 'neutral';
type Map = Record<string, readonly [string, Tone]>;
export const ORDER_STATUS: Map = { OPEN: ['Aberto', 'neutral'], COMPLETED: ['Concluído', 'success'], CANCELLED: ['Cancelado', 'neutral'] };
export const PAYMENT_STATUS: Map = { UNPAID: ['Não pago', 'neutral'], PENDING: ['Aguardando confirmação', 'warning'], PAID: ['Pago', 'success'], PARTIALLY_REFUNDED: ['Parcialmente devolvido', 'warning'], REFUNDED: ['Devolvido', 'neutral'], CHARGED_BACK: ['Contestado', 'danger'] };
export const FULFILLMENT_STATUS: Map = { UNFULFILLED: ['Não enviado', 'neutral'], PROCESSING: ['Em separação', 'neutral'], SHIPPED: ['Enviado', 'neutral'], DELIVERED: ['Entregue', 'success'], RETURNED: ['Devolvido à loja', 'neutral'] };
export const DISPUTE_STATUS: Map = { NONE: ['Sem disputa', 'neutral'], OPEN: ['Disputa aberta', 'danger'], WON: ['Disputa vencida', 'success'], LOST: ['Disputa perdida', 'danger'] };
export const ATTEMPT_STATUS: Map = { PREPARED: ['Preparada', 'neutral'], PENDING: ['Aguardando', 'warning'], APPROVED: ['Aprovada', 'success'], REJECTED: ['Recusada', 'neutral'], CANCELLED: ['Cancelada', 'neutral'], EXPIRED: ['Expirada', 'neutral'], UNKNOWN: ['Resultado em verificação', 'warning'] };
export const TRANSACTION_CLASS: Map = { PRINCIPAL: ['Principal', 'success'], EXCESS: ['Excedente', 'danger'], INCOMPATIBLE: ['Divergente', 'danger'] };
export const PRODUCT_STATUS: Map = { DRAFT: ['Rascunho', 'neutral'], ACTIVE: ['Ativo', 'success'], ARCHIVED: ['Arquivado', 'neutral'] };
export const MEDIA_STATUS: Map = { UPLOADING: ['Enviando', 'warning'], PENDING: ['Processando', 'warning'], READY: ['Pronta', 'success'], FAILED: ['Falhou', 'danger'], DELETED: ['Removida', 'neutral'] };
export const LIFECYCLE: Map = { DRAFT: ['Rascunho', 'neutral'], ACTIVE: ['Ativa', 'success'], SUSPENDED: ['Suspensa', 'danger'] };
export const SUBSCRIPTION: Map = { TRIAL: ['Em teste', 'neutral'], ACTIVE: ['Ativa', 'success'], PAST_DUE: ['Em atraso', 'warning'], SUSPENDED: ['Suspensa', 'danger'], CANCELLED: ['Cancelada', 'neutral'] };
export const INVOICE: Map = { OPEN: ['Em aberto', 'warning'], PAID: ['Paga', 'success'], VOID: ['Anulada', 'neutral'], UNCOLLECTIBLE: ['Não cobrável', 'danger'] };
export const PLAN_STATUS: Map = { DRAFT: ['Rascunho', 'neutral'], ACTIVE: ['Ativo', 'success'], RETIRED: ['Aposentado', 'neutral'] };
export const DOMAIN: Map = { PENDING_VERIFICATION: ['Aguardando verificação', 'warning'], PENDING_TLS: ['Aguardando certificado', 'warning'], ACTIVE: ['Ativo', 'success'], FAILED: ['Falhou', 'danger'], DISABLED: ['Desativado', 'neutral'] };
export const SUPPORT_STATUS: Map = { OPEN: ['Aberto', 'neutral'], IN_PROGRESS: ['Em atendimento', 'neutral'], RESOLVED: ['Concluído', 'success'] };
export const NOTIFICATION: Map = { PENDING: ['Pendente', 'warning'], HELD: ['Retida', 'warning'], SENT: ['Enviada', 'success'], SIMULATED: ['Simulada (sem envio externo)', 'neutral'], FAILED: ['Falhou', 'danger'] };
export const ACCOUNT_STATUS: Map = { CONNECTED: ['Conectada', 'success'], REVOKED: ['Revogada', 'neutral'] };
export const GENERATION: Map = { RESERVED: ['Gerando', 'warning'], SUCCEEDED: ['Rascunho pronto', 'success'], FAILED: ['Falhou', 'danger'], UNKNOWN: ['Resultado em verificação', 'warning'], RELEASED: ['Encerrada', 'neutral'], SAVED: ['Salvo no produto', 'success'], DISCARDED: ['Descartado', 'neutral'] };
export const label = (map: Map, value: string) => map[value]?.[0] ?? value;
export const tone = (map: Map, value: string): Tone => map[value]?.[1] ?? 'neutral';

export const SUPPORT_KIND: Record<string, string> = { SUPPORT: 'Atendimento', WITHDRAWAL: 'Arrependimento', CANCELLATION: 'Cancelamento', DATA_ACCESS: 'Acesso a dados', DATA_ERASURE: 'Eliminação de dados', CONTACT: 'Contato geral' };
export const PAYMENT_METHOD: Record<string, string> = { PIX: 'Pix', CARD: 'Cartão' };
export const NOTIFICATION_TEMPLATE: Record<string, string> = { ORDER_RECEIVED: 'Pedido recebido', PAYMENT_CONFIRMED: 'Pagamento confirmado', SHIPPED: 'Pedido enviado', DELIVERED: 'Pedido entregue', READY_FOR_PICKUP: 'Pronto para retirada', ORDER_CANCELLED: 'Pedido cancelado', REQUEST_RECEIVED: 'Solicitação recebida', REQUEST_RESOLVED: 'Solicitação concluída', SUPPORT_REPLY: 'Resposta do atendimento', CONTACT: 'Contato recebido' };
export const HISTORY_EVENT: Record<string, string> = { CHECKOUT_CREATED: 'Pedido criado', PAYMENT_ATTEMPT_CREATED: 'Nova tentativa de pagamento', PAYMENT_RECEIVED: 'Pagamento recebido', PAYMENT_CONFIRMED: 'Pagamento confirmado', PAYMENT_RECOVERED: 'Pagamento recuperado', PAYMENT_UNCERTAIN: 'Pagamento incerto', PAYMENT_NOT_FOUND: 'Pagamento não encontrado no provedor', PAYMENT_QUARANTINED: 'Notificação em quarentena', PAYMENT_VALUE_MISMATCH: 'Valor recebido divergente', PAYMENT_ACCOUNT: 'Conta de pagamento', STOCK_UNAVAILABLE: 'Estoque indisponível', STOCK_REALLOCATED: 'Estoque realocado', FULFILLMENT_PROCESSING: 'Separação iniciada', ORDER_SHIPPED: 'Pedido enviado', ORDER_DELIVERED: 'Entrega confirmada', ORDER_RETURNED: 'Devolução física registrada', ORDER_CANCELLED: 'Pedido cancelado', ORDER_RECEIVED: 'Pedido recebido', REFUND_ACTION_REQUIRED: 'Devolução pendente', REFUND_REQUESTED: 'Devolução solicitada', REFUND_CONFIRMED: 'Devolução confirmada', REFUND_FAILED: 'Devolução falhou', REFUND_UNCERTAIN: 'Devolução incerta', REFUND_VALUE_MISMATCH: 'Devolução divergente', DISPUTE_UPDATED: 'Disputa atualizada', DISPUTE_WON: 'Disputa vencida', DISPUTE_LOST: 'Disputa perdida', INCIDENT_ANNOTATED: 'Referência anotada', INCIDENT_REVIEWED: 'Revisão concluída', ADDRESS_CORRECTED: 'Endereço corrigido', FISCAL_REFERENCE: 'Documento fiscal registrado', ACCESS_LINKS_REVOKED: 'Links de acompanhamento revogados' };

// Incidentes: título curto, próxima ação e se envolve valor a devolver. O código interno fica disponível como detalhe.
export const INCIDENT: Record<string, { title: string; next: string; financial: boolean; review?: boolean }> = {
  EXCESS_PAYMENT: { title: 'Pagamento recebido a mais', next: 'Devolva o valor excedente pelo painel do Mercado Pago.', financial: true },
  REFUND_ACTION_REQUIRED: { title: 'Devolução pendente', next: 'Devolva o valor pelo painel do Mercado Pago.', financial: true },
  PAYMENT_VALUE_MISMATCH: { title: 'Valor recebido diferente do pedido', next: 'Confira o recebimento e devolva o valor indevido pelo Mercado Pago.', financial: true },
  REFUND_VALUE_MISMATCH: { title: 'Devolução com valor divergente', next: 'Confira a devolução no Mercado Pago.', financial: true },
  PAID_WITHOUT_STOCK: { title: 'Pago sem estoque', next: 'Recomponha o estoque e realoque, ou devolva o valor pelo Mercado Pago.', financial: true },
  PAYMENT_UNCERTAIN: { title: 'Pagamento incerto', next: 'Atualize a situação do pagamento; não cobre de novo.', financial: false },
  PARTIAL_REFUND_REVIEW: { title: 'Devolução parcial a revisar', next: 'Confira o que ainda deve ser entregue e registre a conclusão.', financial: false, review: true },
  GATEWAY_IDENTITY_MISMATCH: { title: 'Conta do meio de pagamento divergente', next: 'Revise a conta conectada e registre a conclusão.', financial: false, review: true },
  GATEWAY_UNAVAILABLE: { title: 'Meio de pagamento indisponível', next: 'Atualize a situação mais tarde e registre a conclusão.', financial: false, review: true },
  REFUND_FAILED: { title: 'Devolução falhou', next: 'Verifique o saldo no Mercado Pago e tente a devolução por lá.', financial: true },
};
export const incident = (code: string) => INCIDENT[code] ?? { title: 'Pendência operacional', next: 'Revise o pedido.', financial: false };

// Alertas operacionais (operations/status e platform/alerts): título legível; o código continua disponível como detalhe.
export const ALERT_TITLE: Record<string, string> = { FINANCIAL_INCIDENT_OPEN: 'Pendência financeira aberta', PAYMENT_UNCERTAIN: 'Pagamento sem resultado conclusivo', FINANCIAL_COMMUNICATION_PENDING: 'Comunicação ao meio de pagamento pendente', SUPPORT_OVERDUE: 'Protocolos com prazo vencido', NOTIFICATION_BACKLOG: 'E-mails pendentes há mais de 15 minutos', NOTIFICATION_FAILED: 'E-mails que falharam', OUTBOX_BACKLOG: 'Eventos internos atrasados', OUTBOX_FAILED: 'Eventos internos com falha', INBOX_BACKLOG: 'Notificações do meio de pagamento não processadas' };
// Textos do servidor (ex.: motivos de bloqueio) podem citar códigos internos; a apresentação troca pelo título do incidente.
export const humanize = (text: string) => text.replace(/\b[A-Z][A-Z_]{5,}\b/g, (code) => (INCIDENT[code] ? `“${INCIDENT[code]!.title}”` : code));
export const INTERVAL: Record<string, string> = { MONTH: 'mensal', YEAR: 'anual', NONE: 'sem cobrança' };
