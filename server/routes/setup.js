const express = require('express');
const router = express.Router();
const { spawn } = require('node:child_process');
const util = require('node:util');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const provider = require('../../lib/providers');
const { verifyCredentials, verifyExistingChain, fileFormatFallback, sanitize } = require('../lib/awsVerify');

const cloudypadDir = path.join(os.homedir(), '.cloudypad');
const flagPath = path.join(cloudypadDir, '.gfn-setup-done');

function isWritable(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.W_OK);
    return true;
  } catch (err) {
    return false;
  }
}

router.get('/status', async (req, res) => {
  try {
    const isDoneFile = fs.existsSync(flagPath);
    const instances = await provider.listInstances();
    const hasInstance = instances && instances.length > 0;
    
    res.json({
      done: isDoneFile && hasInstance,
      hasInstance,
      instanceName: hasInstance ? instances[0].name : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/prereqs', async (req, res) => {
  const result = {
    cloudypad: false,
    awsAuth: false,
    cloudypadHomeWritable: false,
    details: {}
  };

  try {
    try {
      const execAsync = util.promisify(require('node:child_process').exec);
      const cloudypadBin = path.join(os.homedir(), '.cloudypad', 'bin', 'cloudypad');
      const { stdout } = await execAsync(`${cloudypadBin} --version`, { env: { ...process.env, CLOUDYPAD_CONTAINER_NO_TTY: 'true' } });
      result.cloudypad = true;
      result.details.cloudypad = stdout.trim();
    } catch (e) {
      result.details.cloudypadError = e.message;
    }

    try {
      const verifyRes = await verifyExistingChain('ap-northeast-2');
      if (verifyRes.ok) {
        result.awsAuth = true;
        result.details.awsArn = verifyRes.identity.Arn;
      } else {
        result.details.awsError = verifyRes.error;
      }
    } catch (e) {
      // Fallback if SDK fails to load
      const fallbackRes = fileFormatFallback();
      if (fallbackRes.ok) {
        result.awsAuth = true;
        result.details.awsArn = fallbackRes.identity.Arn;
      } else {
        result.details.awsError = sanitize(e.message) + ' / ' + fallbackRes.error;
      }
    }

    if (!fs.existsSync(cloudypadDir)) {
      fs.mkdirSync(cloudypadDir, { recursive: true });
    }
    result.cloudypadHomeWritable = isWritable(cloudypadDir);
  } catch (e) {
    console.error("Prereqs error", e);
  }

  res.json(result);
});

const profilesPath = path.join(cloudypadDir, 'profiles.json');

router.get('/profiles', (req, res) => {
  try {
    if (!fs.existsSync(profilesPath)) {
      return res.json([]);
    }
    const data = fs.readFileSync(profilesPath, 'utf8');
    res.json(JSON.parse(data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/profiles', (req, res) => {
  try {
    if (!fs.existsSync(cloudypadDir)) {
      fs.mkdirSync(cloudypadDir, { recursive: true });
    }
    const profiles = req.body;
    fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const awsCredsPath = path.join(cloudypadDir, 'aws-credentials.json');

function getAwsProfiles() {
  if (!fs.existsSync(awsCredsPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(awsCredsPath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveAwsProfiles(profiles) {
  if (!fs.existsSync(cloudypadDir)) {
    fs.mkdirSync(cloudypadDir, { recursive: true });
  }
  fs.writeFileSync(awsCredsPath, JSON.stringify(profiles, null, 2), 'utf8');
}

function applyAwsCredentialToSystem(cred) {
  const awsDir = path.join(os.homedir(), '.aws');
  if (!fs.existsSync(awsDir)) {
    fs.mkdirSync(awsDir, { recursive: true });
  }
  const credPath = path.join(awsDir, 'credentials');
  const configPath = path.join(awsDir, 'config');

  let credContent = `[default]\naws_access_key_id = ${cred.accessKeyId}\naws_secret_access_key = ${cred.secretAccessKey}\n`;
  if (cred.sessionToken) {
    credContent += `aws_session_token = ${cred.sessionToken}\n`;
  }
  const configContent = `[default]\nregion = ${cred.region}\n`;

  fs.writeFileSync(credPath, credContent, { mode: 0o600 });
  fs.writeFileSync(configPath, configContent, { mode: 0o600 });
}

router.get('/aws-profiles', (req, res) => {
  try {
    const profiles = getAwsProfiles().map(p => ({
      profileName: p.profileName,
      accessKeyId: p.accessKeyId,
      region: p.region,
      arn: p.arn,
      isActive: p.isActive
    }));
    res.json(profiles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/aws-profiles/add', async (req, res) => {
  const { profileName, accessKeyId, secretAccessKey, region, sessionToken } = req.body;
  if (!profileName || !accessKeyId || !secretAccessKey || !region) {
    return res.status(400).json({ ok: false, error: "profileName, accessKeyId, secretAccessKey, region are required" });
  }

  try {
    const verifyRes = await verifyCredentials({ accessKeyId, secretAccessKey, region, sessionToken });
    if (!verifyRes.ok) {
      return res.status(401).json({ ok: false, error: `AWS Verification failed: ${verifyRes.error}` });
    }

    const profiles = getAwsProfiles();
    if (profiles.find(p => p.profileName === profileName)) {
      return res.status(400).json({ ok: false, error: "Profile name already exists" });
    }

    const isFirst = profiles.length === 0;
    const newCred = {
      profileName,
      accessKeyId,
      secretAccessKey,
      region,
      sessionToken: sessionToken || '',
      arn: verifyRes.identity.Arn || 'Unknown ARN',
      isActive: isFirst
    };

    profiles.push(newCred);
    saveAwsProfiles(profiles);

    if (isFirst) {
      applyAwsCredentialToSystem(newCred);
    }

    res.json({ ok: true, profile: { profileName, accessKeyId, region, arn: newCred.arn, isActive: isFirst } });
  } catch (err) {
    res.status(500).json({ ok: false, error: sanitize(err.message) });
  }
});

router.post('/aws-profiles/:name/active', (req, res) => {
  try {
    const profiles = getAwsProfiles();
    const target = profiles.find(p => p.profileName === req.params.name);
    if (!target) return res.status(404).json({ ok: false, error: "Profile not found" });

    profiles.forEach(p => p.isActive = (p.profileName === req.params.name));
    saveAwsProfiles(profiles);
    applyAwsCredentialToSystem(target);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: sanitize(err.message) });
  }
});

router.delete('/aws-profiles/:name', (req, res) => {
  try {
    let profiles = getAwsProfiles();
    const targetIndex = profiles.findIndex(p => p.profileName === req.params.name);
    if (targetIndex === -1) return res.status(404).json({ ok: false, error: "Profile not found" });

    const wasActive = profiles[targetIndex].isActive;
    profiles.splice(targetIndex, 1);

    // If active was deleted, make the first one active
    if (wasActive) {
      if (profiles.length > 0) {
        profiles[0].isActive = true;
        applyAwsCredentialToSystem(profiles[0]);
      } else {
        // If no profiles left, clear the system credentials
        const awsDir = require('node:path').join(require('node:os').homedir(), '.aws');
        const credPath = require('node:path').join(awsDir, 'credentials');
        if (require('node:fs').existsSync(credPath)) {
          require('node:fs').unlinkSync(credPath);
        }
      }
    }

    saveAwsProfiles(profiles);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: sanitize(err.message) });
  }
});

router.post('/create', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  const { 
    name = 'gfn-rig', 
    region = 'ap-northeast-2', 
    instanceType = 'g4dn.xlarge', 
    diskSize = 100, 
    costLimit = 40, 
    costEmail = '',
    sunshineUser = 'sunshine',
    sunshinePassword = 'sunshine',
    zone = '',
    rootDiskSize = 30,
    spot = false,
    autostop = true,
    timeout = 600,
    vpc = true
  } = req.body;
  
  const args = [
    'create', 'aws',
    '--name', name,
    '--instance-type', instanceType,
    '--root-disk-size', rootDiskSize.toString(),
    '--data-disk-size', diskSize.toString(),
    '--region', region,
    '--streaming-server', 'sunshine',
    '--sunshine-user', sunshineUser,
    '--sunshine-password', sunshinePassword,
    '--skip-pairing',
    '--yes',
    '--overwrite-existing'
  ];

  if (autostop) {
    args.push('--autostop', '--autostop-timeout', timeout.toString());
  } else {
    args.push('--autostop', 'false');
  }

  if (vpc) {
    args.push('--dedicated-vpc');
  } else {
    // If not creating dedicated VPC, let CloudyPad use the default one.
    // However, some versions of CloudyPad prompt if omitted, but --dedicated-vpc false doesn't work.
    // If user sets to false, we just omit the flag and hope for the best (usually it means they have a default VPC so it won't prompt, or it might prompt).
    // Given our earlier investigation, --dedicated-vpc disables the prompt. If omitted, it might prompt. 
    // We will just omit it if vpc is false.
  }

  args.push('--spot', spot ? 'true' : 'false');

  if (zone) {
    args.push('--zone', zone);
  }

  if (costEmail) {
    args.push('--cost-alert', 'true', '--cost-limit', costLimit.toString(), '--cost-notification-email', costEmail);
  } else {
    args.push('--cost-alert', 'false');
  }

  const cloudypadBin = path.join(os.homedir(), '.cloudypad', 'bin', 'cloudypad');
  res.write(`Executing: ${cloudypadBin} ${args.join(' ')}\n`);

  const child = spawn(cloudypadBin, args, {
    env: { ...process.env, CLOUDYPAD_CONTAINER_NO_TTY: 'true' },
  });

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

router.post('/complete', (req, res) => {
  try {
    if (!fs.existsSync(cloudypadDir)) {
      fs.mkdirSync(cloudypadDir, { recursive: true });
    }
    fs.writeFileSync(flagPath, 'done');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
