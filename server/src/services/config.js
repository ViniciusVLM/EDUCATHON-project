/**
 * Configuração de Trust Proxy (Deploy atrás de proxy reverso como Render, Railway, etc.).
 * Quando a variável TRUST_PROXY estiver definida, configura no app Express:
 * - 'true' -> app.set('trust proxy', true)
 * - 'false' -> app.set('trust proxy', false)
 * - '1' (número de saltos) -> app.set('trust proxy', 1)
 * - string ('loopback', etc.) -> app.set('trust proxy', 'loopback')
 *
 * @param {import('express').Express} app Instância do Express
 * @param {string|number|boolean} [trustProxyEnv=process.env.TRUST_PROXY] Valor da variável TRUST_PROXY
 */
export function configureTrustProxy(app, trustProxyEnv = process.env.TRUST_PROXY) {
  if (trustProxyEnv === undefined || trustProxyEnv === null || trustProxyEnv === '') {
    return;
  }

  const str = String(trustProxyEnv).trim();
  if (str === 'false') {
    app.set('trust proxy', false);
    return;
  }

  if (str === 'true') {
    app.set('trust proxy', true);
    return;
  }

  const num = Number(str);
  if (!Number.isNaN(num)) {
    app.set('trust proxy', num);
    return;
  }

  app.set('trust proxy', str);
}
