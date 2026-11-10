declare module 'mammoth/mammoth.browser' {
  interface MammothOptions {
    arrayBuffer: ArrayBuffer;
  }
  interface MammothResult {
    value: string;
    messages: unknown[];
  }
  const mammoth: {
    extractRawText(options: MammothOptions): Promise<MammothResult>;
  };
  export default mammoth;
}

declare module '*?url' {
  const src: string;
  export default src;
}
