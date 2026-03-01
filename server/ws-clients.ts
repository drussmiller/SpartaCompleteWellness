import { WebSocket } from "ws";

export const clients = new Map<number, Set<WebSocket>>();
