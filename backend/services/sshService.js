const { Client } = require('ssh2');
const fs = require('fs');

function runSSHProcess({ username, password, serverName, port, zipPath, zipName, instanceName, emitter }) {
  const host = 'uat.orangehrm.com';
  const remoteHome = `/home/${username}`;
  const remoteZipPath = `${remoteHome}/${zipName}`;
  const fullInstanceName = `${instanceName}-os-${serverName}.orangehrm.com`;
  const opensourcePath = `/var/www/html/OHRMStandalone/OPENSOURCE`;

  const conn = new Client();

  function log(text) {
    emitter.emit('line', { type: 'output', text });
  }

  function logCmd(cmd) {
    emitter.emit('line', { type: 'command', text: `$ ${cmd}` });
  }

  function execCommand(command) {
    return new Promise((resolve, reject) => {
      logCmd(command);
      conn.exec(command, (err, stream) => {
        if (err) return reject(err);

        let output = '';
        stream.on('data', (data) => {
          const text = data.toString();
          output += text;
          log(text);
        });
        stream.stderr.on('data', (data) => {
          const text = data.toString();
          output += text;
          log(text);
        });
        stream.on('close', (code) => {
          if (code !== 0 && code !== null) {
            reject(new Error(`Command failed (exit ${code}): ${command}`));
          } else {
            resolve(output.trim());
          }
        });
      });
    });
  }

  // Runs a sudo command by piping the password via stdin to avoid interactive prompts
  function execSudo(command) {
    const escapedPw = password.replace(/'/g, "'\\''");
    const full = `echo '${escapedPw}' | sudo -S -p '' ${command}`;
    logCmd(`sudo ${command}`);
    return new Promise((resolve, reject) => {
      conn.exec(full, (err, stream) => {
        if (err) return reject(err);
        let output = '';
        stream.on('data', (data) => {
          const text = data.toString();
          output += text;
          log(text);
        });
        stream.stderr.on('data', (data) => {
          const text = data.toString();
          // suppress the "[sudo] password for …" prompt line
          const filtered = text.split('\n').filter(l => !l.includes('[sudo]')).join('\n');
          if (filtered.trim()) log(filtered);
        });
        stream.on('close', () => resolve(output.trim()));
      });
    });
  }

  conn.on('ready', async () => {
    log(`Connected to ${host}\n`);
    try {
      // ── Step 1: SFTP upload ──────────────────────────────────────────
      log(`\n[1/8] Uploading ${zipName} to ${remoteHome} ...\n`);
      await new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) return reject(err);
          logCmd(`sftp put ${zipName} → ${remoteZipPath}`);
          const read = fs.createReadStream(zipPath);
          const write = sftp.createWriteStream(remoteZipPath);
          write.on('close', () => { log('File uploaded.\n'); resolve(); });
          write.on('error', reject);
          read.pipe(write);
        });
      });

      // ── Step 2: derive directory name from zip filename ─────────────
      log(`\n[2/8] Inspecting zip contents ...\n`);
      const actualDir = zipName.replace(/\.zip$/i, '');
      log(`Target directory: ${actualDir}\n`);

      // ── Step 3: unzip ────────────────────────────────────────────────
      log(`\n[3/8] Unzipping file ...\n`);
      await execCommand(`cd ${remoteHome} && unzip -o ${remoteZipPath}`);
      log('Extraction complete.\n');

      // ── Step 4: mkdir web && mv unzipped → web/ ──────────────────────
      log(`\n[4/8] Creating web directory and moving files ...\n`);
      await execCommand(`cd ${remoteHome} && mv ${actualDir}/ web/`);

      // ── Step 5: mkdir symfony && mv web/ → symfony/ ──────────────────
      log(`\n[5/8] Creating symfony directory and moving web ...\n`);
      await execCommand(`cd ${remoteHome} && mkdir -p symfony && mv web/ symfony/`);

      // ── Step 6: mkdir instance && mv symfony/ → instance/ ────────────
      log(`\n[6/8] Creating instance directory: ${fullInstanceName} ...\n`);
      await execCommand(`cd ${remoteHome} && mkdir -p ${fullInstanceName} && mv symfony/ ${fullInstanceName}/`);

      // ── Step 7: sudo cp to OPENSOURCE ────────────────────────────────
      log(`\n[7/8] Copying instance to ${opensourcePath} ...\n`);
      await execSudo(`cp -R ${remoteHome}/${fullInstanceName}/ ${opensourcePath}/`);

      // ── Step 8: permissions ───────────────────────────────────────────
      log(`\n[8/8] Setting permissions ...\n`);
      await execSudo(`chown -R ${username}:apache ${opensourcePath}/${fullInstanceName}/`);
      await execSudo(`chmod -R 775 ${opensourcePath}/${fullInstanceName}/`);

      log(`\n✓ All steps completed successfully.\n`);
      emitter.emit('line', { type: 'success', text: fullInstanceName });

    } catch (err) {
      log(`\n✗ ${err.message}\n`);
      emitter.emit('line', { type: 'error', text: err.message });
    } finally {
      conn.end();
      fs.unlink(zipPath, () => {});
      emitter.emit('done');
    }
  });

  conn.on('error', (err) => {
    emitter.emit('line', { type: 'error', text: `SSH connection error: ${err.message}` });
    emitter.emit('done');
  });

  conn.connect({ host, port: parseInt(port, 10), username, password });
}

module.exports = { runSSHProcess };
