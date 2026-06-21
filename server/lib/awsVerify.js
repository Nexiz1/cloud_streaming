const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// 제출된 키로 직접 검증(저장 전에 유효성 확인 가능)
async function verifyCredentials({ accessKeyId, secretAccessKey, sessionToken, region }) {
  try {
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
    const client = new STSClient({
      region: region || 'ap-northeast-2',
      credentials: { accessKeyId, secretAccessKey, ...(sessionToken ? { sessionToken } : {}) }
    });
    const id = await client.send(new GetCallerIdentityCommand({}));
    return { ok: true, identity: { Account: id.Account, Arn: id.Arn, UserId: id.UserId } };
  } catch (err) {
    return { ok: false, error: sanitize(err.message) };
  }
}

// ~/.aws 의 default 프로파일을 SDK 기본 체인으로 검증(이미 저장돼 있는 경우)
async function verifyExistingChain(region) {
  try {
    const { STSClient, GetCallerIdentityCommand } = require('@aws-sdk/client-sts');
    const client = new STSClient({ region: region || 'ap-northeast-2' }); // 기본 자격증명 체인이 ~/.aws 읽음
    const id = await client.send(new GetCallerIdentityCommand({}));
    return { ok: true, identity: { Account: id.Account, Arn: id.Arn } };
  } catch (err) {
    // If not found or import failed, fallback happens at the caller
    throw err;
  }
}

// SDK 자체가 없거나 import 실패 시 폴백: ~/.aws/credentials 형식 확인만
function fileFormatFallback() {
  const credPath = path.join(os.homedir(), '.aws', 'credentials');
  if (!fs.existsSync(credPath)) return { ok: false, error: 'No ~/.aws/credentials found' };
  
  try {
    const txt = fs.readFileSync(credPath, 'utf-8');
    const hasDefault = /\[default\]/.test(txt) && /aws_access_key_id/.test(txt) && /aws_secret_access_key/.test(txt);
    return hasDefault
      ? { ok: true, identity: { Arn: '(format-checked, not live-verified)' }, degraded: true }
      : { ok: false, error: 'Malformed ~/.aws/credentials' };
  } catch (e) {
    return { ok: false, error: sanitize(e.message) };
  }
}

function sanitize(msg) {
  // 혹시 모를 키 노출 방지: AKIA로 시작하는 토큰/긴 시크릿 패턴 마스킹
  return String(msg)
    .replace(/AKIA[0-9A-Z]{8,}/g, 'AKIA****')
    .replace(/[A-Za-z0-9/+=]{40,}/g, '****');
}

module.exports = { verifyCredentials, verifyExistingChain, fileFormatFallback, sanitize };
