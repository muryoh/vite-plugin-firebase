import fs from "fs";
import path from "path";
import { ViteDevServer } from "vite";
// @ts-ignore
import { setupLoggers } from 'firebase-tools/lib/utils.js';
// @ts-ignore
import { getProjectDefaultAccount } from 'firebase-tools/lib/auth.js';
// @ts-ignore
import { Config } from 'firebase-tools/lib/config.js';
// @ts-ignore
import { setActiveAccount } from 'firebase-tools/lib/auth.js';
import {
  materializeAll,
  ensureApi,
// @ts-ignore
} from 'firebase-tools/lib/functionsConfig.js';
// @ts-ignore
import { requireAuth } from 'firebase-tools/lib/requireAuth.js';
import {
  startAll,
  cleanShutdown,
// @ts-ignore
} from 'firebase-tools/lib/emulator/controller.js';

export interface FirebasePluginOptions {
  projectId: string | ((server: ViteDevServer) => string)
  root?: string
  materializeConfig?: boolean
}

export default function firebasePlugin({projectId, root, materializeConfig}: FirebasePluginOptions) {
  return {
    name: "vite:firebase",
    async configureServer(server: ViteDevServer) {
      if (server.config.command !== 'serve') return;
      const projectDir = root || server.config.root;
      if (!process.env.IS_FIREBASE_CLI) {
        process.env.IS_FIREBASE_CLI = 'true';
        setupLoggers();
      }
      if (typeof projectId !== 'string') projectId = projectId(server);
      const account = getProjectDefaultAccount(projectDir);
      const options = {
        projectId,
        projectDir,
        nonInteractive: true,
        account,
        only: 'hosting,functions',
        targets: ['hosting', 'functions']
      };
      // @ts-ignore
      options.config = Config.load(options);
      setActiveAccount(options, account);
      if (materializeConfig) {
        await requireAuth(options);
        await ensureApi(options);
        const settings = await materializeAll(projectId);
        // TODO get path from firebase config ?
        await fs.promises.writeFile(
          path.join(projectDir, 'functions/deploy/.runtimeconfig.json'),
          JSON.stringify(settings)
        );
      }
      await startAll(options, false);

      // patch server.close to close emulators as well
      const { close } = server;
      server.close = async () => {
        await Promise.all([close(), cleanShutdown()]);
      }
    },
  };
}
