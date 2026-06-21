# GeForce Now Clone (Dockerized Architecture)

A self-hosted cloud gaming portal MVP built with Electron, Express, Docker, and Vanilla Web technologies. 
This application provides a GeForce Now-like interface for managing and streaming games from AWS GPU instances managed by [CloudyPad](https://github.com/PierreBeucher/cloudypad).

## Architecture

To bridge the gap between Windows streaming and Linux-based cloud infrastructure, the project splits roles:
1. **Control Plane (Docker Container)**: Runs a Node/Express server based on the `crafteo/cloudypad` Linux image. It natively executes the CloudyPad CLI to start/stop AWS instances, track slots, and serve the API.
2. **Streaming Client (Electron on Windows)**: Loads the UI from the Control Plane and natively spawns the `moonlight-qt` process as a borderless child process on your Windows machine to render the game stream.

## Prerequisites
- Docker & Docker Compose
- Node.js (for running the Electron client)
- CloudyPad CLI installed (for 1-time initial cloud creation)
- AWS Credentials (`~/.aws`) configured
- Moonlight Client installed on Windows

## Setup & Running

### 1. Start the Control Plane
Spin up the Docker container. This will mount your `~/.aws` credentials and `~/.cloudypad` state database (which tracks instances).
**To use the interactive Setup Wizard and actual AWS provision, you MUST use `CP_MODE=real`.**
```bash
# Start in real mode (Recommended for first-time setup)
CP_MODE=real docker compose up -d

# Start in mock mode (UI testing only, no AWS)
docker compose up -d
```

### 2. Start the Electron Client & Setup Wizard
Run the Electron app on your Windows host. It will connect to the container running at `http://localhost:3000`.
```powershell
npm install
npm start
```

### 3. Follow the Setup Wizard
If this is your first time (or you have no instances), the app will automatically redirect you to the **Setup Wizard**.
The wizard will guide you through:
1. **Prerequisites Check**: Verifies AWS credentials and CloudyPad access within the container.
2. **AWS Instance Creation**: Provisions an AWS GPU instance with a live log stream directly in the UI. *(Note: This step incurs actual AWS hourly charges).*
3. **Manual Pair & Install**: Guides you through pairing Moonlight, logging into Steam, and installing your games.
4. **Verification**: Confirms your instance is visible to the backend and tests the Start/Stop functionality to prove the architecture works.

*(Note: AWS authentication verification is performed entirely within Node using `@aws-sdk/client-sts`, eliminating the need for an external `aws` CLI inside the container.)*

## Session Management & Cost Control
This application features an automated Session Manager.
- `MAX_SLOTS`: Maximum concurrent active sessions (default: `1`).
- `IDLE_TIMEOUT_MIN`: Terminates inactive sessions (default: `10`).
- `MAX_SESSION_MIN`: Hard cap on session duration to prevent runaway costs (default: `120`).

**Auto-Stop**: When the Moonlight stream exits on Windows, the Electron client signals the Control Plane to immediately `stop` the instance, saving compute costs.

## Environment Variables
- `CP_MODE`: Set to `real` to use actual CloudyPad CLI. Default is `mock`.
- `BACKEND_URL`: URL of the Control Plane. Default: `http://localhost:3000`.
- `MOONLIGHT_BIN`: Path to Moonlight executable if not in PATH.
- `AWS_REGION`: AWS Region for CloudyPad. Default `ap-northeast-2`.
