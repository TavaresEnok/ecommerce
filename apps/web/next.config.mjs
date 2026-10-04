// Prévia do rascunho (/preview/…) pode ser exibida em quadro só pelo próprio painel (mesma origem), para o editor de
// aparência mostrar a loja ao vivo; todas as outras rotas continuam proibidas em quadros.
const common = [
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Cache-Control', value: 'no-store' }
];
export default {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${process.env.API_INTERNAL_URL || 'http://localhost:3001'}/:path*` }];
  },
  async headers() {
    return [
      { source: '/((?!preview/).*)', headers: [...common, { key: 'X-Frame-Options', value: 'DENY' }] },
      { source: '/preview/:path*', headers: [...common, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" }] }
    ];
  }
};
