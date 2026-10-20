/**
 * Planos e uso de IA (/planos).
 * Mostra a cota do mês, os planos, o checkout SIMULADO e a chave própria do Gemini.
 * Protótipo: nenhuma cobrança real acontece e nenhum dado de cartão é enviado ao servidor.
 */
import React, { useEffect, useRef, useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  getBilling,
  simulateCheckout,
  cancelPlan,
  saveGeminiKey,
  removeGeminiKey,
} from '../services/api';
import type { BillingInfo, PlanInfo } from '../types';
import { Window } from '../components/ui/Window';
import { Button } from '../components/ui/Button';
import { Stamp } from '../components/ui/Stamp';
import { ProgressBar } from '../components/ui/ProgressBar';
import { IconAlertCircle, IconCheckCircle, IconSparkles } from '../components/ui/Icons';

function formatPrice(cents: number) {
  if (cents === 0) return 'Grátis';
  return `${(cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês`;
}

function formatDate(value: string | null) {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

/** QR Code de mentira, só para ilustrar o Pix no protótipo. */
function FakePixQr() {
  const size = 21;
  const cells: React.ReactElement[] = [];
  let seed = 7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (seed * 9301 + 49297) % 233280;
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      const ring = finder && ((x % 14 === 0 || x % 14 === 6 || y % 14 === 0 || y % 14 === 6) || ((x % 14) >= 2 && (x % 14) <= 4 && (y % 14) >= 2 && (y % 14) <= 4));
      const on = finder ? ring : seed / 233280 > 0.55;
      if (on) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
    }
  }
  return (
    <svg className="pix-qr" viewBox={`-1 -1 ${size + 2} ${size + 2}`} role="img" aria-label="QR Code ilustrativo do Pix (simulado)">
      <rect x="-1" y="-1" width={size + 2} height={size + 2} fill="#FFFFFD" />
      <g fill="#1C1714">{cells}</g>
    </svg>
  );
}

function CheckoutDialog({
  plan,
  onClose,
  onPaid,
}: {
  plan: PlanInfo;
  onClose: () => void;
  onPaid: (message: string) => void;
}) {
  const [method, setMethod] = useState<'pix' | 'cartao'>('pix');
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const firstButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstButton.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handlePay(e: FormEvent) {
    e.preventDefault();
    setPaying(true);
    setError('');
    try {
      const res = await simulateCheckout(plan.id, method);
      onPaid(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir.');
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="checkout-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="checkout" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <Window fileName="pagamento-simulado.txt" tone="orange" barExtra={<Stamp tone="info">Protótipo</Stamp>}>
          <h2 id="checkout-title" className="checkout__title">Assinar {plan.name}</h2>
          <p className="checkout__price">{formatPrice(plan.priceCents)} · {plan.monthlyQuota.toLocaleString('pt-BR')} gerações de IA por mês</p>
          <p className="checkout__warning" role="note">
            <IconAlertCircle size={16} />
            <span>Pagamento <strong>simulado</strong>: nada é cobrado e nenhum dado de pagamento sai do seu navegador.</span>
          </p>

          <div className="checkout__methods" role="tablist" aria-label="Forma de pagamento">
            <button ref={firstButton} type="button" role="tab" aria-selected={method === 'pix'} className={`checkout__method${method === 'pix' ? ' checkout__method--on' : ''}`} onClick={() => setMethod('pix')}>
              Pix
            </button>
            <button type="button" role="tab" aria-selected={method === 'cartao'} className={`checkout__method${method === 'cartao' ? ' checkout__method--on' : ''}`} onClick={() => setMethod('cartao')}>
              Cartão
            </button>
          </div>

          <form onSubmit={handlePay}>
            {method === 'pix' ? (
              <div className="checkout__pix">
                <FakePixQr />
                <div>
                  <p className="checkout__label">Pix copia e cola (fictício)</p>
                  <code className="checkout__code">00020126EDUCATHON-SIMULADO-{plan.id.toUpperCase()}</code>
                  <p className="input-hint">Num produto real, o banco confirmaria o pagamento automaticamente.</p>
                </div>
              </div>
            ) : (
              <div className="checkout__card">
                <p className="input-hint">Dados de teste já preenchidos. Não digite um cartão real.</p>
                <label className="checkout__label" htmlFor="card-number">Número do cartão (teste)</label>
                <input id="card-number" className="input" value="4242 4242 4242 4242" readOnly />
                <div className="form-row">
                  <div>
                    <label className="checkout__label" htmlFor="card-exp">Validade</label>
                    <input id="card-exp" className="input" value="12/30" readOnly />
                  </div>
                  <div>
                    <label className="checkout__label" htmlFor="card-cvc">CVC</label>
                    <input id="card-cvc" className="input" value="123" readOnly />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="alert-box alert-box--error" role="alert"><IconAlertCircle size={18} /><span>{error}</span></div>
            )}

            <div className="checkout__actions">
              <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button type="submit" variant="success" loading={paying} id="btn-simulate-payment">
                Simular pagamento aprovado
              </Button>
            </div>
          </form>
        </Window>
      </div>
    </div>
  );
}

export default function Plans() {
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkoutPlan, setCheckoutPlan] = useState<PlanInfo | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);

  async function load() {
    const data = await getBilling();
    setBilling(data);
  }

  useEffect(() => {
    load()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Não foi possível carregar seus planos.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleCancel() {
    if (!window.confirm('Voltar para o plano gratuito?')) return;
    try {
      const res = await cancelPlan();
      setNotice(res.message);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível cancelar.');
    }
  }

  async function handleSaveKey(e: FormEvent) {
    e.preventDefault();
    setSavingKey(true);
    setError('');
    try {
      const res = await saveGeminiKey(apiKey.trim());
      setApiKey('');
      setNotice(res.message);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível salvar a chave.');
    } finally {
      setSavingKey(false);
    }
  }

  async function handleRemoveKey() {
    if (!window.confirm('Remover a chave do Gemini? As próximas gerações voltam a usar a cota da plataforma.')) return;
    try {
      const res = await removeGeminiKey();
      setNotice(res.message);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover a chave.');
    }
  }

  if (loading) {
    return (
      <div className="page-container page-container--center">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (!billing) {
    return (
      <div className="page-container">
        <div className="alert-box alert-box--error" role="alert"><IconAlertCircle size={18} /><span>{error}</span></div>
      </div>
    );
  }

  const isOrg = billing.entity.type === 'organization';
  const ownKey = billing.ownKey.configured;

  return (
    <div className="page-container animate-fade-in plans-page">
      <div className="page-header-row">
        <div className="page-header-row__text">
          <h2 className="page-title">Planos e uso de IA</h2>
          <p className="page-subtitle">
            {isOrg ? `Plano da instituição ${billing.entity.name}.` : 'Seu plano individual de professor.'} Protótipo: o pagamento é simulado.
          </p>
        </div>
      </div>

      {notice && (
        <div className="alert-box alert-box--success" role="status">
          <IconCheckCircle size={18} /><span style={{ flex: 1 }}>{notice}</span>
          <Button variant="ghost" size="sm" onClick={() => setNotice('')} aria-label="Fechar aviso">✕</Button>
        </div>
      )}
      {error && (
        <div className="alert-box alert-box--error" role="alert">
          <IconAlertCircle size={18} /><span style={{ flex: 1 }}>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError('')} aria-label="Fechar erro">✕</Button>
        </div>
      )}

      {billing.ownKey.unreadable && (
        <div className="alert-box alert-box--error" role="alert">
          <IconAlertCircle size={18} />
          <span>A chave do Gemini salva não pode mais ser lida (a chave de criptografia do servidor mudou). Remova e cadastre de novo.</span>
        </div>
      )}
      <Window fileName="uso-de-ia-do-mes.txt" tone="blue" className="usage-win" barExtra={<Stamp tone="info">{billing.plan.name}</Stamp>}>
        {ownKey ? (
          <div className="usage">
            <p className="usage__big">Chave própria do Gemini ativa <span className="usage__key">•••• {billing.ownKey.last4}</span></p>
            <p className="usage__text">
              Sem limite da plataforma: o custo vai para a conta Google de quem cadastrou a chave.{' '}
              {billing.usedWithOwnKey} geração(ões) neste mês com a chave.
            </p>
          </div>
        ) : (
          <div className="usage">
            <p className="usage__big">
              <strong>{billing.used}</strong> de {billing.quota?.toLocaleString('pt-BR')} gerações de IA usadas neste mês
            </p>
            <ProgressBar
              value={billing.used}
              max={billing.quota || 1}
              color={billing.remaining === 0 ? 'red' : 'green'}
              label="Uso de IA no mês"
              showLabel={false}
            />
            <p className="usage__text">
              {billing.remaining === 0
                ? 'A cota acabou. Assine um plano ou cadastre uma chave própria para continuar gerando feedbacks.'
                : `Restam ${billing.remaining?.toLocaleString('pt-BR')}. Cada feedback gerado (ou regerado) e cada prova lida conta 1. Questões objetivas certas não contam.`}
              {billing.plan.renewsAt && ` Renova em ${formatDate(billing.plan.renewsAt)} (simulado).`}
            </p>
          </div>
        )}
      </Window>

      {!billing.canManage && (
        <p className="plans-page__managed">
          O plano é gerenciado pelo administrador da instituição. Se a cota acabar, fale com ele.
        </p>
      )}

      <h3 className="plans-page__section">Planos</h3>
      <div className="plan-grid">
        {billing.catalog.map((plan) => {
          const current = plan.id === billing.plan.id;
          return (
            <article key={plan.id} className={`plan-card${current ? ' plan-card--current' : ''}`}>
              {current && <Stamp tone="approved" className="plan-card__stamp">Plano atual</Stamp>}
              <h4 className="plan-card__name">{plan.name}</h4>
              <p className="plan-card__price">{formatPrice(plan.priceCents)}</p>
              <p className="plan-card__quota">{plan.monthlyQuota.toLocaleString('pt-BR')} gerações de IA/mês</p>
              <p className="plan-card__desc">{plan.description}</p>
              <ul className="plan-card__features">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              {billing.canManage && plan.id !== 'gratuito' && !current && (
                <Button variant="primary" onClick={() => setCheckoutPlan(plan)} icon={<IconSparkles size={16} />}>
                  Assinar (simulado)
                </Button>
              )}
              {billing.canManage && plan.id !== 'gratuito' && current && (
                <Button variant="ghost" onClick={handleCancel}>Cancelar plano</Button>
              )}
            </article>
          );
        })}
        {!isOrg && (
          <article className="plan-card plan-card--org">
            <h4 className="plan-card__name">Para escolas e redes</h4>
            <p className="plan-card__desc">
              Crie a área da sua instituição para gerenciar professores, alunos e um plano compartilhado.
            </p>
            <Link className="ui-btn ui-btn--ghost ui-btn--md" to="/instituicao">Criar instituição</Link>
          </article>
        )}
      </div>

      {billing.canManage && (
        <Window fileName="chave-gemini.txt" className="key-win">
          <h3 className="plans-page__section" style={{ marginTop: 0 }}>Usar a sua própria chave paga do Gemini</h3>
          <p className="usage__text">
            {isOrg ? 'A instituição' : 'Você'} pode cadastrar uma chave da API do Gemini com faturamento ativo no Google AI Studio.
            Assim o uso não depende da cota do Educathon e, segundo os termos da API, no nível pago o Google não usa os dados enviados para melhorar os produtos dele, o que é mais adequado para dados de alunos.
          </p>
          {ownKey ? (
            <div className="key-win__current">
              <span>Chave cadastrada: <strong>•••• {billing.ownKey.last4}</strong> (guardada criptografada; nunca é mostrada de novo)</span>
              <Button variant="ghost" size="sm" onClick={handleRemoveKey}>Remover chave</Button>
            </div>
          ) : (
            <form className="key-win__form" onSubmit={handleSaveKey}>
              <label htmlFor="gemini-key" className="sr-only">Chave da API do Gemini</label>
              <input
                id="gemini-key"
                type="password"
                className="input"
                placeholder="Cole aqui a chave (começa com AIza ou AQ.)"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
              <Button type="submit" variant="primary" loading={savingKey} disabled={!apiKey.trim()}>Salvar chave</Button>
            </form>
          )}
          <p className="input-hint">Nunca compartilhe a chave por e-mail ou mensagem. Se ela vazar, apague no Google AI Studio e gere outra.</p>
        </Window>
      )}

      {billing.canManage && billing.payments.length > 0 && (
        <>
          <h3 className="plans-page__section">Histórico (simulado)</h3>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr><th>Data</th><th>Plano</th><th>Valor</th><th>Forma</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {billing.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.created_at)}</td>
                    <td>{billing.catalog.find((c) => c.id === p.plan)?.name || p.plan}</td>
                    <td>{formatPrice(p.amount_cents).replace('/mês', '')}</td>
                    <td>{p.method === 'pix' ? 'Pix' : 'Cartão'}</td>
                    <td><Stamp tone="approved">Pago (simulado)</Stamp></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {checkoutPlan && (
        <CheckoutDialog
          plan={checkoutPlan}
          onClose={() => setCheckoutPlan(null)}
          onPaid={async (message) => {
            setCheckoutPlan(null);
            setNotice(message);
            await load();
          }}
        />
      )}
    </div>
  );
}
