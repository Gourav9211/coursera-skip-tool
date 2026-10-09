const TYPE_LABELS = {
  lecture: 'Lecture (Video)',
  supplement: 'Supplement (Reading)',
  quiz: 'Quiz',
  programming: 'Programming',
};

function showAlert(type, message) {
  const el = document.getElementById('result-alert');
  el.style.display = 'block';
  el.style.background = type === 'error' ? 'var(--error-bg)' : 'rgba(16, 185, 129, 0.1)';
  el.style.borderColor = type === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)';
  el.style.color = type === 'error' ? 'var(--error-text)' : '#10b981';
  el.textContent = message;
}

function hideAlert() {
  const el = document.getElementById('result-alert');
  el.style.display = 'none';
  el.textContent = '';
}

function setLoading(btnId, loading, text) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
  if (text) {
    btn.querySelector('.btn-text').textContent = text;
  }
}

async function getActiveCourseraTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.startsWith('https://www.coursera.org')) {
    return null;
  }
  return tab;
}

async function loadContext() {
  try {
    const tab = await getActiveCourseraTab();
    if (!tab) throw new Error('Not on Coursera');

    const context = await chrome.tabs.sendMessage(tab.id, { action: 'getContext' });
    if (!context || context.error || !context.itemType) {
      throw new Error(context?.error || 'No context');
    }

    document.getElementById('page-status').style.display = 'block';
    document.getElementById('action-buttons').style.display = 'block';
    document.getElementById('empty-msg').style.display = 'none';

    document.getElementById('lbl-type').textContent = TYPE_LABELS[context.itemType] || context.itemType;
    document.getElementById('lbl-item').textContent = context.itemId || '-';
    document.getElementById('lbl-course').textContent = context.courseSlug || '-';

    return context;
  } catch (_) {
    document.getElementById('page-status').style.display = 'none';
    document.getElementById('action-buttons').style.display = 'none';
    document.getElementById('empty-msg').style.display = 'block';
    return null;
  }
}

async function markCompleted() {
  hideAlert();
  setLoading('btn-skip-current', true, 'Working...');

  try {
    const tab = await getActiveCourseraTab();
    if (!tab) throw new Error('Please open a Coursera lesson page first.');

    const result = await chrome.tabs.sendMessage(tab.id, { action: 'markCompleted' });
    if (result && result.success) {
      showAlert('success', '✅ Completed! Reloading the page...');
      setTimeout(() => {
        chrome.tabs.reload(tab.id);
      }, 1500);
    } else {
      showAlert('error', result?.error || 'Unknown error. Check the Console (F12).');
    }
  } catch (error) {
    showAlert('error', error.message);
  } finally {
    setLoading('btn-skip-current', false, 'Complete Current Item');
  }
}

document.getElementById('btn-skip-current').addEventListener('click', markCompleted);

document.getElementById('btn-skip-all').addEventListener('click', async () => {
  hideAlert();
  setLoading('btn-skip-all', true, 'Starting...');
  
  const progContainer = document.getElementById('bulk-progress-container');
  const progMsg = document.getElementById('bulk-progress-msg');
  const progBar = document.getElementById('bulk-progress-bar');
  const progPct = document.getElementById('bulk-progress-pct');
  
  progContainer.style.display = 'block';
  progMsg.textContent = 'Initializing...';
  progBar.style.width = '0%';
  progPct.textContent = '0%';

  try {
    const tab = await getActiveCourseraTab();
    if (!tab) throw new Error('Please open a Coursera lesson page first.');

    const result = await chrome.tabs.sendMessage(tab.id, { action: 'markAllCompleted' });
    if (!result || !result.success) {
      throw new Error(result?.error || 'Unknown error while starting.');
    }
  } catch (error) {
    showAlert('error', `Error: ${error.message}`);
    setLoading('btn-skip-all', false, 'Complete Entire Course');
    progContainer.style.display = 'none';
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'progressUpdate') {
    const msg = message.message;
    const progMsg = document.getElementById('bulk-progress-msg');
    const progBar = document.getElementById('bulk-progress-bar');
    const progPct = document.getElementById('bulk-progress-pct');
    
    progMsg.textContent = msg;

    // Parse progress if matching "Processing: X / Y"
    const match = msg.match(/Processing:\s*(\d+)\s*\/\s*(\d+)/);
    if (match) {
      const current = parseInt(match[1]);
      const total = parseInt(match[2]);
      const pct = Math.round((current / total) * 100);
      progBar.style.width = `${pct}%`;
      progPct.textContent = `${pct}%`;
    }
    
    if (msg.includes('✅ Completed all')) {
       setLoading('btn-skip-all', false, 'Complete Entire Course');
       progBar.style.width = '100%';
       progPct.textContent = '100%';
       
       progMsg.textContent = 'Done! Reloading the page automatically...';
       setTimeout(async () => {
         const tab = await getActiveCourseraTab();
         if (tab) chrome.tabs.reload(tab.id);
       }, 2000);
    }
  }
});

document.getElementById('btn-refresh').addEventListener('click', () => {
  hideAlert();
  loadContext();
});

loadContext();
