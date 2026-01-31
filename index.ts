import type { ClawdbotPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { wechatyPlugin } from "./src/channel.js";
import { setWechatyRuntime } from "./src/runtime.js";

const plugin = {
  id: "wechaty",
  name: "Wechaty",
  description: "Wechaty channel plugin for multi-platform IM support (Feishu, Lark etc.)",
  configSchema: emptyPluginConfigSchema(),
  register(api: ClawdbotPluginApi) {
    setWechatyRuntime(api.runtime);
    api.registerChannel({ plugin: wechatyPlugin });
  },
};

export default plugin;
