# 클라우드 스트리밍 클론 (Cloud Streaming Clone)

GeForce NOW 같은 **클라우드 게임 스트리밍 서비스를 자체 호스팅(self-hosted)으로 구현한 클론**입니다. Electron, Express, WSL, 그리고 [CloudyPad](https://github.com/PierreBeucher/cloudypad)를 사용해, AWS의 GPU 인스턴스를 켜고/끄고/스트리밍하는 과정을 하나의 데스크톱 앱에서 관리합니다.

Windows에서 도는 Electron 앱이 인터페이스와 스트리밍 클라이언트(Moonlight) 역할을 하고, 실제 클라우드 인스턴스 제어는 WSL 안에서 도는 Express 백엔드 + CloudyPad CLI가 담당합니다.

## 아키텍처

Windows의 스트리밍 환경과 Linux 기반 클라우드 인프라를 잇기 위해 역할을 나눕니다.

1. **컨트롤 플레인 (WSL 안의 Express 서버)**
   Electron이 시작될 때 `wsl node server/server.js`로 WSL 내부에서 Node/Express 서버를 띄웁니다 (포트 `3000`). 이 서버가 UI 정적 파일과 REST API를 제공하고, **CloudyPad CLI(컨테이너 실행)**를 호출해 AWS 인스턴스를 조회/시작/중지/재시작/삭제합니다.

2. **스트리밍 클라이언트 (Windows의 Electron)**
   컨트롤 플레인(`http://localhost:3000`)의 UI를 로드하고, 게임 스트리밍 시 Windows에서 `moonlight` 프로세스를 직접 실행해 화면을 렌더링합니다. 인스턴스 쪽에서는 Sunshine이 호스트 역할을 합니다.

3. **자동 셋업**
   첫 실행 시 Electron 메인 프로세스가 WSL 설치 여부를 확인하고, 없으면 WSL 안에 Node.js·npm·CloudyPad CLI를 자동으로 설치한 뒤 백엔드를 부팅합니다.

## 요구 사항

- **Windows + WSL2** (백엔드와 CloudyPad CLI가 WSL 안에서 동작)
- **Node.js** (Windows 측 — Electron 클라이언트 실행용)
- **AWS 자격증명** (`~/.aws` 구성)
- **Moonlight 클라이언트** (Windows에 설치)

> WSL 내부의 Node.js와 CloudyPad CLI는 첫 실행 시 셋업 마법사가 자동으로 설치하므로 직접 설치하지 않아도 됩니다.

## 설치 및 실행

Windows 호스트에서 Electron 앱을 실행합니다.

```powershell
npm install
npm start
```

`npm start` 후 앱이 자동으로:

1. WSL 설치 및 동작 여부 확인
2. (필요 시) WSL에 Node.js / npm 설치
3. (필요 시) WSL에 CloudyPad CLI 설치
4. WSL에서 Express 서버 부팅 (`http://localhost:3000`)
5. 서버가 올라오면 메인 UI 로드

를 순서대로 진행합니다.

## 셋업 마법사

인스턴스가 하나도 없으면 앱이 **셋업 마법사(AWS Config)**로 안내합니다. 마법사는 다음을 도와줍니다.

1. **사전 점검**: 컨테이너/WSL 안에서 AWS 자격증명과 CloudyPad 접근을 확인
2. **AWS 인스턴스 생성**: GPU 인스턴스를 프로비저닝하며 진행 로그를 UI에 실시간 스트리밍 *(이 단계부터 실제 AWS 시간당 요금이 발생합니다)*
3. **수동 페어링 & 설치**: Moonlight 페어링, Steam 로그인, 게임 설치 안내
4. **검증**: 백엔드가 인스턴스를 인식하는지, 시작/중지가 정상 동작하는지 확인

> AWS 인증 검증은 외부 `aws` CLI 없이 Node의 `@aws-sdk/client-sts`로 수행합니다.

## Moonlight 페어링 흐름

페어링은 수동(manual) 방식입니다.

1. **Pair Device** 버튼을 누르면 인스턴스의 IP가 표시됩니다.
2. Windows의 Moonlight 앱에서 그 IP로 컴퓨터를 추가하면 **4자리 PIN**이 표시됩니다.
3. 앱에 PIN을 입력하면, 백엔드가 SSH로 인스턴스에 접속해 Sunshine의 로컬 API(`/api/pin`)를 호출하여 페어링을 완료합니다.

## 세션 관리 & 비용 제어

자동 세션 매니저가 불필요한 클라우드 비용을 막습니다.

- `MAX_SLOTS`: 동시 활성 세션 최대 개수 (기본 `1`)
- `IDLE_TIMEOUT_MIN`: 유휴 세션 자동 종료까지의 시간(분) (기본 `10`)
- `MAX_SESSION_MIN`: 세션 최대 지속 시간 상한(분), 요금 폭주 방지 (기본 `120`)

**자동 중지(Auto-Stop)**: Windows에서 Moonlight 스트림이 종료되면 Electron이 컨트롤 플레인에 신호를 보내 인스턴스를 즉시 `stop`시켜 컴퓨팅 비용을 절약합니다.

**백엔드 종료 보장**: Electron 앱을 닫으면 WSL에서 돌던 Express 서버를 graceful 요청 → 프로세스 트리 강제 종료 → WSL 내부 잔여 프로세스 정리 순으로 확실히 종료해, 옛 서버가 포트 3000을 점유한 채 남는 문제를 방지합니다.

## 성능

CloudyPad CLI는 호출마다 컨테이너를 기동하느라 느리기 때문에, 인스턴스 상태 조회를 다음과 같이 최적화했습니다.

- **병렬 조회**: 인스턴스별 상태를 동시에 가져옴
- **stale-while-revalidate 캐시**: 폴링 요청은 캐시로 즉시 응답하고 백그라운드에서 갱신
- **single-flight**: 동시 폴링이 겹쳐도 CLI 중복 실행 방지
- **디스크 캐시**: 마지막 상태를 디스크에 저장해, 앱/서버 재시작 직후에도 첫 화면을 즉시 표시

## 환경 변수

| 변수 | 설명 | 기본값 |
| --- | --- | --- |
| `PORT` | Express 서버 포트 | `3000` |
| `BACKEND_URL` | Electron이 접속할 백엔드 URL | `http://localhost:3000` |
| `CLOUDYPAD_BIN` | CloudyPad 실행 파일 경로 | `~/.cloudypad/bin/cloudypad` |
| `MOONLIGHT_BIN` | Moonlight 실행 파일 경로 (PATH에 없을 때) | `moonlight` |
| `AWS_REGION` | CloudyPad가 사용할 AWS 리전 | `ap-northeast-2` |
| `MAX_SLOTS` | 동시 활성 세션 최대 개수 | `1` |
| `IDLE_TIMEOUT_MIN` | 유휴 세션 자동 종료 시간(분) | `10` |
| `MAX_SESSION_MIN` | 세션 최대 지속 시간(분) | `120` |

## 프로젝트 구조

```
.
├── main.js                 # Electron 메인 프로세스 (WSL 셋업 + 서버 부팅 + Moonlight 실행)
├── preload.js              # Electron preload 브리지
├── server/
│   ├── server.js           # Express 진입점
│   ├── routes/             # games / instances / session / setup API
│   └── lib/awsVerify.js    # @aws-sdk/client-sts 기반 자격증명 검증
├── lib/
│   ├── providers/CloudyPadProvider.js  # CloudyPad CLI 래퍼 + 상태 캐시
│   ├── sessionManager.js   # 세션 슬롯/타임아웃 관리
│   ├── streaming.js        # 스트리밍 헬퍼
│   └── sunshine.js         # Sunshine 연동
├── public/                 # 프론트엔드 (index.html, settings.html, css, js)
└── data/                   # games.json 등 로컬 데이터 (profiles.json은 gitignore)
```

## 주의

AWS GPU 인스턴스 생성·실행은 **실제 시간당 요금**이 발생합니다. 사용 후에는 인스턴스를 중지하거나(autostop) 삭제(destroy)하여 비용을 관리하세요.
