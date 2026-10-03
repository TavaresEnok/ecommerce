// Extensão local só para a revisão visual: aplica o MESMO zoom do navegador (Ctrl +/−) a todas as abas via
// chrome.tabs.setZoom. Carregada por navegador.mjs (launchZoom); nada é instalado no navegador do usuário.
self.zoomAll = async (fator) => { const abas = await chrome.tabs.query({}); for (const a of abas) await chrome.tabs.setZoom(a.id, fator); return abas.length; };
