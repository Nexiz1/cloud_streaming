const express = require('express');
const router = express.Router();
const provider = require('../../lib/providers');

router.get('/', async (req, res) => {
  try {
    const instances = await provider.listInstances();
    res.json(instances);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:name', async (req, res) => {
  try {
    const instance = await provider.getInstance(req.params.name);
    if (!instance) return res.status(404).json({ error: "Not found" });
    res.json(instance);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:name/start', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.write('Command initiated...\n');
  
  const child = provider.spawnCommand(['start', req.params.name, '--wait']);
  
  child.stdout.on('data', (data) => {
    res.write(data.toString());
  });

  child.stderr.on('data', (data) => {
    res.write(data.toString());
  });

  child.on('close', (code) => {
    res.write(`\nProcess exited with code ${code}\n`);
    res.end();
  });

  child.on('error', (err) => {
    res.write(`\nFailed to start process: ${err.message}\n`);
    res.end();
  });
});

router.post('/:name/stop', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.write('Command initiated...\n');
  
  const child = provider.spawnCommand(['stop', req.params.name, '--wait']);
  
  child.stdout.on('data', (data) => {
    res.write(data.toString());
  });

  child.stderr.on('data', (data) => {
    res.write(data.toString());
  });

  child.on('close', (code) => {
    res.write(`\nProcess exited with code ${code}\n`);
    res.end();
  });

  child.on('error', (err) => {
    res.write(`\nFailed to start process: ${err.message}\n`);
    res.end();
  });
});

router.post('/:name/restart', async (req, res) => {
  try {
    const result = await provider.restartInstance(req.params.name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:name/pair', async (req, res) => {
  try {
    const { pin } = req.body || {};
    if (!pin) throw new Error('PIN is required');

    const name = req.params.name;
    const output = await provider.runCommand(['get', name]);
    const info = JSON.parse(output);

    const host = info.provision?.output?.host;
    const sshUser = info.provision?.input?.ssh?.user;
    const sshKeyB64 = info.provision?.input?.ssh?.privateKeyContentBase64;
    const sunUser = info.configuration?.input?.sunshine?.username;
    const sunPassB64 = info.configuration?.input?.sunshine?.passwordBase64;

    if (!host || !sshUser || !sshKeyB64 || !sunUser || !sunPassB64) {
      throw new Error('인스턴스 구성 정보(SSH/Sunshine)가 부족하여 페어링을 진행할 수 없습니다.');
    }

    const sunPass = Buffer.from(sunPassB64, 'base64').toString('utf8');
    const sshKey = Buffer.from(sshKeyB64, 'base64').toString('utf8');

    const os = require('node:os');
    const path = require('node:path');
    const fs = require('node:fs/promises');
    const util = require('node:util');
    const execAsync = util.promisify(require('node:child_process').exec);

    const keyPath = path.join(os.tmpdir(), `cloudypad_ssh_key_${name}`);
    await fs.writeFile(keyPath, sshKey, { mode: 0o600 });

    const scriptPath = path.join(os.tmpdir(), `cloudypad_curl_${name}.sh`);
    const curlCmd = `curl -s -u ${sunUser}:${sunPass} -X POST -k https://localhost:47990/api/pin -H 'Content-Type: application/json' -d '{"pin":"${pin}","name":"${name}"}'`;
    await fs.writeFile(scriptPath, curlCmd);
    
    const sshCmd = `ssh -o StrictHostKeyChecking=no -i ${keyPath} ${sshUser}@${host} bash -s < ${scriptPath}`;
    const { stdout, stderr } = await execAsync(sshCmd);
    
    // cleanup
    await fs.unlink(keyPath).catch(() => {});
    await fs.unlink(scriptPath).catch(() => {});

    try {
      const result = JSON.parse(stdout);
      if (result.status === 'true' || result.status === true) {
        res.json({ ok: true });
      } else {
        throw new Error('Sunshine API returned false');
      }
    } catch (parseErr) {
      console.error('Pair stdout:', stdout);
      console.error('Pair stderr:', stderr);
      throw new Error(`Sunshine API 응답 파싱 실패: ${stdout}`);
    }

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:name/destroy', async (req, res) => {
  try {
    const result = await provider.destroyInstance(req.params.name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:name/update', async (req, res) => {
  try {
    const { 
      rootDiskSize = 30,
      diskSize = 100,
      spot = false,
      autostop = true,
      timeout = 600
    } = req.body;

    const options = [
      '--root-disk-size', rootDiskSize.toString(),
      '--data-disk-size', diskSize.toString(),
      '--spot', spot ? 'true' : 'false'
    ];

    if (autostop) {
      options.push('--autostop', '--autostop-timeout', timeout.toString());
    } else {
      options.push('--autostop', 'false');
    }

    const result = await provider.updateInstance(req.params.name, options);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
