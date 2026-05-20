declare module "eventsource" {
  export default class EventSource {
    constructor(url: string, options?: { withCredentials?: boolean });
    addEventListener(type: "open" | "error" | "message" | string, listener: (event: { data: string }) => void): void;
    removeEventListener(type: string, listener: (event: { data: string }) => void): void;
    close(): void;
    readonly readyState: number;
    readonly url: string;
  }
}
