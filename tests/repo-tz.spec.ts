import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Regressao de fuso: `new Date('2026-09-28')` e UTC midnight, e aplicar
 * setHours no fuso local voltava um dia em fusos negativos (UTC-3), fazendo a
 * agenda nunca achar as sessoes do dia. Estes testes chamam o repositorio de
 * verdade, via grafo de modulos do Vite.
 */

const DIA = '2026-09-28';

function iso(dia: string, hora: string) {
  return new Date(`${dia}T${hora}`).toISOString();
}

async function seed(page: Page, appointments: unknown[]) {
  await page.goto('/login');
  await page.evaluate((lista) => {
    localStorage.setItem('clinica-psi-appointments', JSON.stringify(lista));
  }, appointments);
}

test('findByDate acha a sessao dentro do dia local', async ({ page }) => {
  await seed(page, [
    { id: 'a1', patientId: 'p1', serviceId: 's1', professionalId: 'pro1', start: iso(DIA, '09:00'), durationMin: 50, status: 'confirmed', notes: '', createdAt: '', updatedAt: '' },
  ]);

  const achados = await page.evaluate(async (dia) => {
    const { appointmentRepository } = await import('/src/repositories/index.ts');
    return appointmentRepository.findByDate(dia);
  }, DIA);

  expect(achados).toHaveLength(1);
  expect(achados[0].id).toBe('a1');
});

test('findByDate cobre os limites do dia e nao vaza para o dia vizinho', async ({ page }) => {
  await seed(page, [
    { id: 'meia-noite', patientId: 'p', serviceId: 's', professionalId: 'pro', start: iso(DIA, '00:00:00'), durationMin: 10, status: 'scheduled', notes: '', createdAt: '', updatedAt: '' },
    { id: 'fim-do-dia', patientId: 'p', serviceId: 's', professionalId: 'pro', start: iso(DIA, '23:59:00'), durationMin: 10, status: 'scheduled', notes: '', createdAt: '', updatedAt: '' },
    { id: 'dia-anterior', patientId: 'p', serviceId: 's', professionalId: 'pro', start: iso('2026-09-27', '23:30:00'), durationMin: 10, status: 'scheduled', notes: '', createdAt: '', updatedAt: '' },
    { id: 'dia-seguinte', patientId: 'p', serviceId: 's', professionalId: 'pro', start: iso('2026-09-29', '00:30:00'), durationMin: 10, status: 'scheduled', notes: '', createdAt: '', updatedAt: '' },
  ]);

  const achados = await page.evaluate(async (dia) => {
    const { appointmentRepository } = await import('/src/repositories/index.ts');
    return (await appointmentRepository.findByDate(dia)).map((a) => a.id).sort();
  }, DIA);

  expect(achados).toEqual(['fim-do-dia', 'meia-noite']);
});

test('findByProfessional com data usa o mesmo dia local', async ({ page }) => {
  await seed(page, [
    { id: 'minha', patientId: 'p', serviceId: 's', professionalId: 'pro1', start: iso(DIA, '14:00'), durationMin: 50, status: 'scheduled', notes: '', createdAt: '', updatedAt: '' },
    { id: 'outro-pro', patientId: 'p', serviceId: 's', professionalId: 'pro2', start: iso(DIA, '14:00'), durationMin: 50, status: 'scheduled', notes: '', createdAt: '', updatedAt: '' },
    { id: 'ontem', patientId: 'p', serviceId: 's', professionalId: 'pro1', start: iso('2026-09-27', '14:00'), durationMin: 50, status: 'scheduled', notes: '', createdAt: '', updatedAt: '' },
  ]);

  const achados = await page.evaluate(async ({ dia }) => {
    const { appointmentRepository } = await import('/src/repositories/index.ts');
    return (await appointmentRepository.findByProfessional('pro1', dia)).map((a) => a.id);
  }, { dia: DIA });

  expect(achados).toEqual(['minha']);
});

test('conflito respeita a duracao atravessando a virada do dia', async ({ page }) => {
  // 23:30 + 50min termina 00:20 do dia seguinte
  await seed(page, [
    { id: 'fim', patientId: 'p', serviceId: 's', professionalId: 'pro1', start: iso(DIA, '23:30:00'), durationMin: 50, status: 'scheduled', notes: '', createdAt: '', updatedAt: '' },
  ]);

  const conflitos = await page.evaluate(async ({ inicio, duracao }) => {
    const { appointmentRepository } = await import('/src/repositories/index.ts');
    return (await appointmentRepository.findConflicts('pro1', inicio, duracao)).map((a) => a.id);
  }, { inicio: iso('2026-09-29', '00:00:00'), duracao: 50 });

  // 00:00 ainda esta dentro da sessao das 23:30 -> conflita
  expect(conflitos).toEqual(['fim']);

  // 00:30 esta depois do fim (00:20) -> nao conflita
  const depois = await page.evaluate(async ({ inicio }) => {
    const { appointmentRepository } = await import('/src/repositories/index.ts');
    return (await appointmentRepository.findConflicts('pro1', inicio, 50)).map((a) => a.id);
  }, { inicio: iso('2026-09-29', '00:30:00') });

  expect(depois).toEqual([]);
});

test('localToday devolve a data local, nao a data UTC', async ({ page }) => {
  await page.goto('/login');
  const resultado = await page.evaluate(async () => {
    const { localToday } = await import('/src/repositories/AppointmentRepository.ts');
    const agora = new Date();
    const esperado = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    return { obtido: localToday(), esperado };
  });

  expect(resultado.obtido).toBe(resultado.esperado);
});
