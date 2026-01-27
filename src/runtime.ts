let wechatyRuntime: any = null;

export function setWechatyRuntime(runtime: any): void {
  wechatyRuntime = runtime;
}

export function getWechatyRuntime(): any {
  if (!wechatyRuntime) {
    throw new Error("Wechaty runtime not initialized");
  }
  return wechatyRuntime;
}
