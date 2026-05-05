const { runSSHProcess } = require('../services/sshService');
const { sendInstanceCreatedEmail } = require('../services/emailService');
const { createSession, getSession, deleteSession } = require('../services/sessions');

async function createInstance(req, res) {
  const { username, password, serverName, port, instanceName, email } = req.body;
  const zipFile = req.file;

  if (!username || !password || !serverName || !port || !instanceName || !email || !zipFile) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const { sessionId, emitter } = createSession();

  emitter.once('line', async function onSuccess(data) {
    if (data.type !== 'success') {
      emitter.once('line', onSuccess);
      return;
    }
    try {
      await sendInstanceCreatedEmail({ to: email, instanceName: data.text, serverName });
    } catch (err) {
      console.error('Email send failed:', err.message);
    }
  });

  emitter.once('done', () => {
    setTimeout(() => deleteSession(sessionId), 120_000);
  });

  runSSHProcess({ username, password, serverName, port, zipPath: zipFile.path, zipName: zipFile.originalname, instanceName, emitter });

  res.json({ sessionId });
}

function terminalStream(req, res) {
  const emitter = getSession(req.params.sessionId);
  if (!emitter) return res.status(404).json({ error: 'Session not found.' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const onLine = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const onDone = () => {
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    cleanup();
    res.end();
  };

  function cleanup() {
    emitter.off('line', onLine);
    emitter.off('done', onDone);
  }

  emitter.on('line', onLine);
  emitter.on('done', onDone);
  req.on('close', cleanup);
}

module.exports = { createInstance, terminalStream };
