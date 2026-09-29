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
import { authService } from '../../services/AuthService';
import { isTauri } from '../../utils/tauri';
import { abrirArquivo } from '../../utils/backupArquivo';
import {
  baixarArquivo,
  exportarConfiguracoes,
  importarConfiguracoes,
  ultimaImportacao,
} from '../../services/ConfigTransferService';
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
  somenteBackup = false,
}: {
  /** backup restaurado / demo: a sessao precisa ser refeita */
  onReautenticar: () => void;
  onAviso: (tipo: 'success' | 'error' | 'warning', mensagem: string) => void;
  /**
   * Quem nao administra tem direito ao backup, mas nao a zona de risco: limpar
   * os dados da clinica e restaurar a demonstracao mexem em dado de todo mundo.
   */
  somenteBackup?: boolean;
}) {
  const [contagem, setContagem] = useState<Record<ColecaoKey, number> | null>(null);
  const [uso, setUso] = useState<UsoArmazenamento | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  // restaurar backup e uma acao que troca tudo: o arquivo fica parado ate o
  // profissional confirmar a senha atual
  const [pendente, setPendente] = useState<{ nome: string; texto: string } | null>(null);
  const [senha, setSenha] = useState('');
  const [erroSenha, setErroSenha] = useState('');
  const inputBackup = useRef<HTMLInputElement>(null);
  // import de configuracoes: o arquivo escolhido guarda o modo ate a leitura
  const [modoImport, setModoImport] = useState<'substituir' | 'mesclar' | null>(null);
  const [ultima, setUltima] = useState<{ em: string; origem: string; modo: string } | null>(null);
  const inputConfig = useRef<HTMLInputElement>(null);
  // Em homologacao o ambiente ja e de teste: a limpeza total nao pede uma
  // confirmacao extra, para poder recomecar quantas vezes for preciso.
  const { homologacao: liberada, loadConfig } = useConfig();

  const recarregar = useCallback(async () => {
    const [c, u] = await Promise.all([contagens(), usoArmazenamento()]);
    setContagem(c);
    setUso(u);
  }, []);

  useEffect(() => {
    recarregar();
    ultimaImportacao().then(setUltima).catch(() => undefined);
  }, [recarregar]);

  const exportar = async () => {
    setOcupado('exportar');
    try {
      const backup = await exportarBackup();
      // No app empacotado o destino sai do dialogo nativo; na web cai no
      // download do navegador, que e o comportamento de antes.
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

  /**
   * Restaurar backup: no app empacotado o caminho vem do dialogo nativo do
   * sistema; na web continua sendo o <input type="file">, que a suite
   * Playwright usa. Os dois soabrem o arquivo, a senha continua exigida.
   */
  const escolherBackup = async () => {
    if (!isTauri()) {
      inputBackup.current?.click();
      return;
    }
    setOcupado('escolher');
    try {
      const texto = await abrirArquivo();
      if (texto === null) return;
      pedirSenha({ nome: 'arquivo selecionado', texto });
    } catch (e) {
      console.error('Failed to open backup:', e);
      onAviso('error', 'Não foi possível abrir o arquivo.');
    } finally {
      setOcupado(null);
    }
  };

  const exportarConfig = async () => {
    setOcupado('config-exportar');
    try {
      const arquivo = await exportarConfiguracoes();
      baixarArquivo(arquivo.nome, arquivo.conteudo);
      onAviso('success', `Configurações exportadas: ${arquivo.nome}`);
    } catch (e) {
      console.error('Failed to export settings:', e);
      onAviso('error', 'Não foi possível gerar o arquivo de configurações.');
    } finally {
      setOcupado(null);
    }
  };

  const importarConfig = async (arquivo: File, modo: 'substituir' | 'mesclar') => {
    setOcupado('config-importar');
    try {
      const texto = await lerArquivoComoTexto(arquivo);
      const resultado = await importarConfiguracoes(texto, modo);
      if (!resultado.ok) {
        onAviso('error', resultado.erro || 'Arquivo inválido.');
        return;
      }
      // a config vive em varias telas (menu, impressao, termos): recarregar aqui
      // evita que a tela finja que nada mudou
      await loadConfig();
      await recarregar();
      const marca = await ultimaImportacao();
      setUltima(marca);
      onAviso(
        'success',
        `Configurações importadas${resultado.resumo ? `: ${resultado.resumo}` : '.'} ` +
          'Nenhum dado de paciente veio junto.'
      );
    } catch (e) {
      console.error('Failed to import settings:', e);
      onAviso('error', 'Não foi possível ler o arquivo de configurações.');
    } finally {
      setOcupado(null);
    }
  };

  /**
   * Guarda o arquivo escolhido e abre a pedido de senha. Nada e gravado antes
   * da conferida.
   */
  const pedirSenha = (entrada: { nome: string; texto: string }) => {
    setPendente(entrada);
    setSenha('');
    setErroSenha('');
  };

  const confirmarSenha = async () => {
    if (!pendente) return;
    setOcupado('importar');
    const confere = await authService.confirmarSenha(senha);
    if (!confere) {
      setErroSenha('Senha incorreta.');
      setOcupado(null);
      return;
    }
    const entrada = pendente;
    setPendente(null);
    setSenha('');
    await restaurar(entrada.texto);
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
      if (inputBackup.current) inputBackup.current.value = '';
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
              if (!arquivo) return;
              void lerArquivoComoTexto(arquivo)
                .then((texto) => pedirSenha({ nome: arquivo.name, texto }))
                .catch(() => onAviso('error', 'Não foi possível ler o arquivo.'));
            }}
          />
        </div>
        <div className="small muted">
          Restaurar substitui tudo: pacientes, equipe, serviços, agenda e termos. Exporte antes.
        </div>
      </div>

      <div className="stack">
        <div className="preview-box">
          <h4>Compartilhar configurações com outra pessoa</h4>
          <p className="small muted" style={{ margin: '0 0 8px' }}>
            Gera um arquivo só com a identidade da clínica, a marca, os textos e os modelos de
            termo. Serve para outra pessoa da mesma clínica começar com tudo preenchido — e para
            você levar suas configurações a outro computador. <strong>Não entra nenhum dado de
            paciente</strong>, nem agendamento, nem termo registrado, nem senha.
          </p>

          <div className="row">
            <Button
              variant="primary"
              size="sm"
              onClick={exportarConfig}
              disabled={ocupado !== null}
              aria-label="Exportar configurações"
            >
              Exportar configurações
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setModoImport('substituir');
                inputConfig.current?.click();
              }}
              disabled={ocupado !== null}
              aria-label="Importar configurações substituindo"
            >
              Importar substituindo
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setModoImport('mesclar');
                inputConfig.current?.click();
              }}
              disabled={ocupado !== null}
              aria-label="Importar completando vazios"
            >
              Importar completando vazios
            </Button>
            <input
              ref={inputConfig}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Arquivo de configurações"
              onChange={(e) => {
                const arquivo = e.currentTarget.files?.[0];
                const modo = modoImport;
                // zerar o valor permite escolher o mesmo arquivo duas vezes
                e.currentTarget.value = '';
                if (arquivo && modo) void importarConfig(arquivo, modo);
              }}
            />
          </div>

          <div className="small muted" style={{ marginTop: 8 }}>
            <strong>Substituindo</strong> troca tudo que está em Configurações pelo conteúdo do
            arquivo. <strong>Completando vazios</strong> só preenche o que estiver em branco, e
            preserva o que você já ajustou.
          </div>

          {ultima && (
            <div className="small muted" style={{ marginTop: 6 }} data-testid="ultima-importacao">
              Última importação: <strong>{ultima.origem}</strong>
              {ultima.modo === 'mesclar' ? ' (completando vazios)' : ' (substituindo)'}.
            </div>
          )}
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

        {!somenteBackup && (
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
        )}

        {somenteBackup && (
          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="card-body stack">
              <div>
                <strong>Backup</strong>
                <div className="small muted">
                  Guarde uma cópia dos dados de tempos em tempos: o prontuário vive só neste
                  navegador, e limpá-lo ou trocar o navegador é decisão de quem usa.
                </div>
              </div>
            </div>
          </div>
        )}
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
      {pendente && (
        <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="dp-senha">
          <div className="modal-backdrop" onClick={() => setPendente(null)} />
          <div className="modal sm">
            <div className="modal-head">
              <h3 id="dp-senha">Confirmar com a sua senha</h3>
              <button
                className="password-toggle"
                style={{ position: 'static' }}
                onClick={() => setPendente(null)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="small">
                Restaurar <strong>{pendente.nome}</strong> substitui tudo o que está neste navegador. Digite
                a sua senha atual para confirmar.
              </p>
              <div className="form-field mt-4">
                <label className="form-label" htmlFor="dp-senha-input">
                  Senha atual
                </label>
                <input
                  id="dp-senha-input"
                  type="password"
                  className={`form-input ${erroSenha ? 'error' : ''}`}
                  value={senha}
                  autoFocus
                  autoComplete="current-password"
                  onChange={(e) => { setSenha(e.currentTarget.value); setErroSenha(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') confirmarSenha(); }}
                />
                {erroSenha && <span className="field-erro">{erroSenha}</span>}
              </div>
            </div>
            <div className="modal-foot">
              <Button variant="secondary" onClick={() => setPendente(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={confirmarSenha}
                disabled={senha.length === 0 || ocupado !== null}
                aria-label="Confirmar restauração"
              >
                Restaurar backup
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
