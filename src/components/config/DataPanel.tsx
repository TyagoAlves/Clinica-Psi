/**
 * Aba Dados de Configuracoes: contagens, uso do navegador, backup em arquivo
 * JSON e as acoes destrutivas (limpar dados clinicos / restaurar demonstracao),
 * todas com confirmacao antes de apagar.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../ui';
import { useConfig } from '../../store';
import {
  contagens,
  exportarBackup,
  importarBackup,
  lerArquivoComoTexto,
  limparDadosClinicos,
  restaurarDemonstracao,
  salvarBackup,
  usoArmazenamento,
  type ColecaoKey,
  type UsoArmazenamento,
} from '../../services/DataService';
import { isTauri } from '../../utils/tauri';
import { abrirArquivo } from '../../utils/backupArquivo';
import { StorageMeter } from './Previews';

const ROTULOS: Record<ColecaoKey, string> = {
  patients: 'Pacientes',
  evolutions: 'Evoluções',
  appointments: 'Agendamentos',
  consents: 'Termos LGPD',
  services: 'Serviços',
  professionals: 'Equipe',
};

type Confirmacao = {
  titulo: string;
  descricao: string;
  rotulo: string;
  perigoso: boolean;
  executar: () => Promise<void>;
};

export function DataPanel({
  onReautenticar,
  onAviso,
}: {
  /** backup restaurado / demo: a sessao precisa ser refeita */
  onReautenticar: () => void;
  onAviso: (tipo: 'success' | 'error' | 'warning', mensagem: string) => void;
}) {
  const [contagem, setContagem] = useState<Record<ColecaoKey, number> | null>(null);
  const [uso, setUso] = useState<UsoArmazenamento | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const inputBackup = useRef<HTMLInputElement>(null);
  // Em homologacao o ambiente ja e de teste: a limpeza total nao pede uma
  // confirmacao extra, para poder recomecar quantas vezes for preciso.
  const liberada = useConfig().homologacao;

  const recarregar = useCallback(async () => {
    const [c, u] = await Promise.all([contagens(), usoArmazenamento()]);
    setContagem(c);
    setUso(u);
  }, []);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const exportar = async () => {
    setOcupado('exportar');
    try {
      const backup = await exportarBackup();
      const r = await salvarBackup(backup);
      if (r.cancelado) return;
      if (!r.ok) {
        onAviso('error', 'Não foi possível gravar o arquivo. Verifique as permissões da pasta.');
        return;
      }
      onAviso('success', `Backup gravado: ${r.caminho ?? backup.nome}`);
    } catch (e) {
      console.error('Failed to export backup:', e);
      onAviso('error', 'Não foi possível gerar o backup.');
    } finally {
      setOcupado(null);
    }
  };

  const restaurar = async (texto: string) => {
    setOcupado('importar');
    try {
      const r = await importarBackup(texto);
      if (!r.ok) {
        onAviso('error', r.erro || 'Não foi possível restaurar o backup.');
        return;
      }
      onAviso('success', `Backup restaurado para ${r.resumo}. Entre novamente.`);
      onReautenticar();
    } catch (e) {
      console.error('Failed to restore backup:', e);
      onAviso('error', 'Não foi possível ler o arquivo.');
    } finally {
      setOcupado(null);
    }
  };

  const restaurarDeArquivo = async (arquivo: File) => {
    await restaurar(await lerArquivoComoTexto(arquivo));
    if (inputBackup.current) inputBackup.current.value = '';
  };

  const escolherBackup = async () => {
    // No app empacotado o caminho vem do dialogo nativo; na web continua
    // sendo o <input type="file">, que a suite Playwright usa.
    if (!isTauri()) {
      inputBackup.current?.click();
      return;
    }
    setOcupado('escolher');
    try {
      const texto = await abrirArquivo();
      if (texto === null) return;
      await restaurar(texto);
    } catch (e) {
      console.error('Failed to open backup:', e);
      onAviso('error', 'Não foi possível abrir o arquivo.');
    } finally {
      setOcupado(null);
    }
  };

  const pedirLimpeza = () => {
    if (!contagem) return;
    if (liberada) {
      executarDireto({
        descricao: 'limpeza dos dados clínicos',
        executar: async () => {
          await limparDadosClinicos();
          await recarregar();
          onAviso('success', 'Dados clínicos apagados. A equipe continua a mesma.');
        },
      });
      return;
    }
    setConfirmacao({
      titulo: 'Limpar dados clínicos',
      descricao:
        `Serão apagados ${contagem.patients} paciente(s), ${contagem.evolutions} evolução(ões), ` +
        `${contagem.appointments} agendamento(s), ${contagem.consents} termo(s) e ${contagem.services} serviço(s). ` +
        'Seu acesso, a equipe e a identidade da clínica permanecem.',
      rotulo: 'Limpar',
      perigoso: true,
      executar: async () => {
        await limparDadosClinicos();
        await recarregar();
        onAviso('success', 'Dados clínicos apagados. A empresa continua com a equipe atual.');
      },
    });
  };

  const pedirDemo = () => {
    if (liberada) {
      executarDireto({
        descricao: 'restauração da demonstração',
        executar: async () => {
          await restaurarDemonstracao();
          onAviso('success', 'Dados de demonstração restaurados.');
          onReautenticar();
        },
      });
      return;
    }
    setConfirmacao({
      titulo: 'Restaurar demonstração',
      descricao:
        'Todos os dados atuais serão substituídos pelos dados de exemplo, inclusive a identidade da clínica. Continuar?',
      rotulo: 'Restaurar',
      perigoso: true,
      executar: async () => {
        await restaurarDemonstracao();
        onAviso('success', 'Dados de demonstração restaurados.');
        onReautenticar();
      },
    });
  };

  const executarDireto = async (acao: { descricao: string; executar: () => Promise<void> }) => {
    setOcupado('confirmar');
    try {
      await acao.executar();
    } catch (e) {
      console.error(`Failed (${acao.descricao}):`, e);
      onAviso('error', 'Não foi possível concluir a operação.');
    } finally {
      setOcupado(null);
    }
  };

  const confirmar = async () => {
    if (!confirmacao) return;
    const acao = confirmacao;
    setConfirmacao(null);
    setOcupado('confirmar');
    try {
      await acao.executar();
    } catch (e) {
      console.error('Failed:', e);
      onAviso('error', 'Não foi possível concluir a operação.');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="grid-2">
      <div className="stack">
        <div className="preview-box">
          <h4>O que existe no sistema</h4>
          {contagem ? (
            (Object.keys(contagem) as ColecaoKey[]).map((chave) => (
              <div className="row-between" key={chave}>
                <span className="muted">{ROTULOS[chave]}</span>
                <strong>{contagem[chave]}</strong>
              </div>
            ))
          ) : (
            <div className="small muted">Carregando…</div>
          )}
          {uso && (
            <div className="row-between" style={{ marginTop: 8 }}>
              <span className="muted">Espaço usado</span>
              <strong>{uso.percentual}%</strong>
            </div>
          )}
        </div>

        <div className="row">
          <Button
            variant="primary"
            size="sm"
            onClick={exportar}
            disabled={ocupado !== null}
            aria-label="Baixar backup"
          >
            Baixar backup
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={escolherBackup}
            disabled={ocupado !== null}
            aria-label="Restaurar backup"
            data-ocupado={ocupado === 'escolher' ? 'true' : undefined}
          >
            Restaurar backup
          </Button>
          <input
            ref={inputBackup}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Arquivo de backup"
            onChange={(e) => {
              const arquivo = e.currentTarget.files?.[0];
              if (arquivo) restaurarDeArquivo(arquivo);
            }}
          />
        </div>
        <div className="small muted">
          Restaurar substitui tudo: pacientes, equipe, serviços, agenda e termos. Exporte antes.
        </div>
      </div>

      <div className="stack">
        {uso && (
          <StorageMeter
            bytes={uso.bytes}
            logoBytes={uso.logoBytes}
            percentual={uso.percentual}
            limite={uso.limite}
          />
        )}

        <div className="card" style={{ boxShadow: 'none', borderColor: '#fecaca' }}>
          <div className="card-body stack">
            <div>
              <strong>Zona de risco</strong>
              <div className="small muted">Ações que apagam dados deste navegador.</div>
            </div>
            <div className="row">
              <Button
                variant="secondary"
                size="sm"
                onClick={pedirLimpeza}
                disabled={ocupado !== null}
                aria-label="Limpar dados clínicos"
              >
                Limpar dados clínicos
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={pedirDemo}
                disabled={ocupado !== null}
                aria-label="Restaurar demonstração"
              >
                Restaurar demonstração
              </Button>
            </div>
            <div className="small muted">
              “Limpar dados clínicos” apaga pacientes, evoluções, agenda, termos e serviços, mas mantém o
              seu acesso, a equipe e a identidade. Use ao começar uma nova empresa.
            </div>
            <div className="small muted">
              A restauração da demonstração também devolve a clínica de exemplo. Faça um backup antes
              se já estiver usando a empresa real.
            </div>
            {liberada && (
              <div className="small" style={{ color: 'var(--warn)' }}>
                Modo homologação: estas duas ações já executam direto, sem confirmação.
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmacao && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="dp-confirm">
          <div className="modal-backdrop" onClick={() => setConfirmacao(null)} />
          <div className="modal sm">
            <div className="modal-head">
              <h3 id="dp-confirm">{confirmacao.titulo}</h3>
              <button
                className="password-toggle"
                style={{ position: 'static' }}
                onClick={() => setConfirmacao(null)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="small">{confirmacao.descricao}</p>
            </div>
            <div className="modal-foot">
              <Button variant="secondary" onClick={() => setConfirmacao(null)}>
                Cancelar
              </Button>
              <Button
                variant={confirmacao.perigoso ? 'danger' : 'primary'}
                onClick={confirmar}
                aria-label={`Confirmar: ${confirmacao.rotulo}`}
              >
                {confirmacao.rotulo}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
