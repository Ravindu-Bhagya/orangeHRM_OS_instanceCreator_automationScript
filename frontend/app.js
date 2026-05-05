const form        = document.getElementById('instanceForm');
const terminal    = document.getElementById('terminal');
const submitBtn   = document.getElementById('submitBtn');
const btnText     = document.getElementById('btnText');
const btnSpinner  = document.getElementById('btnSpinner');
const statusDot   = document.getElementById('statusDot');
const statusText  = document.getElementById('statusText');
const successBanner   = document.getElementById('successBanner');
const successInstance = document.getElementById('successInstance');
const successEmail    = document.getElementById('successEmail');
const hostPreview     = document.getElementById('hostPreview');
const instancePreview = document.getElementById('instancePreview');
const dropZone    = document.getElementById('dropZone');
const dropLabel   = document.getElementById('dropLabel');
const fileInput   = document.getElementById('zipFile');
const fileChosen  = document.getElementById('fileChosen');
const clearBtn    = document.getElementById('clearBtn');

// ── Live previews ─────────────────────────────────────────────────────────────
function updatePreviews() {
  const server   = document.getElementById('serverName').value.trim();
  const instance = document.getElementById('instanceName').value.trim();
  hostPreview.textContent = server ? `${server}.orangehrm.com` : '...';
  instancePreview.textContent = (server && instance)
    ? `Will create: ${instance}-os-${server}.orangehrm.com`
    : '';
}
document.getElementById('serverName').addEventListener('input', updatePreviews);
document.getElementById('instanceName').addEventListener('input', updatePreviews);

// ── File drop zone ────────────────────────────────────────────────────────────
fileInput.addEventListener('change', () => setFile(fileInput.files[0]));

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const f = e.dataTransfer.files[0];
  if (f && f.name.toLowerCase().endsWith('.zip')) {
    const dt = new DataTransfer();
    dt.items.add(f);
    fileInput.files = dt.files;
    setFile(f);
  }
});

function setFile(f) {
  if (!f) return;
  fileChosen.textContent = f.name;
  dropZone.classList.add('has-file');
  dropLabel.querySelector('span:last-child').textContent = 'File selected — click to change';
}

// ── Terminal helpers ──────────────────────────────────────────────────────────
clearBtn.addEventListener('click', () => { terminal.innerHTML = ''; });

function termLine(text, cls) {
  cls = cls || 'out';
  text.split('\n').forEach(function(line) {
    if (!line.trim()) return;
    const el = document.createElement('div');
    el.className = 'tline ' + cls;
    el.textContent = line;
    terminal.appendChild(el);
  });
  terminal.scrollTop = terminal.scrollHeight;
}

function setStatus(cls, label) {
  statusDot.className = 'status-dot ' + cls;
  statusText.textContent = label;
}

function setBusy(busy) {
  submitBtn.disabled = busy;
  btnText.textContent = busy ? 'Deploying ...' : '▶ Create Instance';
  btnSpinner.hidden = !busy;
}

// ── Form submit ───────────────────────────────────────────────────────────────
form.addEventListener('submit', function(e) {
  e.preventDefault();

  const username   = document.getElementById('username').value.trim();
  const serverName = document.getElementById('serverName').value.trim();
  const port       = document.getElementById('port').value.trim();
  const email      = document.getElementById('email').value.trim();

  terminal.innerHTML = '';
  successBanner.hidden = true;
  setBusy(true);
  setStatus('connecting', 'Connecting ...');

  termLine('$ ssh -p ' + port + ' ' + username + '@uat.orangehrm.com', 'cmd');

  // send request to backend server (not the static file server)
  fetch('http://localhost:3000/api/create-instance', { method: 'POST', body: new FormData(form) })
    .then(function(res) {
      if (!res.ok) return res.json().then(function(b) { throw new Error(b.error || res.statusText); });
      return res.json();
    })
    .then(function(body) {
      const sessionId = body.sessionId;
      setStatus('running', 'Running ...');

      const es = new EventSource('http://localhost:3000/api/terminal/' + sessionId);

      es.onmessage = function(ev) {
        const data = JSON.parse(ev.data);

        if (data.type === 'command') {
          termLine(data.text, 'cmd');
        } else if (data.type === 'success') {
          termLine('\n✓ Instance created: ' + data.text, 'ok');
          successInstance.textContent = data.text;
          successEmail.textContent    = email;
          successBanner.hidden = false;
          successBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          setStatus('done', 'Done');
        } else if (data.type === 'error') {
          termLine('✗ ' + data.text, 'err');
          setStatus('error', 'Failed');
        } else if (data.type === 'done') {
          es.close();
          setBusy(false);
          if (statusText.textContent === 'Running ...') setStatus('idle', 'Finished');
        } else if (data.text) {
          termLine(data.text, 'out');
        }
      };

      es.onerror = function() {
        es.close();
        setStatus('error', 'Connection lost');
        setBusy(false);
      };
    })
    .catch(function(err) {
      termLine('✗ ' + err.message, 'err');
      setStatus('error', 'Failed');
      setBusy(false);
    });
});
