const { app, BrowserWindow, WebContentsView, session, ipcMain } = require('electron');
const path = require('path');
const { ElectronChromeExtensions } = require('electron-chrome-extensions');

const HOME = 'https://serviceonline.bihar.gov.in';
const SIDEBAR = 72, TOPBAR = 56, PANEL = 520;
let win, portal, panel, mode = 'app', ext;

async function createWindow() {
  const ses = session.fromPartition('persist:main'); // login/cookies yaad rahenge

  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 640,
    title: 'Click & Continue', backgroundColor: '#0b1220',
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#0b1220', symbolColor: '#e8edf7', height: TOPBAR },
    icon: path.join(__dirname, 'build/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), session: ses },
  });

  // chrome.tabs / chrome.runtime etc. shim for the extension
  ext = new ElectronChromeExtensions({
    license: 'GPL-3.0', session: ses,
    createTab: async () => { throw new Error('Not supported'); },
    selectTab: () => {}, removeTab: () => {},
  });

  const loaded = await ses.extensions.loadExtension(path.join(__dirname, 'extension'), { allowFileAccess: true });

  portal = new WebContentsView({ webPreferences: { session: ses } });
  panel = new WebContentsView({ webPreferences: { session: ses } });
  win.contentView.addChildView(portal);
  win.contentView.addChildView(panel);

  ext.addTab(portal.webContents, win);
  ext.selectTab(portal.webContents);

  win.loadFile(path.join(__dirname, 'shell/index.html'));
  portal.webContents.loadURL(HOME);
  panel.webContents.loadURL(`chrome-extension://${loaded.id}/popup.html`);

  const sendUrl = (l) => win.webContents.send('url', portal.webContents.getURL(), l);
  portal.webContents.on('did-navigate', () => sendUrl(false));
  portal.webContents.on('did-navigate-in-page', () => sendUrl(false));
  portal.webContents.on('did-start-loading', () => sendUrl(true));
  portal.webContents.on('did-stop-loading', () => sendUrl(false));
  portal.webContents.setWindowOpenHandler(({ url }) => { portal.webContents.loadURL(url); return { action: 'deny' }; });

  win.on('resize', layout); win.on('maximize', layout); win.on('unmaximize', layout);
  layout();
}

function layout() {
  const [w, h] = win.getContentSize();
  const x = SIDEBAR, y = TOPBAR, cw = w - SIDEBAR, ch = h - TOPBAR;
  const pw = mode === 'split' ? PANEL : 0;
  portal.setVisible(mode !== 'app');
  panel.setVisible(mode !== 'portal');
  portal.setBounds({ x, y, width: Math.max(0, cw - pw), height: ch });
  panel.setBounds(mode === 'app' ? { x, y, width: cw, height: ch } : { x: w - pw, y, width: pw, height: ch });
  win.webContents.send('mode', mode);
}

ipcMain.on('nav', (_, a, url) => {
  const wc = portal.webContents;
  if (a === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
  if (a === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
  if (a === 'reload') wc.reload();
  if (a === 'home') wc.loadURL(HOME);
  if (a === 'go' && /^https:\/\/(serviceonline|swcs)\.bihar\.gov\.in/.test(url)) wc.loadURL(url);
});
ipcMain.on('mode', (_, md) => { mode = md; layout(); });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
