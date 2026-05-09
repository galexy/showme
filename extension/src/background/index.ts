import { createLogger } from '../shared/logger';
import type { ExtensionMessage, SelectionPayload } from '../shared/types';

const log = createLogger('background');

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .then(() => log.info('Side panel behaviour set'))
  .catch((err) => log.error('setPanelBehavior failed', { error: String(err) }));

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  log.debug('Message received', { type: message.type, tabId: sender.tab?.id });

  if (message.type === 'SELECTION_CAPTURED') {
    const payload = (message as { type: 'SELECTION_CAPTURED'; payload: SelectionPayload }).payload;
    chrome.storage.session
      .set({ currentSelection: payload })
      .then(() => {
        log.info('Selection stored in session', {
          id: payload.id,
          kind: payload.kind,
          tabId: sender.tab?.id,
        });
        sendResponse({ ok: true });
      })
      .catch((err) => log.error('Failed to store selection', { error: String(err) }));
    return true;
  }

  if (message.type === 'PICKER_START' || message.type === 'PICKER_STOP') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId) return;
      chrome.tabs.sendMessage(tabId, message).catch((err) =>
        log.warn('Could not forward picker message to content script', { error: String(err) }),
      );
    });
  }
});

log.info('Background service worker initialised');
