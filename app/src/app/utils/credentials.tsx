import { useDebugValue, useEffect, useState, useSyncExternalStore } from "react";

const CREDENTIAL_MANAGER_LS_KEY = "credentials";

export class CredentialManager {
  private _admin_token: string | null = null;
  private _chat_tokens: { chat_id: string, token: string }[] = [];
  _subscribers: (() => void)[] = [];

  constructor() {
    if (window.localStorage.getItem(CREDENTIAL_MANAGER_LS_KEY)) {
      try {
        this.deserialize(JSON.parse(window.localStorage.getItem(CREDENTIAL_MANAGER_LS_KEY)!));
      } catch (e) {
        console.error("Unable to deserialize credentials from local storage:", e)
      }
    } else {
      this.postStateUpdate();
    }
  }

  serialize(): object {
    return {
      admin_token: this._admin_token,
      chat_tokens: this._chat_tokens,
    };
  }

  deserialize(data: object) {
    if (data["admin_token"]) {
      this._admin_token = data["admin_token"];
    }
    if (Array.isArray(data["chat_tokens"])) {
      this._chat_tokens = data["chat_tokens"];
    }
  }

  postStateUpdate() {
    window.localStorage.setItem(CREDENTIAL_MANAGER_LS_KEY, JSON.stringify(this.serialize()));
    for (let sub of this._subscribers) {
      sub();
    }
  }

  get admin_token(): string | null {
    return this._admin_token;
  }
  set admin_token(value: string | null) {
    this._admin_token = value;
    this.postStateUpdate();
  }

  getChatTokenFor(chat_id: string): string | null {
    let f = this._chat_tokens.find((x) => x.chat_id == chat_id);
    if (!f) {
      return null;
    }
    return f.token;
  }

  storeChatToken(chat_id: string, token: string) {
    let existing_entry = this._chat_tokens.find((x) => x.chat_id == chat_id);
    if (existing_entry) {
      existing_entry.token = token;
    } else {
      this._chat_tokens.sort((a, b) => a.chat_id.localeCompare(b.chat_id));
      this._chat_tokens.push({ chat_id, token });
      if (this._chat_tokens.length > 10) {
        this._chat_tokens.splice(0, this._chat_tokens.length - 10);
      }
    }
    this.postStateUpdate();
  }

  get has_admin_auth(): boolean {
    return this._admin_token != null;
  }
}

let cred_manager: CredentialManager | null = null;
if (typeof window != "undefined") {
  cred_manager = new CredentialManager();
}

export function subscribe(callback: () => void): () => void {
  if (!cred_manager._subscribers.includes(callback)) {
    cred_manager._subscribers.push(callback);
  }
  return () => {
    cred_manager._subscribers = cred_manager._subscribers.filter((x) => x !== callback);
  };
}

export function getCredentialManager(): CredentialManager {
  if (typeof window == "undefined") {
    throw new Error("CredentialManager is only available in the browser");
  }
  return cred_manager!;
}

export function useChatCredentials(chat_id: string): string | null {
  useDebugValue(chat_id);
  return useSyncExternalStore(subscribe, () => cred_manager.getChatTokenFor(chat_id));
}

export function useAdminAuthToken(): string | null {
  return useSyncExternalStore(subscribe, () => cred_manager.admin_token);
}
