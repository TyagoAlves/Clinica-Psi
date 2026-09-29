/**
 * Visibilidade dos pacientes.
 *
 * A clinica e compartilhada: o mesmo paciente pode ser atendido por mais de um
 * profissional. Ainda assim, quem nao administra nao deveria abrir o prontuario
 * de um colega sem motivo.
 *
 * A regra e:
 *   - administrador ve tudo;
 *   - profissional ve os pacientes sob a responsabilidade dele e os que ainda
 *     nao tem responsavel definido (cadastrados antes deste campo existir, ou
 *     por quem nao tinha a opcao).
 *
 * "Sem responsavel" continua visivel de proposito: se sumisse, quem acabasse
 * de cadastrar um paciente para atender perderia o proprio cadastro da lista,
 * e um paciente criado pela recepcao ficaria invisivel para todo mundo.
 */

import type { Patient, Professional } from '../domain/types';

export function podeVerPaciente(
  patient: Patient,
  me?: Professional | null,
  isAdmin = false
): boolean {
  if (isAdmin) return true;
  if (!me) return false;
  if (!patient.professionalId) return true;
  return patient.professionalId === me.id;
}

/** Recorta a lista mantendo a ordem original. */
export function pacientesVisiveis<T extends Patient>(
  lista: T[],
  me?: Professional | null,
  isAdmin = false
): T[] {
  if (isAdmin) return lista;
  return lista.filter((p) => podeVerPaciente(p, me, isAdmin));
}
