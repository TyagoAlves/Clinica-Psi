import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  /**
   * Uma repeticao local nao serve para esconder bug: erro deterministico falha
   * de novo e o Playwright reporta "failed after 1 retry". O que ela cobre e a
   * outra causa de falha aqui, que e o dev server do Vite responding devagar
   * quando a maquina esta com pouca memoria e o teste inteiro estoura os 30s
   * de espera. PLAYWRIGHT_RETRIES sobrescreve.
   */
  retries: Number(process.env.PLAYWRIGHT_RETRIES) || (process.env.CI ? 2 : 1),
  reporter: 'line',
  /**
   * A maquina de teste tem 8 GB e cada worker segura um Chromium proprio. Com
   * os 6 workers que o Playwright escolheria por padrao, a suite rodava sem
   * memoria: as medicoes de icone (SVG) e as esperas curtas dos testes
   * passavam a falhar aleatoriamente, em arquivos que nem foram mexidos.
   * Tres workers rodam a suite inteira em cerca de um minuto.
   * PLAYWRIGHT_WORKERS sobrescreve quando a maquina aguentar mais.
   */
  workers: Number(process.env.PLAYWRIGHT_WORKERS) || 3,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
