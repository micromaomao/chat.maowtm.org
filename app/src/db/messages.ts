/**
 * This file implements a very simple pub-sub system for sending updates. It is
 * intended to be extended with IPC functionality in the future.
 */

import { EventEmitter } from "node:events";

class MessageQueue extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }
}

export const queue = new MessageQueue();
export const MSG_APP_CONFIG_CHANGE = "app_config_change";
