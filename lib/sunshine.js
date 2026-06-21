const fs = require('node:fs');
const path = require('node:path');

function generateSunshineApps(games) {
  return {
    env: {},
    apps: games
      .filter(g => g.steamAppId)
      .map(g => ({
        name: g.title, // games.json title과 정확히 일치해야 함
        detached: [`setsid steam steam://rungameid/${g.steamAppId}`],
        "image-path": g.cover
      }))
  };
}

// games.json을 읽어 apps.json 파일로 써주는 헬퍼 (프로비저닝 스크립트에서 사용)
function writeAppsJson(gamesPath, outPath) {
  const games = JSON.parse(fs.readFileSync(gamesPath, 'utf-8'));
  const appsJson = generateSunshineApps(games);
  fs.writeFileSync(outPath, JSON.stringify(appsJson, null, 2));
  return outPath;
}

module.exports = { generateSunshineApps, writeAppsJson };
