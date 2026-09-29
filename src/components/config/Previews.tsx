/**
 * Previas das telas de Configuracoes. Cada componente recebe o rascunho que
 * esta sendo digitado (ainda nao salvo) e desenha o resultado, para o usuario
 * ver o efeito antes de gravar.
 */

import type { AppConfig, BrandConfig, ClinicConfig, TextConfig } from '../../domain/types';

/** Mesma regra do Layout/Login: usa a imagem quando ha, senao a sigla. */
export function BrandMark({
  brand,
  size = 'md',
}: {
  brand: BrandConfig;
  size?: 'sm' | 'md';
}) {
  const classe = size === 'sm' ? 'logo logo-sm' : 'logo';
  if (brand?.logo) {
    return (
      <div
        className={`${classe} logo-img logo-logo`}
        style={{ backgroundImage: `url(${brand.logo})` }}
        aria-label="Logo da clinica"
      />
    );
  }
  return (
    <div
      className={`${classe} logo-logo`}
      style={{
        background: `linear-gradient(135deg, ${brand?.primaryColor || '#4f46e5'}, ${
          brand?.secondaryColor || '#7c3aed'
        })`,
      }}
      aria-label="Sigla da clinica"
    >
      {brand?.acronym || '—'}
    </div>
  );
}

export function IdentityPreview({
  clinic,
  brand,
  texts,
}: {
  clinic: ClinicConfig;
  brand: BrandConfig;
  texts: TextConfig;
}) {
  const contato = [clinic.phone, clinic.email, clinic.website].filter(Boolean);

  return (
    <div className="preview-box">
      <h4>Prévia</h4>

      <div className="preview-brand">
        <BrandMark brand={brand} />
        <div>
          <strong>{clinic.name || 'Nome da clínica'}</strong>
          <span>{clinic.unit || ''}</span>
        </div>
      </div>

      <hr />

      <div className="small muted">Título da aba do navegador</div>
      <div className="small">{`${clinic.name || 'Clínica'} · ${texts.systemName || 'Sistema'}`}</div>

      <div className="small muted" style={{ marginTop: 10 }}>
        Cabeçalho de PDF
      </div>
      <div className="print-clinic" style={{ background: '#fff' }}>
        <div className="print-clinic" style={{ border: 0, marginBottom: 0, paddingBottom: 0 }}>
          <BrandMark brand={brand} size="sm" />
          <div>
            <h1 style={{ fontSize: 15, margin: 0 }}>{clinic.name || '-'}</h1>
            <div className="pc-meta">
              {clinic.unit || '-'}
              {clinic.address ? (
                <>
                  <br />
                  {clinic.address}
                </>
              ) : null}
            </div>
          </div>
          <div className="pc-meta" style={{ textAlign: 'right', whiteSpace: 'pre-line' }}>
            {contato.join('\n')}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrandPreview({
  brand,
  clinic,
  texts,
}: {
  brand: BrandConfig;
  clinic: ClinicConfig;
  texts: TextConfig;
}) {
  return (
    <>
      <div className="preview-box">
        <h4>Prévia da tela de entrada</h4>
        <div
          className="login-brand"
          style={
            {
              '--preview-primary': brand.primaryColor,
              '--preview-secondary': brand.secondaryColor,
            } as React.CSSProperties
          }
        >
          <BrandMark brand={brand} />
          <div>
            <h1>{clinic.name || 'Nome da clínica'}</h1>
            <p>{texts.loginSubtitle || ''}</p>
          </div>
        </div>
      </div>

      <div className="preview-box">
        <h4>Barra lateral</h4>
        <div className="sidebar-brand">
          <BrandMark brand={brand} size="sm" />
          <div>
            <strong>{clinic.name || 'Nome da clínica'}</strong>
            <span>{clinic.unit || ''}</span>
          </div>
        </div>
      </div>
    </>
  );
}

/** Barra de uso do navegador, como na POC. */
export function StorageMeter({
  bytes,
  logoBytes,
  percentual,
  limite,
}: {
  bytes: number;
  logoBytes: number;
  percentual: number;
  limite: number;
}) {
  const cor = percentual > 80 ? 'var(--danger)' : percentual > 50 ? 'var(--warn)' : 'var(--success)';

  return (
    <div className="card" style={{ boxShadow: 'none' }}>
      <div className="card-body small">
        <strong>Espaço usado no navegador</strong>
        <div className="bar-list" style={{ marginTop: 8 }}>
          <div className="bar-row">
            <span>Dados completos</span>
            <div className="bar-track" style={{ flex: 1, margin: '0 8px' }}>
              <div className="bar-fill" style={{ width: `${Math.min(100, percentual)}%`, background: cor }} />
            </div>
            <strong>{percentual}%</strong>
          </div>
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>
          {Math.round(bytes / 1024)} KB de ~{Math.round(limite / 1024 / 1024)} MB. Logo:{' '}
          {logoBytes ? `${Math.round(logoBytes / 1024)} KB` : 'nenhuma'}.
        </div>
        {logoBytes > 150 * 1024 && (
          <div className="small" style={{ color: 'var(--warn)', marginTop: 4 }}>
            Logo grande. Se o navegador começar a recusar a gravação, reduza a imagem.
          </div>
        )}
      </div>
    </div>
  );
}

export type ConfigCompleta = AppConfig;
