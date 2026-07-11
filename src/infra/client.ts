import { api, isTauri } from "./tauriApi";
import { mockApi } from "./mockApi";

export const client = isTauri() ? api : mockApi;
