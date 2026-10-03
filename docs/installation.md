# Installation

## From GitHub

```shell
git clone https://github.com/francescoveryra-dot/IAF-Agent-Bridge.git
cd IAF-Agent-Bridge
npm install
npm run build
node dist/cli.js --version
node dist/cli.js doctor
```

`npm install` installs dependencies. `npm run build` compiles TypeScript to `dist/`. The program you run is `node dist/cli.js`.

## Update

```shell
git pull
npm install
npm run build
```

Restart the MCP host so it loads the new process.

## Uninstall

Remove the server from the host configuration, then delete the clone. This project does not install a background service.

To drop a locally added marketplace:

```shell
claude plugin marketplace remove iaf-agent-bridge
agent plugin marketplace remove iaf-agent-bridge
```

Run only the command for a marketplace you added.

## npm

PUBLISHED. The current package is [`iaf-agent-bridge@1.0.2`](https://www.npmjs.com/package/iaf-agent-bridge).

```shell
npx -y iaf-agent-bridge@1.0.2
```

`1.0.0` remains on the registry and does not include `mcpName`. `1.0.1` and `1.0.2` include it. `1.0.2` is the version registered as latest with the Official MCP Registry.

## Checks a source checkout can run

```shell
npm test
npm run typecheck
node dist/cli.js doctor
```

`npm test` needs Node.js 22 because it type-checks and runs TypeScript tests. The built CLI runs on Node.js 20 or newer.
