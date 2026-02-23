export type GatewayConfig = {
  name: string;
  url: string; // ws://host:port
  token?: string;
  deviceToken?: string;
  password?: string;
};

export type GatewayHealth = {
  name: string;
  url: string;
  status: "healthy" | "unhealthy" | "unknown";
  latencyMs?: number;
  serverVersion?: string;
  availableMethods?: string[];
  error?: string;
};

// OpenClaw gateway WebSocket protocol frames
export type RequestFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

export type ResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    retryable?: boolean;
    retryAfterMs?: number;
  };
};

export type EventFrame = {
  type: "event";
  event: string;
  payload?: unknown;
  seq?: number;
};

export type GatewayFrame = RequestFrame | ResponseFrame | EventFrame;

export type ConnectParams = {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    displayName?: string;
    version: string;
    platform: string;
    mode: string;
  };
  auth?: {
    token?: string;
    deviceToken?: string;
    password?: string;
  };
};

export type HelloOk = {
  type: "hello-ok";
  protocol: number;
  server: {
    version: string;
    connId: string;
  };
  features: {
    methods: string[];
    events: string[];
  };
  policy: {
    maxPayload: number;
    maxBufferedBytes: number;
    tickIntervalMs: number;
  };
};
