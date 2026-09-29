/**
 * Tour - passeia pela aplicacao de verdade.
 *
 * Cada passo traz uma rota e um seletor: o componente navega para a tela, mede
 * o elemento apontado e recorta um "buraco" (spotlight) ao redor dele, deixando
 * o resto da tela escurecido. O tooltip entra encostado no elemento, entao o
 * usuario ve a coisa sendo explicada e o lugar dela ao mesmo tempo.
 *
 * Se o elemento nao existir (lista vazia, versao sem aquela tela), o passo
 * ainda aparece, sem spotlight, centralizado - nunca trava o tour.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X, Sparkles, Check } from 'lucide-react';
import { useAuth } from '../../store';
import { aoPedirTour, concluir, lerTour, salvarPasso, PASSOS, type TourPasso } from '../../services/TourService';

type Rect = { top: number; left: number; width: number; height: number };

const GAP = 8;
const TOOLTIP_W = 360;
const PAD = 6;

function medir(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function Tour({ forcarAberto = false }: { forcarAberto?: boolean }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const local = useLocation();
  const [passo, setPasso] = useState(0);
  const [aberto, setAberto] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [iniciando, setIniciando] = useState(true);

  const passoAtual: TourPasso = PASSOS[passo];
  const total = PASSOS.length;

  /**
   * Dispara uma vez por navegador, no primeiro acesso autenticado. Depois
   * disso so volta pelo botao "Refazer o tour" da ajuda.
   */
  useEffect(() => {
    if (!isAuthenticated || forcarAberto) return;
    let vivo = true;
    lerTour()
      .then((estado) => {
        if (!vivo) return;
        if (estado.concluido) return;
        setPasso(Math.min(estado.passo, total - 1));
        setAberto(true);
      })
      .finally(() => {
        if (vivo) setIniciando(false);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, forcarAberto]);

  useEffect(() => {
    if (forcarAberto) {
      setAberto(true);
      setIniciando(false);
    }
  }, [forcarAberto]);

  // "Refazer o tour" na tela de ajuda
  useEffect(
    () => aoPedirTour(() => {
      setPasso(0);
      setIniciando(false);
      setAberto(true);
    }),
    []
  );

  // navega para a tela do passo e espera o elemento existir
  useEffect(() => {
    if (!aberto || !passoAtual) return;
    setRect(null);

    const alvoRota = passoAtual.rota;
    if (alvoRota && local.pathname !== alvoRota) {
      navigate(alvoRota);
      return;
    }

    let tentativas = 0;
    const procurar = () => {
      const el = passoAtual.alvo ? document.querySelector(passoAtual.alvo!) : null;
      const medido = medir(el);
      if (medido) {
        setRect(medido);
        return;
      }
      if (passoAtual.alvo && tentativas < 20) {
        tentativas += 1;
        window.setTimeout(procurar, 100);
      }
    };
    // um frame de espera para a tela paint depois da navegacao
    const id = window.requestAnimationFrame(procurar);
    return () => window.cancelAnimationFrame(id);
  }, [aberto, passo, local.pathname, navigate, passoAtual]);

  // reposiciona o spotlight quando a janela muda de tamanho
  useEffect(() => {
    if (!aberto || !passoAtual?.alvo) return;
    const onResize = () => {
      const medido = medir(document.querySelector(passoAtual.alvo!));
      if (medido) setRect(medido);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [aberto, passoAtual]);

  const fechar = useCallback(async () => {
    setAberto(false);
    setRect(null);
    await concluir();
  }, []);

  const irPara = useCallback(
    (novo: number) => {
      if (novo < 0 || novo >= total) return;
      setPasso(novo);
      salvarPasso(novo).catch((e) => console.error('Failed to save tour step:', e));
    },
    [total]
  );

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') irPara(passo + 1);
      else if (e.key === 'ArrowLeft') irPara(passo - 1);
      else if (e.key === 'Escape') void fechar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberto, passo, irPara, fechar]);

  if (iniciando || !aberto || !passoAtual) return null;

  const ultimo = passo === total - 1;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-titulo">
      {rect ? <TourSpotlight rect={rect} /> : <div className="tour-backdrop" />}

      <TourTooltip
        rect={rect}
        lado={passoAtual.lado}
        passo={passo}
        total={total}
        titulo={passoAtual.titulo}
        texto={passoAtual.texto}
        ultimo={ultimo}
        onVoltar={() => irPara(passo - 1)}
        onAvancar={() => irPara(passo + 1)}
        onFinalizar={() => void fechar()}
        onPular={() => void fechar()}
      />
    </div>
  );
}

/** O "buraco" ao redor do elemento: 4 retangulos escuros ao redor do recorte. */
function TourSpotlight({ rect }: { rect: Rect }) {
  const estilo = {
    position: 'fixed' as const,
    background: 'rgba(15, 23, 42, .62)',
    pointerEvents: 'auto' as const,
  };
  return (
    <>
      <div className="tour-mask" style={{ ...estilo, top: 0, left: 0, right: 0, height: Math.max(0, rect.top - PAD) }} />
      <div
        className="tour-mask"
        style={{
          ...estilo,
          top: rect.top + rect.height + PAD,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
      <div className="tour-mask" style={{ ...estilo, top: rect.top - PAD, left: 0, width: Math.max(0, rect.left - PAD), height: rect.height + PAD * 2 }} />
      <div
        className="tour-mask"
        style={{
          ...estilo,
          top: rect.top - PAD,
          left: rect.left + rect.width + PAD,
          right: 0,
          height: rect.height + PAD * 2,
        }}
      />
      <div
        className="tour-halo"
        style={{
          position: 'fixed',
          top: rect.top - PAD,
          left: rect.left - PAD,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
          borderRadius: 12,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}

type TooltipProps = {
  rect: Rect | null;
  lado?: TourPasso['lado'];
  passo: number;
  total: number;
  titulo: string;
  texto: string;
  ultimo: boolean;
  onVoltar: () => void;
  onAvancar: () => void;
  onFinalizar: () => void;
  onPular: () => void;
};

function TourTooltip({
  rect,
  lado,
  passo,
  total,
  titulo,
  texto,
  ultimo,
  onVoltar,
  onAvancar,
  onFinalizar,
  onPular,
}: TooltipProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const h = box.offsetHeight || 200;
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    if (!rect) {
      setPos({ top: Math.max(GAP, (vh - h) / 2), left: Math.max(GAP, (vw - TOOLTIP_W) / 2) });
      return;
    }

    let top: number;
    let left: number;
    const preferido = lado || 'baixo';

    const cabeAbaixo = rect.top + rect.height + h + GAP <= vh;
    if (preferido === 'baixo' && cabeAbaixo) {
      top = rect.top + rect.height + GAP;
    } else if (preferido === 'cima' && rect.top - h - GAP >= GAP) {
      top = rect.top - h - GAP;
    } else if (cabeAbaixo) {
      // nao cabe abaixo: tenta acima, e se nem couber, centraliza
      top = rect.top - h - GAP >= GAP ? rect.top - h - GAP : rect.top + rect.height / 2 - h / 2;
    } else {
      top = rect.top - h - GAP;
    }

    left = rect.left;

    // nao deixa o tooltip sair da tela
    if (top + h > vh - GAP) top = Math.max(GAP, vh - h - GAP);
    if (top < GAP) top = GAP;
    if (left + TOOLTIP_W > vw - GAP) left = Math.max(GAP, vw - TOOLTIP_W - GAP);
    if (left < GAP) left = GAP;

    setPos({ top, left });
  }, [rect, lado]);

  return (
    <div
      ref={boxRef}
      className="tour-tooltip"
      style={{
        position: 'fixed',
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: TOOLTIP_W,
        maxWidth: 'calc(100vw - 24px)',
        opacity: pos ? 1 : 0,
      }}
    >
      <div className="tour-tooltip-topo">
        <span className="tour-tooltip-marca">
          <Sparkles className="w-3.5 h-3.5" /> Tour
        </span>
        <span className="tour-tooltip-contador">
          {passo + 1}/{total}
        </span>
        <button className="tour-tooltip-x" onClick={onPular} title="Pular o tour" aria-label="Pular o tour">
          <X className="w-4 h-4" />
        </button>
      </div>

      <h3 id="tour-titulo">{titulo}</h3>
      <p>{texto}</p>

      <div className="tour-tooltip-rodape">
        <button className="btn btn-ghost btn-sm" onClick={onVoltar} disabled={passo === 0}>
          <ChevronLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="tour-dots" aria-hidden="true">
          {PASSOS.map((p, i) => (
            <span key={p.rota + p.titulo} className={`tour-dot ${i === passo ? 'active' : ''} ${i < passo ? 'feito' : ''}`} />
          ))}
        </div>
        {ultimo ? (
          <button className="btn btn-primary btn-sm" onClick={onFinalizar}>
            <Check className="w-4 h-4" /> Concluir
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={onAvancar}>
            Avançar <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
