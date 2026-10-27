// From @infogata/socialgata-plugin-typings once a release carries it; drop this
// then. Hosts that predate it reject the call.
declare global {
  interface Application {
    isPageContextAvailable(): Promise<boolean>;
  }
}

export {};
