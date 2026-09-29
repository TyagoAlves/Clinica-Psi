/**
 * ConsentModelEditor - edita os modelos de termo LGPD por blocos legiveis,
 * no lugar do JSON cru. Um bloco por linha: texto solto vira paragrafo,
 * linhas com "- " viram titulo (h2) e "* " viram item de lista.
 * Mantem a previa sincronizada a cada digito.
 */

import { useEffect, useRef, useState } from 'react';
import type {
  AppConfig,
  ConsentBlock,
  ConsentModel,
  ConsentModels,
  Patient,
  Professional,
} from '../domain/types';
import { buildConsentVars, renderConsentText } from '../services/ConsentService';


export type ModelKey = keyof ConsentModels;

const CHAVES: ModelKey[] = ['treatment', 'data'];

/** Preview usa dados ficticios para o titular aparecer preenchido. */
const PACIENTE_EXEMPLO = {
  name: 'Nome do paciente',
  document: '000.000.000-00',
} as unknown as Patient;

const PROFISSIONAL_EXEMPLO = {
  name: 'Dra. Ana Ribeiro',
  crp: 'CRP 06/00000',
} as unknown as Professional;

export function blocksToText(blocks: ConsentBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === 'heading') return `- ${b.text}`;
      if (b.type === 'list') return b.items.filter((i) => i.trim()).map((i) => `* ${i}`).join('\n');
      return b.text;
    })
    .join('\n\n');
}

export function textToBlocks(texto: string): ConsentBlock[] {
  const blocos: ConsentBlock[] = [];
  const paragrafos = texto.split(/\n\s*\n/);

  for (const paragrafo of paragrafos) {
    const linhas = paragrafo.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!linhas.length) continue;

    if (linhas.every((l) => l.startsWith('* '))) {
      blocos.push({ type: 'list', items: linhas.map((l) => l.slice(2).trim()).filter(Boolean) });
      continue;
    }

    for (const linha of linhas) {
      if (linha.startsWith('- ')) {
        blocos.push({ type: 'heading', text: linha.slice(2).trim() });
      } else if (linha.startsWith('* ')) {
        // lista misturada com texto: vira lista de um item
        const ultimo = blocos[blocos.length - 1];
        if (ultimo && ultimo.type === 'list') ultimo.items.push(linha.slice(2).trim());
        else blocos.push({ type: 'list', items: [linha.slice(2).trim()] });
      } else {
        blocos.push({ type: 'paragraph', text: linha });
      }
    }
  }

  return blocos;
}

interface Props {
  models: ConsentModels;
  config: AppConfig;
  onChange: (models: ConsentModels) => void;
}

export function ConsentModelEditor({ models, config, onChange }: Props) {
  const [textoPorChave, setTextoPorChave] = useState<Record<string, string>>(() => ({
    treatment: blocksToText(models.treatment.blocks),
    data: blocksToText(models.data.blocks),
  }));

  // se o config mudar por fora (restaurar padrao, importar backup), realinha
  const assinatura = JSON.stringify(models);
  const ultimaAssinatura = useRef(assinatura);
  useEffect(() => {
    if (ultimaAssinatura.current === assinatura) return;
    ultimaAssinatura.current = assinatura;
    setTextoPorChave({
      treatment: blocksToText(models.treatment.blocks),
      data: blocksToText(models.data.blocks),
    });
  }, [assinatura, models]);

  const editar = (chave: ModelKey, texto: string) => {
    setTextoPorChave((t) => ({ ...t, [chave]: texto }));
    const atual = models[chave];
    onChange({
      ...models,
      [chave]: { ...atual, blocks: textToBlocks(texto) },
    } as ConsentModels);
  };

  const campo = (chave: ModelKey, prop: 'label' | 'title', valor: string) => {
    onChange({ ...models, [chave]: { ...models[chave], [prop]: valor } } as ConsentModels);
  };

  return (
    <div className="stack">
      {CHAVES.map((chave) => {
        const model: ConsentModel = models[chave];
        const vars = buildConsentVars(PACIENTE_EXEMPLO, config, PROFISSIONAL_EXEMPLO, PACIENTE_EXEMPLO.name);

        return (
          <div className="card" key={chave} data-model={chave} style={{ boxShadow: 'none' }}>
            <div className="card-head">
              <h3>{model.label || model.title}</h3>
              <span className="badge">{chave}</span>
            </div>
            <div className="card-body stack">
              <div>
                <label className="form-label" htmlFor={`cm-label-${chave}`}>
                  Nome que aparece no botão
                </label>
                <input
                  id={`cm-label-${chave}`}
                  className="form-input"
                  type="text"
                  maxLength={60}
                  value={model.label || ''}
                  onChange={(e) => campo(chave, 'label', e.currentTarget.value)}
                />
              </div>

              <div>
                <label className="form-label" htmlFor={`cm-title-${chave}`}>
                  Título do documento
                </label>
                <input
                  id={`cm-title-${chave}`}
                  className="form-input"
                  type="text"
                  maxLength={120}
                  value={model.title || ''}
                  onChange={(e) => campo(chave, 'title', e.currentTarget.value)}
                />
              </div>

              <div>
                <label className="form-label" htmlFor={`cm-blocks-${chave}`}>
                  Blocos do texto
                </label>
                <span className="form-hint">
                  Use {'{{TITULAR}}'}, {'{{DOCUMENTO}}'}, {'{{CLINICA}}'}, {'{{PSICOLOGO}}'} e {'{{CRP}}'}. Um
                  bloco por linha. Linhas com <strong>-&nbsp;</strong> viram título, com{' '}
                  <strong>*&nbsp;</strong> viram lista.
                </span>
                <textarea
                  id={`cm-blocks-${chave}`}
                  className="form-textarea"
                  rows={14}
                  value={textoPorChave[chave] || ''}
                  onChange={(e) => editar(chave, e.currentTarget.value)}
                />
              </div>

              <div className="preview-box">
                <h4>Prévia</h4>
                <div
                  className="doc"
                  style={{ minHeight: 0, maxHeight: 340 }}
                  dangerouslySetInnerHTML={{ __html: renderConsentText(model, vars) }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
