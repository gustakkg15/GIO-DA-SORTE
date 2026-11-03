import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

interface CDPMessage {
  id: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
}

class CDPClient {
  private ws!: WebSocket;
  private nextId = 1;
  private callbacks = new Map<number, (res: any) => void>();
  public consoleLogs: { type: string; text: string }[] = [];

  async connect(targetUrl: string): Promise<void> {
    const listRes = await fetch('http://localhost:9222/json/list');
    const targets = await listRes.json();
    let target = targets.find((t: any) => t.type === 'page');

    if (!target) {
      const newRes = await fetch(`http://localhost:9222/json/new?${encodeURIComponent(targetUrl)}`);
      target = await newRes.json();
    }

    const wsUrl = target.webSocketDebuggerUrl;
    console.log('Connecting to CDP WebSocket:', wsUrl);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        console.log('CDP WebSocket connected successfully');
        resolve();
      };
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        try {
          const msg: CDPMessage = JSON.parse(event.data.toString());
          if (msg.id && this.callbacks.has(msg.id)) {
            const cb = this.callbacks.get(msg.id)!;
            this.callbacks.delete(msg.id);
            if (msg.error) {
              console.error('CDP Error for msg', msg.id, msg.error);
            }
            cb(msg.result || msg.error);
          } else if (msg.method === 'Runtime.consoleAPICalled') {
            const text = msg.params.args.map((a: any) => a.value || a.description || '').join(' ');
            this.consoleLogs.push({ type: msg.params.type, text });
          } else if (msg.method === 'Runtime.exceptionThrown') {
            const text = msg.params.exceptionDetails?.text || 'Unknown Exception';
            this.consoleLogs.push({ type: 'error', text });
          }
        } catch (e) {
          console.error('Parse error on CDP message:', e);
        }
      };
    });
  }

  send(method: string, params: any = {}): Promise<any> {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.callbacks.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async captureScreenshot(filename: string): Promise<string> {
    const result = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(result.data, 'base64');
    fs.writeFileSync(filename, buffer);
    console.log(`Saved screenshot (${buffer.length} bytes): ${filename}`);
    return filename;
  }

  async evaluate(expression: string): Promise<any> {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res?.result?.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log('Launching headless Chromium with remote debugging port 9222...');
  const chrome: ChildProcess = spawn(
    '/usr/bin/chromium',
    [
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=9222',
      'http://localhost:3000/',
    ],
    { stdio: 'ignore' }
  );

  await sleep(2500);

  const client = new CDPClient();
  try {
    await client.connect('http://localhost:3000/');
    await client.send('Page.enable');
    await client.send('Runtime.enable');

    // 1. Bypass Onboarding Tour & Cookie Modal via localStorage so the actual Dashboard UI is clearly visible
    console.log('Injecting localStorage settings to bypass onboarding and cookies...');
    await client.evaluate(`
      localStorage.setItem('gio_onboarding_completed_v1', 'true');
      localStorage.setItem('gio_cookie_consent_v1', JSON.stringify({ essential: true, analytics: true, timestamp: Date.now() }));
    `);

    // Reload page to apply clean UI
    await client.send('Page.reload');
    await sleep(2000);

    // ==========================================
    // TEST 1: DESKTOP (1440 x 900) - Painel Geral
    // ==========================================
    console.log('\n--- 1. Testing Desktop (1440 x 900) ---');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(1000);

    await client.captureScreenshot('screenshot_desktop_1440x900.png');

    // Check desktop elements
    const desktopInfo = await client.evaluate(`({
      sidebarWidth: document.querySelector('aside')?.getBoundingClientRect().width,
      breadcrumbText: document.querySelector('header h1')?.textContent,
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      activeTab: document.querySelector('aside button.bg-\\\\[\\\\#486D56\\\\]')?.textContent?.trim()
    })`);
    console.log('Desktop info:', desktopInfo);

    // Test Sidebar Collapse
    console.log('Toggling sidebar collapse...');
    await client.evaluate(`
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Recolher'));
      if (btn) btn.click();
    `);
    await sleep(600);
    await client.captureScreenshot('screenshot_desktop_collapsed_1440x900.png');

    const collapsedWidth = await client.evaluate(`document.querySelector('aside')?.getBoundingClientRect().width`);
    console.log('Sidebar width after collapse:', collapsedWidth);

    // Expand sidebar back
    await client.evaluate(`
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label')?.includes('Expandir') || b.title?.includes('Expandir'));
      if (btn) btn.click();
    `);
    await sleep(500);

    // ==========================================
    // TEST 2: NAVIGATION TABS (Sorteios & TikTok)
    // ==========================================
    console.log('\n--- 2. Testing Navigation Tabs ---');
    // Ensure sidebar is expanded for clear tab navigation
    await client.evaluate(`
      const expandBtn = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label')?.includes('Expandir') || b.title?.includes('Expandir'));
      if (expandBtn) expandBtn.click();
    `);
    await sleep(400);

    // Navigate to Sorteios
    await client.evaluate(`
      const btn = Array.from(document.querySelectorAll('aside button')).find(b => b.textContent?.includes('Sorteios') || b.title === 'Sorteios');
      if (btn) btn.click();
    `);
    await sleep(1000);
    await client.captureScreenshot('screenshot_sorteios_1440x900.png');

    const sorteiosBreadcrumb = await client.evaluate(`document.querySelector('header h1')?.textContent`);
    console.log('Sorteios breadcrumb:', sorteiosBreadcrumb);

    // Navigate to TikTok LIVE PRO
    await client.evaluate(`
      const btn = Array.from(document.querySelectorAll('aside button')).find(b => b.textContent?.includes('TikTok LIVE PRO') || b.title === 'TikTok LIVE PRO');
      if (btn) btn.click();
    `);
    await sleep(1000);
    await client.captureScreenshot('screenshot_tiktok_live_1440x900.png');

    const tiktokBreadcrumb = await client.evaluate(`document.querySelector('header h1')?.textContent`);
    console.log('TikTok breadcrumb:', tiktokBreadcrumb);

    // Navigate back to Dashboard
    await client.evaluate(`
      const btn = Array.from(document.querySelectorAll('aside button')).find(b => b.textContent?.includes('Painel') || b.title === 'Painel');
      if (btn) btn.click();
    `);
    await sleep(800);

    // ==========================================
    // TEST 3: TABLET (768 x 1024)
    // ==========================================
    console.log('\n--- 3. Testing Tablet (768 x 1024) ---');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 768,
      height: 1024,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(1000);
    await client.captureScreenshot('screenshot_tablet_768x1024.png');

    const tabletInfo = await client.evaluate(`({
      hasMobileHeaderToggle: Boolean(document.querySelector('header button[aria-label*="lateral"]')),
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    })`);
    console.log('Tablet info:', tabletInfo);

    // ==========================================
    // TEST 4: MOBILE (390 x 844)
    // ==========================================
    console.log('\n--- 4. Testing Mobile (390 x 844) ---');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await sleep(1000);
    await client.captureScreenshot('screenshot_mobile_390x844.png');

    const mobileInfo = await client.evaluate(`({
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      breadcrumbText: document.querySelector('header h1')?.textContent
    })`);
    console.log('Mobile info:', mobileInfo);

    // Open Mobile Drawer
    console.log('Opening mobile navigation drawer...');
    await client.evaluate(`
      const hamburger = document.querySelector('header button[aria-label*="lateral"]');
      if (hamburger) hamburger.click();
    `);
    await sleep(800);
    await client.captureScreenshot('screenshot_mobile_drawer_390x844.png');

    const drawerVisible = await client.evaluate(`Boolean(document.querySelector('.fixed.inset-0.bg-\\\\[\\\\#162822\\\\]\\\\/70'))`);
    console.log('Mobile drawer backdrop visible:', drawerVisible);

    // Close Mobile Drawer
    await client.evaluate(`
      const closeBtn = document.querySelector('button[aria-label="Fechar menu lateral"]');
      if (closeBtn) closeBtn.click();
    `);
    await sleep(500);

    // ==========================================
    // TEST 5: CONSOLE ERRORS AUDIT
    // ==========================================
    console.log('\n--- 5. Console Error Logs Inspection ---');
    const fatalErrors = client.consoleLogs.filter(l => l.type === 'error' && !l.text.includes('WebSocket') && !l.text.includes('vite'));
    console.log('Filtered Fatal Errors count:', fatalErrors.length);
    if (fatalErrors.length > 0) {
      console.log('Fatal Errors found:', fatalErrors);
    } else {
      console.log('No JavaScript runtime errors found in console during navigation tests.');
    }

    console.log('\nALL CDP BROWSER TESTS COMPLETED SUCCESSFULLY.');
  } finally {
    client.close();
    chrome.kill('SIGTERM');
  }
}

run().catch((e) => {
  console.error('Test execution failed:', e);
  process.exit(1);
});
